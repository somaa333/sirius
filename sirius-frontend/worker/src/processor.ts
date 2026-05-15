import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "csv-parse";
import type { JobRow } from "./rpc.js";
import { finishJobRpc, heartbeat, patchUpload, updateProgressRpc } from "./rpc.js";
import { downloadObjectToFile } from "./storage.js";
import { validateHeaderSet } from "./expectedHeaders.js";
import { validateCdmDataRow } from "./validators.js";
import { insertJobEvent } from "./jobEvents.js";
import { supabase } from "./supabaseAdmin.js";
import { config } from "./config.js";

const BATCH = config.batchSize;
const SOURCE = config.sourceType;

type ValErr = {
  upload_id: string;
  row_number: number;
  column_name: string;
  error_code: string;
  error_message: string;
};

function buildParser() {
  return parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

async function streamCountDataRows(filePath: string): Promise<number> {
  const parser = createReadStream(filePath).pipe(buildParser());
  let n = 0;
  for await (const _ of parser) n += 1;
  return n;
}

function mapToRecord(
  row: Record<string, string>,
  uploadId: string,
): Record<string, unknown> {
  const o: Record<string, unknown> = { ...row };
  o.source_type = SOURCE;
  o.upload_id = uploadId;
  const pc = parseFloat(String(row.collision_probability ?? ""));
  if (!Number.isNaN(pc)) {
    o.risk_level = pc >= 0.0001 ? "high" : pc >= 1e-6 ? "medium" : "low";
    o.confidence = pc;
  }
  return o;
}

async function fetchExistingMessageIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("cdm_records")
    .select("message_id")
    .eq("source_type", SOURCE)
    .in("message_id", ids);
  if (error) throw error;
  const s = new Set<string>();
  for (const r of data ?? []) {
    if (r?.message_id != null) s.add(String(r.message_id));
  }
  return s;
}

async function flushValidationErrors(rows: ValErr[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("cdm_validation_errors").insert(rows);
  if (error) throw error;
}

/** Insert rows; on unique violation, retry per-row to attribute duplicates. */
async function insertRowsOrMarkDuplicates(
  uploadId: string,
  rows: Record<string, unknown>[],
  rowNums: number[],
): Promise<{ inserted: number; duplicateErrors: ValErr[] }> {
  if (rows.length === 0) return { inserted: 0, duplicateErrors: [] };
  const { error } = await supabase.from("cdm_records").insert(rows);
  if (!error) return { inserted: rows.length, duplicateErrors: [] };

  const dupErrors: ValErr[] = [];
  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const { error: e2 } = await supabase.from("cdm_records").insert([rows[i]!]);
    if (e2) {
      const code = (e2 as { code?: string }).code;
      if (code === "23505" || String(e2.message).includes("duplicate")) {
        dupErrors.push({
          upload_id: uploadId,
          row_number: rowNums[i]!,
          column_name: "message_id",
          error_code: "DUPLICATE",
          error_message: "Unique violation (likely message_id + source_type)",
        });
      } else {
        throw e2;
      }
    } else {
      inserted += 1;
    }
  }
  return { inserted, duplicateErrors: dupErrors };
}

export async function processCdmJob(job: JobRow): Promise<void> {
  const uploadId = String(job.id);
  const storagePath = String(job.file_path ?? "");
  const tmpPath = join(tmpdir(), `cdm-${uploadId}.csv`);

  await patchUpload(uploadId, {
    status: "processing",
    worker_id: config.workerId,
    started_at: new Date().toISOString(),
  });

  await insertJobEvent(
    uploadId,
    "processing_started",
    "Worker claimed job and began streaming CSV",
    { worker_id: config.workerId },
  );

  let hb: ReturnType<typeof setInterval> | null = null;

  try {
    await downloadObjectToFile(storagePath, tmpPath);

    const totalRows = await streamCountDataRows(tmpPath);
    if (totalRows === 0) {
      await insertJobEvent(
        uploadId,
        "header_validation_failed",
        "No data rows after header",
        null,
      );
      await flushValidationErrors([
        {
          upload_id: uploadId,
          row_number: 0,
          column_name: "csv",
          error_code: "EMPTY_FILE",
          error_message: "No data rows in file",
        },
      ]);
      await finishJobRpc({
        uploadId,
        status: "failed",
        validRows: 0,
        invalidRows: 0,
        totalRows: 0,
        errorSummary: "Empty CSV or header only",
      });
      return;
    }

    await updateProgressRpc({
      uploadId,
      processedRows: 0,
      totalRows,
      failedRows: 0,
      validRows: 0,
      invalidRows: 0,
      progressPercent: 0,
    });

    hb = setInterval(() => {
      heartbeat(uploadId).catch(() => {
        console.error("[processor] heartbeat failed");
      });
    }, config.heartbeatMs);

    const parser = createReadStream(tmpPath).pipe(buildParser());

    let headerOk = false;
    let rowNum = 0;
    let validCount = 0;
    let invalidCount = 0;
    let processed = 0;

    let pendingErr: ValErr[] = [];
    let pendingInsert: Record<string, unknown>[] = [];
    let pendingRowNums: number[] = [];

    const pushProgress = async () => {
      const pct =
        totalRows > 0
          ? Math.min(99, Math.floor((processed / totalRows) * 100))
          : 0;
      await updateProgressRpc({
        uploadId,
        processedRows: processed,
        totalRows,
        failedRows: invalidCount,
        validRows: validCount,
        invalidRows: invalidCount,
        progressPercent: pct,
      });
    };

    const flushErr = async () => {
      if (pendingErr.length === 0) return;
      const chunk = pendingErr.splice(0, pendingErr.length);
      await flushValidationErrors(chunk);
      await insertJobEvent(
        uploadId,
        "validation_error_batch_written",
        `Wrote ${chunk.length} validation error row(s)`,
        { count: chunk.length },
      );
    };

    const flushInsert = async () => {
      if (pendingInsert.length === 0) return;
      const chunk = pendingInsert.splice(0, BATCH);
      const nums = pendingRowNums.splice(0, BATCH);
      const mids = chunk
        .map((r) => String(r.message_id ?? "").trim())
        .filter(Boolean);
      const existing = await fetchExistingMessageIds(mids);
      const toInsert: Record<string, unknown>[] = [];
      const toNums: number[] = [];
      for (let i = 0; i < chunk.length; i++) {
        const mid = String(chunk[i]!.message_id ?? "").trim();
        if (mid && existing.has(mid)) {
          invalidCount += 1;
          pendingErr.push({
            upload_id: uploadId,
            row_number: nums[i]!,
            column_name: "message_id",
            error_code: "DUPLICATE",
            error_message: "message_id already exists for this source_type",
          });
        } else {
          toInsert.push(chunk[i]!);
          toNums.push(nums[i]!);
          if (mid) existing.add(mid);
        }
      }
      if (pendingErr.length) await flushErr();

      if (toInsert.length) {
        const { inserted, duplicateErrors } = await insertRowsOrMarkDuplicates(
          uploadId,
          toInsert,
          toNums,
        );
        validCount += inserted;
        invalidCount += duplicateErrors.length;
        if (duplicateErrors.length) pendingErr.push(...duplicateErrors);
        if (duplicateErrors.length) await flushErr();
        await insertJobEvent(
          uploadId,
          "batch_imported",
          `Processed batch: ${inserted} inserted`,
          { attempted: toInsert.length, inserted },
        );
      }
      await pushProgress();
    };

    for await (const record of parser) {
      const row = record as Record<string, string>;

      if (!headerOk) {
        headerOk = true;
        const cols = Object.keys(row);
        const hv = validateHeaderSet(cols);
        if (!hv.ok) {
          await insertJobEvent(
            uploadId,
            "header_validation_failed",
            `Header mismatch: missing ${hv.missing.length}, extra ${hv.extra.length}`,
            { missing: hv.missing, extra: hv.extra },
          );
          const headerErrs: ValErr[] = [];
          for (const m of hv.missing) {
            headerErrs.push({
              upload_id: uploadId,
              row_number: 0,
              column_name: m,
              error_code: "MISSING_HEADER",
              error_message: "Expected column missing from CSV",
            });
          }
          for (const e of hv.extra) {
            headerErrs.push({
              upload_id: uploadId,
              row_number: 0,
              column_name: e,
              error_code: "EXTRA_HEADER",
              error_message: "Unexpected column in CSV",
            });
          }
          await flushValidationErrors(headerErrs);
          await finishJobRpc({
            uploadId,
            status: "failed",
            errorSummary: `CSV headers do not match CDM schema (${hv.missing.length} missing, ${hv.extra.length} extra)`,
          });
          return;
        }
      }

      rowNum += 1;
      const issues = validateCdmDataRow(row, rowNum);
      if (issues.length) {
        invalidCount += 1;
        for (const iss of issues) {
          pendingErr.push({
            upload_id: uploadId,
            row_number: rowNum,
            column_name: iss.column_name,
            error_code: iss.error_code,
            error_message: iss.error_message,
          });
        }
      } else {
        pendingInsert.push(mapToRecord(row, uploadId));
        pendingRowNums.push(rowNum);
      }

      processed += 1;

      if (pendingErr.length >= BATCH) await flushErr();
      if (pendingInsert.length >= BATCH) await flushInsert();
      if (processed % BATCH === 0) await pushProgress();
    }

    await flushErr();
    while (pendingInsert.length > 0) await flushInsert();
    await pushProgress();

    await patchUpload(uploadId, {
      progress_percent: 100,
      last_heartbeat_at: new Date().toISOString(),
    });

    await finishJobRpc({
      uploadId,
      status: "validated",
      validRows: validCount,
      invalidRows: invalidCount,
      totalRows: rowNum,
      errorSummary: null,
    });

    await insertJobEvent(uploadId, "completed", "Import finished successfully", {
      validRows: validCount,
      invalidRows: invalidCount,
      totalRows: rowNum,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[processor] CDM import job failed:", msg);
    await insertJobEvent(uploadId, "failed", msg, null);
    await finishJobRpc({
      uploadId,
      status: "failed",
      errorSummary: msg.slice(0, 2000),
    });
  } finally {
    if (hb) clearInterval(hb);
    await unlink(tmpPath).catch(() => {});
  }
}
