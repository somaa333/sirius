import { supabase } from "./supabaseAdmin.js";

export type JobRow = Record<string, unknown> & { id: string; file_path: string };

export async function claimNextJob(): Promise<JobRow | null> {
  const { data, error } = await supabase.rpc("claim_next_cdm_upload_job");
  if (error) throw error;
  if (data == null) return null;
  return (Array.isArray(data) ? data[0] : data) as JobRow | null;
}

export type ProgressRpcParams = {
  uploadId: string;
  processedRows: number;
  totalRows: number | null;
  failedRows: number;
  validRows: number;
  invalidRows: number;
  progressPercent: number;
};

/** Calls DB RPC; falls back to direct table patch if RPC signature differs. */
export async function updateProgressRpc(p: ProgressRpcParams): Promise<void> {
  const { error } = await supabase.rpc("update_cdm_upload_progress", {
    p_upload_id: p.uploadId,
    p_processed_rows: p.processedRows,
    p_total_rows: p.totalRows,
    p_failed_rows: p.failedRows,
    p_progress_percent: p.progressPercent,
    p_valid_rows: p.validRows,
    p_invalid_rows: p.invalidRows,
  });
  if (!error) return;
  await patchUpload(p.uploadId, {
    processed_rows: p.processedRows,
    total_rows: p.totalRows,
    failed_rows: p.failedRows,
    progress_percent: p.progressPercent,
    valid_rows: p.validRows,
    invalid_rows: p.invalidRows,
    last_heartbeat_at: new Date().toISOString(),
  });
}

export async function patchUpload(
  uploadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("cdm_uploads")
    .update(patch)
    .eq("id", uploadId);
  if (error) throw error;
}

export async function heartbeat(uploadId: string): Promise<void> {
  await patchUpload(uploadId, {
    last_heartbeat_at: new Date().toISOString(),
  });
}

export type FinishParams = {
  uploadId: string;
  status: "validated" | "failed";
  validRows?: number | null;
  invalidRows?: number | null;
  totalRows?: number | null;
  errorSummary?: string | null;
};

export async function finishJobRpc(p: FinishParams): Promise<void> {
  const { error } = await supabase.rpc("finish_cdm_upload_job", {
    p_upload_id: p.uploadId,
    p_status: p.status,
    p_valid_rows: p.validRows ?? null,
    p_invalid_rows: p.invalidRows ?? null,
    p_total_rows: p.totalRows ?? null,
    p_error_summary: p.errorSummary ?? null,
  });
  if (!error) return;
  await patchUpload(p.uploadId, {
    status: p.status,
    valid_rows: p.validRows ?? null,
    invalid_rows: p.invalidRows ?? null,
    total_rows: p.totalRows ?? null,
    error_summary: p.errorSummary ?? null,
    finished_at: new Date().toISOString(),
    progress_percent: 100,
  });
}
