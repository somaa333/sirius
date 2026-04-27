import { supabase } from "./supabase.mjs";

/**
 * Adjust argument names here if your SQL functions use different identifiers.
 */
export async function claimNextJob() {
  const { data, error } = await supabase.rpc("claim_next_cdm_upload_job");
  if (error) throw error;
  if (data == null) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function updateProgress(params) {
  const { data, error } = await supabase.rpc("update_cdm_upload_progress", {
    p_upload_id: params.uploadId,
    p_processed_rows: params.processedRows,
    p_total_rows: params.totalRows ?? null,
    p_failed_rows: params.failedRows ?? null,
    p_progress_percent: params.progressPercent ?? null,
  });
  if (error) throw error;
  return data;
}

export async function finishJob(params) {
  const { data, error } = await supabase.rpc("finish_cdm_upload_job", {
    p_upload_id: params.uploadId,
    p_status: params.status,
    p_valid_rows: params.validRows ?? null,
    p_invalid_rows: params.invalidRows ?? null,
    p_total_rows: params.totalRows ?? null,
    p_error_summary: params.errorSummary ?? null,
  });
  if (error) throw error;
  return data;
}
