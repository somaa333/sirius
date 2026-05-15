import { useEffect, useMemo, useState } from "react";
import { formatUtc } from "../../data/cdmEventData.js";
import {
  fetchCdmUploadById,
  fetchCdmValidationErrorsByUploadId,
  fetchCdmUploadJobEventsByUploadId,
} from "../../services/cdmUploadApi.js";
import "./DashboardComponents.css";

const VALIDATION_ERR_PAGE_SIZE = 10;

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string|null} props.uploadId
 * @param {string|null} [props.uploadCode]
 * @param {() => void} props.onClose
 */
export default function CdmValidationErrorsModal({ open, uploadId, uploadCode = null, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [rows, setRows] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [events, setEvents] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [uploadRow, setUploadRow] = useState(/** @type {Record<string, unknown>|null} */ (null));
  const [errPage, setErrPage] = useState(1);

  useEffect(() => {
    if (!open || !uploadId) {
      setRows([]);
      setEvents([]);
      setUploadRow(null);
      setError(null);
      setErrPage(1);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setErrPage(1);
      try {
        const [errList, evList, uploadMeta] = await Promise.all([
          fetchCdmValidationErrorsByUploadId(uploadId),
          fetchCdmUploadJobEventsByUploadId(uploadId),
          fetchCdmUploadById(uploadId),
        ]);
        if (!cancelled) {
          setRows(errList);
          setEvents(evList);
          setUploadRow(uploadMeta ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setRows([]);
          setEvents([]);
          setUploadRow(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, uploadId]);

  const simpleIssueTypes = useMemo(
    () => buildSimpleIssueTypes(uploadRow, events),
    [uploadRow, events],
  );

  const totalErrPages = Math.max(1, Math.ceil(rows.length / VALIDATION_ERR_PAGE_SIZE));
  const safeErrPage = Math.min(errPage, totalErrPages);
  const pagedErrRows = useMemo(() => {
    const start = (safeErrPage - 1) * VALIDATION_ERR_PAGE_SIZE;
    return rows.slice(start, start + VALIDATION_ERR_PAGE_SIZE);
  }, [rows, safeErrPage]);

  if (!open) return null;

  return (
    <div
      className="dash-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cdm-errors-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-modal">
        <div className="dash-modal-header">
          <h2 id="cdm-errors-title" className="dash-modal-title">
            Upload validation &amp; job details
          </h2>
          <button type="button" className="dash-modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="dash-modal-meta">
          Upload ID:{" "}
          <span className="dash-mono">
            {uploadCode ?? inferUploadCode(rows, events, uploadRow) ?? "—"}
          </span>
        </p>

        {loading ? (
          <p className="dash-modal-body">Loading…</p>
        ) : error ? (
          <p className="dash-modal-error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <>
            <h3 className="dash-modal-section-title">Import issues</h3>
            {simpleIssueTypes.length === 0 ? (
              <p className="dash-modal-body dash-import-issue-empty">
                No import-level issues recorded for this upload.
              </p>
            ) : (
              <ul className="dash-import-issue-types">
                {simpleIssueTypes.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}

            <h3 className="dash-modal-section-title">Row-level validation errors</h3>
            <div className="dash-modal-table-wrap">
              <table className="dash-table dash-modal-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Column</th>
                    <th>Code</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="dash-table-empty">
                        No row-level errors recorded for this upload.
                      </td>
                    </tr>
                  ) : (
                    pagedErrRows.map((r, i) => (
                      <tr key={`${r.row_number}-${safeErrPage}-${i}`}>
                        <td className="dash-mono">{String(r.row_number ?? "—")}</td>
                        <td className="dash-mono">{String(r.column_name ?? "—")}</td>
                        <td className="dash-mono">{String(r.error_code ?? "—")}</td>
                        <td>{String(r.error_message ?? "—")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {rows.length > 0 ? (
              <div className="dash-pagination">
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost dash-btn--sm"
                  disabled={safeErrPage <= 1}
                  onClick={() => setErrPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous validation errors page"
                >
                  Previous
                </button>
                <span className="dash-pagination-info">
                  Page {safeErrPage} of {totalErrPages}
                </span>
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost dash-btn--sm"
                  disabled={safeErrPage >= totalErrPages}
                  onClick={() => setErrPage((p) => Math.min(totalErrPages, p + 1))}
                  aria-label="Next validation errors page"
                >
                  Next
                </button>
              </div>
            ) : null}

            <h3 className="dash-modal-section-title">Recent job events</h3>
            <ul className="dash-job-events">
              {events.length === 0 ? (
                <li className="dash-job-events-empty">No job events.</li>
              ) : (
                events.map((ev, i) => (
                  <li key={i} className="dash-job-event">
                    <span className="dash-mono dash-job-event-time">
                      {formatUtc(ev.created_at)}
                    </span>
                    <span className="dash-job-event-type">
                      {String(ev.event_type ?? "—")}
                    </span>
                    <span className="dash-job-event-msg">{String(ev.message ?? "")}</span>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Distinct high-level issue labels only (no long error text).
 * @param {Record<string, unknown>|null|undefined} uploadRow
 * @param {Array<Record<string, unknown>>} events
 * @returns {string[]}
 */
function buildSimpleIssueTypes(uploadRow, events) {
  /** @type {Set<string>} */
  const types = new Set();
  const status = String(uploadRow?.status ?? "").toLowerCase();
  const summaryRaw = uploadRow?.error_summary != null ? String(uploadRow.error_summary).trim() : "";
  const summaryLower = summaryRaw.toLowerCase();

  if (summaryRaw) {
    types.add(categorizePipelineIssue(summaryRaw, null));
  }

  const evList = Array.isArray(events) ? events : [];
  for (const ev of evList) {
    if (!ev || typeof ev !== "object") continue;
    const eventType = String(ev.event_type ?? "");
    if (!shouldIncludeJobEvent(eventType, status)) continue;
    const msg = String(ev.message ?? "").trim();
    if (msg && summaryLower && msg.toLowerCase() === summaryLower) continue;
    types.add(categorizePipelineIssue(msg || "Event", eventType));
  }

  return [...types].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} eventType
 * @param {string} uploadStatus
 */
function shouldIncludeJobEvent(eventType, uploadStatus) {
  const t = eventType.toLowerCase();
  if (t === "processing_started") return false;
  if (t === "completed" && uploadStatus === "completed") return false;
  return true;
}

/**
 * @param {string} message
 * @param {string|null} eventType
 */
function categorizePipelineIssue(message, eventType) {
  const m = message.toLowerCase();
  const t = (eventType ?? "").toLowerCase();

  if (t === "validation_failed" || t === "header_validation_failed") {
    if (/no data|empty|header only|header-only|no rows/i.test(m)) {
      return "Empty or incomplete file";
    }
    return "CSV schema / headers";
  }
  if (/empty|header only|no data rows|no data row|header-only|no rows in csv/i.test(m)) {
    return "Empty or incomplete file";
  }
  if (/too large|maximum|max.*size|file.*size|exceed.*limit|limit.*size/i.test(m)) {
    return "File size";
  }
  if (/\.csv|wrong format|not a csv|mime|content type/i.test(m)) {
    return "File type";
  }
  if (/network|storage|download|upload failed|401|403|object not found/i.test(m)) {
    return "Storage / transfer";
  }
  if (t === "failed") return "Processing error";
  if (t === "completed") return "Completion";
  if (t === "processing_started") return "Job lifecycle";
  return "Import / pipeline";
}

function inferUploadCode(rows, events, uploadRow) {
  if (
    uploadRow &&
    typeof uploadRow === "object" &&
    uploadRow.upload_code != null &&
    String(uploadRow.upload_code).trim() !== ""
  ) {
    return String(uploadRow.upload_code);
  }
  const firstErr = rows?.[0];
  if (
    firstErr &&
    typeof firstErr === "object" &&
    firstErr.upload &&
    typeof firstErr.upload === "object" &&
    "upload_code" in firstErr.upload
  ) {
    return String(
      /** @type {{ upload_code?: unknown }} */ (firstErr.upload).upload_code ?? "",
    );
  }
  const firstEv = events?.[0];
  if (
    firstEv &&
    typeof firstEv === "object" &&
    firstEv.upload &&
    typeof firstEv.upload === "object" &&
    "upload_code" in firstEv.upload
  ) {
    return String(
      /** @type {{ upload_code?: unknown }} */ (firstEv.upload).upload_code ?? "",
    );
  }
  return null;
}
