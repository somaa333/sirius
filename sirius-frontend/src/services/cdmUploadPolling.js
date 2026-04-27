import { supabase } from "../supabaseClient";

const UPLOAD_SELECT =
  "id, file_name, source_type, status, progress_percent, processed_rows, failed_rows, total_rows, valid_rows, invalid_rows, error_summary, started_at, finished_at, last_heartbeat_at, created_at, worker_id";

/**
 * @typedef {Object} CdmUploadRow
 * @property {string} id
 * @property {string} [file_name]
 * @property {string} [source_type]
 * @property {string} [status]
 * @property {number|null} [progress_percent]
 * @property {number|null} [processed_rows]
 * @property {number|null} [failed_rows]
 * @property {number|null} [total_rows]
 * @property {number|null} [valid_rows]
 * @property {number|null} [invalid_rows]
 * @property {string|null} [error_summary]
 * @property {string|null} [started_at]
 * @property {string|null} [finished_at]
 * @property {string|null} [last_heartbeat_at]
 * @property {string|null} [created_at]
 */

/**
 * Fetch a single `cdm_uploads` row for polling.
 * @param {string} uploadId
 * @returns {Promise<CdmUploadRow | null>}
 */
export async function fetchCdmUploadById(uploadId) {
  const { data, error } = await supabase
    .from("cdm_uploads")
    .select(UPLOAD_SELECT)
    .eq("id", uploadId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to read upload status.");
  }
  return data ?? null;
}

/**
 * Status values that end polling (import finished or failed).
 */
export const TERMINAL_UPLOAD_STATUSES = new Set([
  "completed",
  "completed_with_errors",
  "failed",
]);

/**
 * Poll until status is terminal or shouldAbort returns true.
 * @param {string} uploadId
 * @param {object} options
 * @param {(row: CdmUploadRow) => void} options.onUpdate
 * @param {number} [options.intervalMs]
 * @param {() => boolean} [options.shouldAbort]
 * @returns {Promise<CdmUploadRow | null>}
 */
export function pollCdmUploadUntilTerminal(uploadId, options) {
  const {
    onUpdate,
    intervalMs = 2000,
    shouldAbort = () => false,
  } = options;

  return new Promise((resolve, reject) => {
    let timer = null;
    let settled = false;
    let inFlight = false;

    const cleanup = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const tick = async () => {
      if (settled || inFlight) return;
      if (shouldAbort()) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(null);
        }
        return;
      }
      inFlight = true;
      try {
        const row = await fetchCdmUploadById(uploadId);
        if (!row) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error("Upload record not found."));
          }
          return;
        }
        onUpdate(row);
        const st = String(row.status ?? "").toLowerCase();
        if (TERMINAL_UPLOAD_STATUSES.has(st)) {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(row);
          }
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        inFlight = false;
      }
    };

    tick();
    timer = setInterval(tick, intervalMs);
  });
}
