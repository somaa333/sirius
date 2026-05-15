import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteCdmEvent,
  deleteCdmEvents,
  exportSelectedEventsCdmsToCsv,
  formatProbability,
  formatUtc,
} from "../../data/cdmEventData.js";
import { useToast } from "../toast/ToastProvider.jsx";
import { TOOLTIP_CDM_EVENTS_TABLE } from "../../constants/helpTooltips.js";
import InfoTooltip from "./InfoTooltip.jsx";
import "./DashboardComponents.css";

/**
 * @param {unknown} err
 */
function errorMessage(err) {
  if (err && typeof err === "object" && "message" in err) {
    return String(/** @type {{ message?: string }} */ (err).message);
  }
  return "Something went wrong. Please try again.";
}

/**
 * @param {unknown} rpcData
 */
function formatDeletedRowsMessage(rpcData) {
  const n = typeof rpcData === "number" ? rpcData : Number(rpcData);
  if (Number.isFinite(n) && n >= 0) {
    return `Removed ${n} CDM row(s). Data refreshed.`;
  }
  return "Deletion completed. Data refreshed.";
}

/**
 * @param {object} props
 * @param {Array<Record<string, unknown> & {
 *   id: string,
 *   timestamp: string,
 *   cdmCount: number,
 *   latestCdm?: Record<string, unknown>,
 *   displayFields?: { key: string, label: string, value: string }[]
 * }>} props.events
 * @param {number[]} props.cdmCountOptions
 * @param {'all' | string} props.cdmCountFilter
 * @param {(v: 'all' | string) => void} props.onCdmCountFilterChange
 * @param {string} props.search
 * @param {(v: string) => void} props.onSearchChange
 * @param {() => Promise<unknown>} [props.onRefreshAfterMutations]
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 * @param {string} [props.emptyMessage]
 * @param {string} props.userId — for exporting CDM rows per selected event
 */
export default function EventsTable({
  events,
  cdmCountOptions = [],
  cdmCountFilter = "all",
  onCdmCountFilterChange,
  search,
  onSearchChange,
  onRefreshAfterMutations,
  loading = false,
  error = null,
  emptyMessage = "No CDM events match the current filters or search.",
  userId,
}) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [pageSize, setPageSize] = useState(
    /** @type {50 | 100 | 500} */ (50),
  );
  const [page, setPage] = useState(1);
  /** Selected event IDs (same as `event_id` / row `id`). */
  const [selectedIds, setSelectedIds] = useState(
    /** @type {Set<string>} */ (new Set()),
  );
  const [openMenuEventId, setOpenMenuEventId] = useState(
    /** @type {string | null} */ (null),
  );
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const selectAllRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const [confirmModal, setConfirmModal] = useState(
    /** @type {null | { mode: 'single'; eventId: string } | { mode: 'bulk'; eventIds: string[] }} */ (
      null
    ),
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState(
    /** @type {string | null} */ (null),
  );

  const eventIdSet = useMemo(() => new Set(events.map((e) => e.id)), [events]);

  useEffect(() => {
    setPage(1);
  }, [events.length, search, cdmCountFilter]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => eventIdSet.has(id)));
      if (next.size !== prev.size) return next;
      for (const id of prev) {
        if (!next.has(id)) return next;
      }
      return prev;
    });
  }, [eventIdSet]);

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedEvents = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return events.slice(start, start + pageSize);
  }, [events, pageSize, safePage]);

  const allFilteredSelected =
    events.length > 0 && events.every((e) => selectedIds.has(e.id));
  const someFilteredSelected =
    events.some((e) => selectedIds.has(e.id)) && !allFilteredSelected;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected, events.length]);

  useEffect(() => {
    if (!openMenuEventId) return;
    const onDocMouseDown = (e) => {
      const root = menuRef.current;
      if (root && !root.contains(/** @type {Node} */ (e.target))) {
        setOpenMenuEventId(null);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenuEventId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuEventId]);

  useEffect(() => {
    if (!confirmModal) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!deleteBusy) {
        setConfirmModal(null);
        setDeleteModalError(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmModal, deleteBusy]);

  const handleView = (id) => {
    navigate(`/dashboard/cdm-events/${encodeURIComponent(id)}`);
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (events.length === 0) return new Set();
      if (events.every((e) => prev.has(e.id))) return new Set();
      return new Set(events.map((e) => e.id));
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runRefresh = useCallback(async () => {
    if (onRefreshAfterMutations) await onRefreshAfterMutations();
  }, [onRefreshAfterMutations]);

  const closeModal = useCallback(() => {
    if (deleteBusy) return;
    setConfirmModal(null);
    setDeleteModalError(null);
  }, [deleteBusy]);

  const handleConfirmDelete = async () => {
    if (!confirmModal) return;
    const snapshot = confirmModal;
    setDeleteBusy(true);
    setDeleteModalError(null);
    try {
      let rpcData;
      if (snapshot.mode === "single") {
        rpcData = await deleteCdmEvent(snapshot.eventId);
      } else {
        rpcData = await deleteCdmEvents(snapshot.eventIds);
      }
      setConfirmModal(null);
      if (snapshot.mode === "bulk") clearSelection();
      else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(snapshot.eventId);
          return next;
        });
      }
      pushToast(formatDeletedRowsMessage(rpcData), "success");
      await runRefresh();
    } catch (err) {
      setDeleteModalError(errorMessage(err));
      pushToast(errorMessage(err), "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const colSpan = 7;
  const selectedCount = selectedIds.size;
  const showSelectionToolbar = selectedCount > 0;
  const selectionActionsDisabled = loading || !!error || exportBusy;

  const handleExportSelected = async () => {
    if (selectedCount === 0 || !userId) return;
    setExportBusy(true);
    try {
      const { rowCount, eventCount } = await exportSelectedEventsCdmsToCsv(
        [...selectedIds],
        userId,
        "selected-cdm-rows.csv",
      );
      pushToast(
        `Exported ${rowCount} CDM row(s) from ${eventCount} event(s) to selected-cdm-rows.csv.`,
        "success",
      );
    } catch (e) {
      pushToast(errorMessage(e), "error");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <section className="dash-table-section dash-table-section--cdm-events">
      <div className="dash-table-head">
        <div>
          <div className="dash-table-title-row">
            <h2 className="dash-table-title">
              CDM Events
              <span className="dash-table-count"> ({events.length})</span>
            </h2>
            <InfoTooltip text={TOOLTIP_CDM_EVENTS_TABLE} label="CDM Events table" wide />
          </div>
        </div>
        <div className="dash-table-toolbar-stack">
          <div className="dash-table-controls dash-table-controls--events">
            <label className="dash-field dash-field--cdm-count">
              <span className="visually-hidden">CDMs in event</span>
              <select
                className="dash-select"
                value={cdmCountFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  onCdmCountFilterChange(v === "all" ? "all" : v);
                }}
                aria-label="Filter by number of CDMs in event"
              >
                <option value="all">All counts</option>
                {cdmCountOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} {n === 1 ? "CDM" : "CDMs"}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-field dash-field--search">
              <span className="visually-hidden">Search events</span>
              <input
                type="search"
                className="dash-input"
                placeholder="Search events…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <div
        className={
          showSelectionToolbar
            ? "dash-cdm-table-anchor dash-cdm-table-anchor--float"
            : "dash-cdm-table-anchor"
        }
      >
        {showSelectionToolbar ? (
          <div
            className="dash-cdm-floating-selection"
            role="toolbar"
            aria-label="Selected events"
          >
            <span
              className="dash-cdm-floating-meta"
              role="status"
              aria-live="polite"
              aria-label={`${selectedCount} events selected`}
            >
              <span className="dash-cdm-floating-count">{selectedCount}</span>
              <span className="dash-cdm-floating-suffix"> selected</span>
            </span>
            <span className="dash-cdm-floating-divider" aria-hidden="true" />
            <button
              type="button"
              className="dash-cdm-floating-btn dash-cdm-floating-btn--danger"
              disabled={selectionActionsDisabled}
              onClick={() =>
                setConfirmModal({
                  mode: "bulk",
                  eventIds: [...selectedIds],
                })
              }
            >
              Delete Selected
            </button>
            <button
              type="button"
              className="dash-cdm-floating-btn"
              disabled={selectionActionsDisabled || !userId}
              onClick={() => void handleExportSelected()}
            >
              {exportBusy ? "Exporting…" : "Export Selected"}
            </button>
            <button
              type="button"
              className="dash-cdm-floating-btn"
              onClick={clearSelection}
            >
              Clear Selection
            </button>
          </div>
        ) : null}
        <div className="dash-table-wrap">
          <table className="dash-table">
          <thead>
            <tr>
              <th scope="col" className="dash-table-th--checkbox">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="dash-events-checkbox"
                  checked={allFilteredSelected && events.length > 0}
                  onChange={toggleSelectAllFiltered}
                  aria-label="Select all events in the current list"
                  disabled={loading || !!error || events.length === 0}
                />
              </th>
              <th scope="col">Event ID</th>
              <th scope="col">Date &amp; time</th>
              <th scope="col" className="dash-table-cell--center">
                CDMs in event
              </th>
              <th scope="col">Latest TCA</th>
              <th scope="col" className="dash-table-cell--center">
                Latest Collision Probability
              </th>
              <th scope="col" className="dash-table-cell--center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={colSpan} className="dash-table-empty">
                  {error}
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={colSpan} className="dash-table-empty">
                  Loading CDM events…
                </td>
              </tr>
            ) : pagedEvents.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="dash-table-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedEvents.map((row) => (
                <tr
                  key={row.id}
                  className={
                    selectedIds.has(row.id)
                      ? "dash-table-row dash-table-row--selected"
                      : "dash-table-row"
                  }
                >
                  <td className="dash-table-td--checkbox">
                    <input
                      type="checkbox"
                      className="dash-events-checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelectOne(row.id)}
                      aria-label={`Select event ${row.id}`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="dash-link dash-link--id"
                      onClick={() => handleView(row.id)}
                    >
                      {row.id}
                    </button>
                  </td>
                  <td className="dash-mono">{formatUtc(row.timestamp)}</td>
                  <td className="dash-mono dash-table-cell--center">
                    {row.cdmCount ?? "—"}
                  </td>
                  <td>{getDisplayField(row, "tca") ?? "—"}</td>
                  <td className="dash-mono dash-table-cell--center">
                    {formatProbability(
                      row.latestCdm && typeof row.latestCdm === "object"
                        ? Number(
                            /** @type {{ collision_probability?: unknown }} */ (row.latestCdm)
                              .collision_probability,
                          )
                        : null,
                    )}
                  </td>
                  <td className="dash-table-td--actions dash-table-cell--center">
                    <div className="dash-row-menu-wrap" ref={openMenuEventId === row.id ? menuRef : null}>
                      <button
                        type="button"
                        className="dash-row-menu-trigger"
                        aria-haspopup="menu"
                        aria-expanded={openMenuEventId === row.id}
                        aria-label={`Actions for event ${row.id}`}
                        onClick={() =>
                          setOpenMenuEventId((cur) =>
                            cur === row.id ? null : row.id,
                          )
                        }
                      >
                        <span aria-hidden="true">⋮</span>
                      </button>
                      {openMenuEventId === row.id ? (
                        <ul
                          className="dash-row-menu"
                          role="menu"
                          aria-label={`Actions for event ${row.id}`}
                        >
                          <li role="none">
                            <button
                              type="button"
                              className="dash-row-menu-item"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuEventId(null);
                                handleView(row.id);
                              }}
                            >
                              Details
                            </button>
                          </li>
                          <li role="none">
                            <button
                              type="button"
                              className="dash-row-menu-item"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuEventId(null);
                                setDeleteModalError(null);
                                setConfirmModal({
                                  mode: "single",
                                  eventId: row.id,
                                });
                              }}
                            >
                              Delete
                            </button>
                          </li>
                        </ul>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
      </div>
      {events.length > 0 ? (
        <div className="dash-pagination">
          <label className="dash-pagination-rows">
            <select
              className="dash-pagination-rows-select"
              value={String(pageSize)}
              onChange={(e) =>
                setPageSize(/** @type {50 | 100 | 500} */ (Number(e.target.value)))
              }
            >
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
              <option value="500">500 rows</option>
            </select>
          </label>
          <button
            type="button"
            className="dash-btn dash-btn--ghost dash-btn--sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
          >
            Next
          </button>
        </div>
      ) : null}

      {confirmModal ? (
        <div
          className="dash-modal-backdrop"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="dash-modal dash-modal--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cdm-delete-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-modal-header">
              <h2 id="cdm-delete-modal-title" className="dash-modal-title">
                {confirmModal.mode === "single"
                  ? "Delete Event"
                  : "Delete Selected Events"}
              </h2>
              <button
                type="button"
                className="dash-modal-close"
                onClick={closeModal}
                disabled={deleteBusy}
              >
                Close
              </button>
            </div>
            <p className="dash-modal-body">
              {confirmModal.mode === "single"
                ? "This action will permanently delete this CDM event, all associated CDM records, and any related analysis data linked to those records. This cannot be undone."
                : "This action will permanently delete the selected CDM events, all associated CDM records, and any related analysis data linked to those records. This cannot be undone."}
            </p>
            {deleteModalError ? (
              <p className="dash-modal-error" role="alert">
                {deleteModalError}
              </p>
            ) : null}
            <div className="dash-modal-footer">
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={closeModal}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                onClick={handleConfirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * @param {Record<string, unknown> & { displayFields?: { key: string, value: string }[] }} row
 * @param {string} key
 */
function getDisplayField(row, key) {
  const fields = Array.isArray(row.displayFields) ? row.displayFields : [];
  return fields.find((f) => f.key === key)?.value ?? null;
}
