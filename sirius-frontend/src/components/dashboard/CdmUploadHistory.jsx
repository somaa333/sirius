import { useEffect, useMemo, useRef, useState } from "react";
import "./DashboardComponents.css";

/**
 * @param {object} props
 * @param {Array<Record<string, unknown>>} props.rows
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 * @param {string|null} [props.selectedUploadId]
 * @param {(id: string) => void} props.onViewValidationErrors
 */
export default function CdmUploadHistory({
  rows,
  loading = false,
  error = null,
  selectedUploadId = null,
  onViewValidationErrors,
}) {
  const [pageSize, setPageSize] = useState(
    /** @type {5 | 10 | 20} */ (10),
  );
  const [page, setPage] = useState(1);
  const [openMenuUploadId, setOpenMenuUploadId] = useState(
    /** @type {string | null} */ (null),
  );
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  useEffect(() => {
    if (!openMenuUploadId) return;
    const onDocMouseDown = (e) => {
      const root = menuRef.current;
      if (root && !root.contains(/** @type {Node} */ (e.target))) {
        setOpenMenuUploadId(null);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenuUploadId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuUploadId]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  return (
    <section className="dash-upload-history" aria-label="CDM Upload History">
      <div className="dash-upload-history-head">
        <h2 className="dash-upload-history-title">
          CDM Upload History
          <span className="dash-table-count"> ({rows.length})</span>
        </h2>
      </div>

      {error ? (
        <p className="dash-upload-history-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="dash-upload-history-wrap">
        <table className="dash-table dash-upload-history-table">
          <thead>
            <tr>
              <th scope="col">Upload ID</th>
              <th scope="col">File name</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Rows</th>
              <th scope="col">Progress</th>
              <th scope="col">Valid / invalid</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="dash-table-empty">
                  Loading uploads…
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="dash-table-empty">
                  No uploads yet.
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => {
                const id = String(r.id ?? "");
                const selected = selectedUploadId === id;
                return (
                  <tr
                    key={id}
                    className={`dash-table-row ${selected ? "dash-upload-row--selected" : ""}`}
                  >
                    <td className="dash-mono">
                      {id ? (
                        <button
                          type="button"
                          className="dash-link dash-link--id"
                          onClick={() => onViewValidationErrors(id)}
                          aria-label={`View details for upload ${String(r.upload_code ?? id)}`}
                        >
                          {String(r.upload_code ?? "—")}
                        </button>
                      ) : (
                        String(r.upload_code ?? "—")
                      )}
                    </td>
                    <td className="dash-mono">{String(r.file_name ?? "—")}</td>
                    <td>
                      <span
                        className={`dash-badge dash-badge--status dash-badge--status-${getUploadStatusTone(
                          r.status,
                        )}`}
                      >
                        {formatStatusText(r.status)}
                      </span>
                    </td>
                    <td className="dash-mono">{formatTs(r.created_at)}</td>
                    <td className="dash-mono">{formatTotalRows(r.total_rows)}</td>
                    <td>
                      {r.progress_percent != null
                        ? `${Number(r.progress_percent).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="dash-mono">
                      {formatPair(r.valid_rows, r.invalid_rows)}
                    </td>
                    <td className="dash-table-td--actions dash-table-cell--center">
                      <div
                        className="dash-row-menu-wrap"
                        ref={openMenuUploadId === id ? menuRef : null}
                      >
                        <button
                          type="button"
                          className="dash-row-menu-trigger"
                          aria-haspopup="menu"
                          aria-expanded={openMenuUploadId === id}
                          aria-label={`Actions for upload ${String(r.upload_code ?? id)}`}
                          onClick={() =>
                            setOpenMenuUploadId((cur) => (cur === id ? null : id))
                          }
                        >
                          <span aria-hidden="true">⋮</span>
                        </button>
                        {openMenuUploadId === id ? (
                          <ul
                            className="dash-row-menu"
                            role="menu"
                            aria-label={`Actions for upload ${String(r.upload_code ?? id)}`}
                          >
                            <li role="none">
                              <button
                                type="button"
                                className="dash-row-menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuUploadId(null);
                                  onViewValidationErrors(id);
                                }}
                              >
                                Details
                              </button>
                            </li>
                          </ul>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 ? (
        <div className="dash-pagination">
          <label className="dash-pagination-rows">
            <select
              className="dash-pagination-rows-select"
              value={String(pageSize)}
              onChange={(e) => setPageSize(/** @type {5 | 10 | 20} */ (Number(e.target.value)))}
            >
              <option value="5">5 rows</option>
              <option value="10">10 rows</option>
              <option value="20">20 rows</option>
            </select>
          </label>
          <button
            type="button"
            className="dash-btn dash-btn--ghost dash-btn--sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="dash-pagination-info">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            className="dash-btn dash-btn--ghost dash-btn--sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatTs(v) {
  if (v == null) return "—";
  const d = new Date(/** @type {string | number} */ (v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function formatPair(a, b) {
  if (a == null && b == null) return "—";
  return `${a ?? "—"} / ${b ?? "—"}`;
}

/** Overall row count from CSV / job (not processed progress). */
function formatTotalRows(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

/**
 * @param {unknown} v
 */
function formatStatusText(v) {
  const s = String(v ?? "").trim();
  return s || "—";
}

/**
 * Maps upload status to a color tone class.
 * @param {unknown} v
 * @returns {'success' | 'warning' | 'danger' | 'pending' | 'neutral'}
 */
function getUploadStatusTone(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "neutral";
  if (["completed", "imported", "done", "success", "succeeded"].includes(s)) {
    return "success";
  }
  if (["failed", "error", "rejected", "cancelled"].includes(s)) {
    return "danger";
  }
  if (["queued", "pending", "uploaded", "processing", "running", "validating"].includes(s)) {
    return "pending";
  }
  if (["partial", "completed_with_errors", "warning"].includes(s)) {
    return "warning";
  }
  return "neutral";
}
