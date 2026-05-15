import { supabase } from "../supabaseClient";

const UPLOAD_LIST_SELECT =
  "id, upload_code, file_name, source_type, status, progress_percent, processed_rows, failed_rows, total_rows, valid_rows, invalid_rows, error_summary, created_at, started_at, finished_at, last_heartbeat_at, worker_id";

/**
 * Recent uploads for the signed-in operator.
 * @param {string} userId
 * @param {number} [limit]
 */
export async function fetchRecentCdmUploadsForUser(userId, limit = 25) {
  const { data, error } = await supabase
    .from("cdm_uploads")
    .select(UPLOAD_LIST_SELECT)
    .eq("uploaded_by", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load upload history.");
  }
  return data ?? [];
}

const UPLOAD_DETAIL_SELECT =
  "id, upload_code, file_name, status, error_summary, created_at, started_at, finished_at";

/**
 * Single upload row for detail modals (outcome summary, status).
 * @param {string} uploadId
 */
export async function fetchCdmUploadById(uploadId) {
  const { data, error } = await supabase
    .from("cdm_uploads")
    .select(UPLOAD_DETAIL_SELECT)
    .eq("id", uploadId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load upload details.");
  }
  return data;
}

/**
 * Row-level validation errors for an upload.
 * @param {string} uploadId
 */
export async function fetchCdmValidationErrorsByUploadId(uploadId) {
  const { data, error } = await supabase
    .from("cdm_validation_errors")
    .select("row_number, column_name, error_code, error_message, created_at, upload_id, upload:cdm_uploads(upload_code)")
    .eq("upload_id", uploadId)
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load validation errors.");
  }
  return data ?? [];
}

/**
 * Milestone / audit events for an upload job.
 * @param {string} uploadId
 */
export async function fetchCdmUploadJobEventsByUploadId(uploadId) {
  const { data, error } = await supabase
    .from("cdm_upload_job_events")
    .select("event_type, message, details, created_at, upload_id, upload:cdm_uploads(upload_code)")
    .eq("upload_id", uploadId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message || "Failed to load job events.");
  }
  return data ?? [];
}
