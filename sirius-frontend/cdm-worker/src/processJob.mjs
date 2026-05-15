import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "csv-parse";
import { createInterface } from "node:readline";
import { supabase } from "./supabase.mjs";
import { updateProgress, finishJob } from "./rpc.mjs";
import { downloadObjectToFile } from "./storage.mjs";
import { validateDataRow, validateHeaders, REQUIRED_HEADERS } from "./validation.mjs";

const BATCH = 250;
const SOURCE_TYPE = "actual";

async function countApproxDataRows(filePath) {
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  let lines = 0;
  for await (const line of rl) {
    if (String(line).trim().length) lines += 1;
  }
  return Math.max(0, lines - 1);
}

async function insertJobEvent(uploadId, eventType, message, details = null) {
  const { error } = await supabase.from("cdm_upload_job_events").insert({
    upload_id: uploadId,
    event_type: eventType,
    message,
    details,
  });
  if (error) console.error("job event insert failed", error.message);
}

async function fetchExistingMessageIds(messageIds) {
  if (messageIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("cdm_records")
    .select("message_id")
    .eq("source_type", SOURCE_TYPE)
    .in("message_id", messageIds);
  if (error) throw error;
  const set = new Set();
  for (const r of data ?? []) {
    if (r?.message_id != null) set.add(String(r.message_id));
  }
  return set;
}

function buildRecordPayload(row, uploadId) {
  const o = { ...row };
  o.source_type = SOURCE_TYPE;
  o.upload_id = uploadId;
  if (o.collision_probability != null && o.collision_probability !== "") {
    const pc = Number(o.collision_probability);
    if (!Number.isNaN(pc)) {
      o.risk_level = pc >= 0.0001 ? "high" : pc >= 1e-6 ? "medium" : "low";
      o.confidence = pc;
    }
  }
  return o;
}

/**
 * @param {Record<string, unknown>} job
 */
export async function runClaimedJob(job) {
  const uploadId = String(job.id);
  const storagePath = String(job.file_path ?? "");
  const workerId = process.env.WORKER_ID ?? "cdm-worker";
  const tmpPath = join(tmpdir(), `cdm-${uploadId}.csv`);

  await supabase
    .from("cdm_uploads")
    .update({
      status: "processing",
      worker_id: workerId,
      started_at: new Date().toISOString(),
    })
    .eq("id", uploadId);

  await insertJobEvent(
    uploadId,
    "processing_started",
    "Worker started CSV processing",
    { worker_id: workerId },
  );

  try {
    await downloadObjectToFile(storagePath, tmpPath);
    const totalRows = await countApproxDataRows(tmpPath);
    if (totalRows === 0) {
      await finishJob({
        uploadId,
        status: "failed",
        validRows: 0,
        invalidRows: 0,
        totalRows: 0,
        errorSummary: "No data rows in CSV (header only or empty file).",
      });
      return;
    }
    await updateProgress({
      uploadId,
      processedRows: 0,
      totalRows,
      failedRows: 0,
      progressPercent: 0,
    });

    const parser = createReadStream(tmpPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }),
    );

    let headerChecked = false;
    let dataRowNum = 0;
    let validCount = 0;
    let invalidCount = 0;

    /** @type {Array<Record<string, unknown>>} */
    let pendingErr = [];
    /** @type {Array<{ rowNum: number, messageId: string, payload: Record<string, unknown> }>} */
    let pendingValid = [];

    const reportProgress = async () => {
      const processed = validCount + invalidCount;
      const pct =
        totalRows > 0
          ? Math.min(100, Math.round((processed / totalRows) * 100))
          : null;
      await updateProgress({
        uploadId,
        processedRows: processed,
        totalRows,
        failedRows: invalidCount,
        progressPercent: pct,
      });
    };

    const flushErrors = async () => {
      if (pendingErr.length === 0) return;
      const chunk = pendingErr.splice(0, pendingErr.length);
      const { error } = await supabase.from("cdm_validation_errors").insert(chunk);
      if (error) throw error;
    };

    const flushValid = async () => {
      if (pendingValid.length === 0) return;
      const chunk = pendingValid.splice(0, pendingValid.length);
      const mids = chunk.map((c) => c.messageId).filter(Boolean);
      const existing = await fetchExistingMessageIds(mids);
      const toInsert = [];
      for (const p of chunk) {
        if (p.messageId && existing.has(p.messageId)) {
          invalidCount += 1;
          pendingErr.push({
            upload_id: uploadId,
            row_number: p.rowNum,
            column_name: "message_id",
            error_code: "DUPLICATE",
            error_message:
              "message_id already exists for this source_type",
          });
        } else {
          toInsert.push(p.payload);
          if (p.messageId) existing.add(p.messageId);
        }
      }
      if (pendingErr.length) {
        const echunk = pendingErr.splice(0, pendingErr.length);
        const { error: ve } = await supabase
          .from("cdm_validation_errors")
          .insert(echunk);
        if (ve) throw ve;
      }
      if (toInsert.length) {
        const { error: insE } = await supabase
          .from("cdm_records")
          .insert(toInsert);
        if (insE) throw insE;
        validCount += toInsert.length;
      }
      await reportProgress();
    };

    for await (const record of parser) {
      /** @type {Record<string, string>} */
      const row = /** @type {Record<string, string>} */ (record);

      if (!headerChecked) {
        headerChecked = true;
        const hr = validateHeaders(Object.keys(record));
        if (!hr.ok) {
          await insertJobEvent(uploadId, "validation_failed", hr.message, {
            code: hr.code ?? "MISSING_HEADERS",
          });
          await finishJob({
            uploadId,
            status: "failed",
            validRows: 0,
            invalidRows: 0,
            totalRows: 0,
            errorSummary: hr.message,
          });
          return;
        }
      }

      dataRowNum += 1;

      const missingCols = [];
      for (const h of REQUIRED_HEADERS) {
        if (row[h] == null || String(row[h]).trim() === "") {
          missingCols.push(h);
        }
      }
      if (missingCols.length) {
        invalidCount += 1;
        for (const h of missingCols) {
          pendingErr.push({
            upload_id: uploadId,
            row_number: dataRowNum,
            column_name: h,
            error_code: "REQUIRED",
            error_message: "Missing required value",
          });
        }
        if (pendingErr.length >= BATCH) await flushErrors();
        await reportProgress();
        continue;
      }

      const vr = validateDataRow(row, dataRowNum);
      if (!vr.ok) {
        invalidCount += 1;
        pendingErr.push({
          upload_id: uploadId,
          row_number: vr.rowNumber,
          column_name: vr.columnName,
          error_code: vr.errorCode,
          error_message: vr.errorMessage,
        });
        if (pendingErr.length >= BATCH) await flushErrors();
      } else {
        const mid = String(row.message_id ?? "").trim();
        pendingValid.push({
          rowNum: dataRowNum,
          messageId: mid,
          payload: buildRecordPayload(row, uploadId),
        });
        if (pendingValid.length >= BATCH) await flushValid();
      }
    }

    await flushErrors();
    await flushValid();

    await finishJob({
      uploadId,
      status: "validated",
      validRows: validCount,
      invalidRows: invalidCount,
      totalRows: dataRowNum,
      errorSummary: null,
    });

    await insertJobEvent(uploadId, "completed", "Processing completed", {
      validRows: validCount,
      invalidRows: invalidCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("CDM job processing failed:", msg);
    await insertJobEvent(uploadId, "failed", msg, null);
    await finishJob({
      uploadId,
      status: "failed",
      errorSummary: msg,
    });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
