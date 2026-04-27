import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";
import {
  REPORT_TYPE_OPTIONS,
  buildRiskSummaryReport,
  buildCdmEventSummaryReport,
  buildPredictionSummaryReport,
  createReportHistoryRow,
  deleteReportHistoryRow,
  fetchReportHistory,
} from "../data/reportsData.js";
import { formatUtc } from "../data/cdmEventData.js";
import "./ReportsPage.css";

const TYPE_BADGE_CLASS = {
  risk_summary: "reports-badge--risk",
  cdm_event_summary: "reports-badge--cdm",
  prediction_summary: "reports-badge--prediction",
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDisplayDate(yyyyMmDd) {
  if (!yyyyMmDd) return "—";
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return d.toISOString().slice(0, 10);
}

function formatMetric(value) {
  const n = safeNumber(value);
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatPercent(value) {
  const n = safeNumber(value);
  if (n == null) return "—";
  const pct = n >= 0 && n <= 1 ? n * 100 : n;
  return `${pct.toFixed(2)}%`;
}

function formatProbability(value) {
  const n = safeNumber(value);
  if (n == null) return "—";
  if (Math.abs(n) < 0.001) return n.toExponential(2);
  return n.toFixed(6);
}

function formatCellValue(key, value) {
  if (value == null || value === "") return "—";
  if (key.includes("date") || key.includes("created_at") || key.includes("tca")) {
    return formatUtc(value);
  }
  if (key.includes("confidence")) return formatPercent(value);
  if (key.includes("probability")) return formatProbability(value);
  if (typeof value === "number") return formatMetric(value);
  return String(value);
}

function reportTypeLabel(type) {
  return REPORT_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? "Report";
}

function slugForReportType(type) {
  if (type === "risk_summary") return "risk-summary";
  if (type === "cdm_event_summary") return "cdm-event-summary";
  if (type === "prediction_summary") return "prediction-summary";
  return "report";
}

function statusToneClass(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "completed") return "reports-status-pill--completed";
  if (v === "failed") return "reports-status-pill--failed";
  if (v === "pending") return "reports-status-pill--pending";
  return "";
}

function summaryEntries(reportType, summary) {
  if (reportType === "risk_summary") {
    return [
      ["Total analyses", formatMetric(summary.total_analyses)],
      ["Actual analyses", formatMetric(summary.actual_analyses)],
      ["Predicted analyses", formatMetric(summary.predicted_analyses)],
      ["High risk", formatMetric(summary.high_risk_count)],
      ["Low risk", formatMetric(summary.low_risk_count)],
      ["Average confidence", formatPercent(summary.average_confidence)],
      ["Average class probability", formatProbability(summary.average_classification_probability)],
      ["Wait", formatMetric(summary.wait_count)],
      ["Maneuver", formatMetric(summary.maneuver_count)],
    ];
  }
  if (reportType === "cdm_event_summary") {
    return [
      ["Total events", formatMetric(summary.total_events)],
      ["Total CDM rows", formatMetric(summary.total_cdm_rows)],
      ["Average CDMs/event", formatMetric(summary.average_cdms_per_event)],
      ["Minimum miss distance", formatMetric(summary.minimum_miss_distance)],
      ["Maximum collision probability", formatProbability(summary.maximum_collision_probability)],
      ["Average relative speed", formatMetric(summary.average_relative_speed)],
    ];
  }
  return [
    ["Total predicted analyses", formatMetric(summary.total_predicted_analyses)],
    ["Average confidence", formatPercent(summary.average_confidence)],
    ["Average predicted miss distance", formatMetric(summary.average_predicted_miss_distance)],
    ["Average predicted relative speed", formatMetric(summary.average_predicted_relative_speed)],
    ["Average overall uncertainty", formatMetric(summary.average_overall_uncertainty)],
    ["High risk predicted", formatMetric(summary.high_risk_predicted_count)],
    ["Low risk predicted", formatMetric(summary.low_risk_predicted_count)],
  ];
}

function normalizeReportRecord(historyRow) {
  const summary = historyRow?.summary_data ?? {};
  const reportData = historyRow?.report_data ?? {};
  return {
    reportName: historyRow?.report_name ?? reportTypeLabel(historyRow?.report_type),
    reportType: historyRow?.report_type ?? "risk_summary",
    startDate: historyRow?.start_date ?? null,
    endDate: historyRow?.end_date ?? null,
    generatedAt: reportData.generated_at ?? historyRow?.created_at ?? null,
    summary,
    tableColumns: Array.isArray(reportData.columns) ? reportData.columns : [],
    tableRows: Array.isArray(reportData.rows) ? reportData.rows : [],
    chartData: Array.isArray(reportData.chart_data) ? reportData.chart_data : [],
  };
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { pushToast } = useToast();

  const [reportType, setReportType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(true);
  const [historyRows, setHistoryRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [emptyStateMessage, setEmptyStateMessage] = useState("");
  const [savedReportRow, setSavedReportRow] = useState(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [openMenuReportId, setOpenMenuReportId] = useState(null);
  const [detailModalRow, setDetailModalRow] = useState(null);
  const selectAllHistoryRef = useRef(null);
  const menuRef = useRef(null);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setHistoryBusy(true);
    try {
      const rows = await fetchReportHistory(user.id);
      setHistoryRows(rows);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
      setHistoryRows([]);
    } finally {
      setHistoryBusy(false);
    }
  }, [pushToast, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    void loadHistory();
  }, [user?.id, loadHistory]);

  const validate = () => {
    const nextErrors = {};
    if (!reportType) nextErrors.reportType = "Report type is required.";
    if (!startDate) nextErrors.startDate = "Start date is required.";
    if (!endDate) nextErrors.endDate = "End date is required.";
    if (startDate && endDate) {
      const s = new Date(`${startDate}T00:00:00.000Z`);
      const e = new Date(`${endDate}T00:00:00.000Z`);
      if (e < s) nextErrors.endDate = "End date must be after or equal to start date.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const savePreviewToHistory = useCallback(async (previewData, fileType = null) => {
    if (!user?.id || !previewData) return null;
    if (savedReportRow) return savedReportRow;
    const payload = {
      report_name: previewData.reportName,
      created_by: user.id,
      report_type: previewData.reportType,
      start_date: previewData.startDate,
      end_date: previewData.endDate,
      status: "completed",
      file_type: fileType,
      summary_data: previewData.summary,
      report_data: {
        generated_at: previewData.generatedAt,
        columns: previewData.tableColumns,
        rows: previewData.tableRows,
        chart_data: previewData.chartData ?? [],
      },
    };
    const inserted = await createReportHistoryRow(payload);
    setSavedReportRow(inserted);
    setHistoryRows((prev) => [inserted, ...prev]);
    return inserted;
  }, [savedReportRow, user?.id]);

  const generateReport = async () => {
    if (!validate() || !user?.id) return;
    setBusy(true);
    setEmptyStateMessage("");
    setPreview(null);
    setSavedReportRow(null);
    try {
      let result;
      if (reportType === "risk_summary") {
        result = await buildRiskSummaryReport(user.id, startDate, endDate);
      } else if (reportType === "cdm_event_summary") {
        result = await buildCdmEventSummaryReport(user.id, startDate, endDate);
      } else {
        result = await buildPredictionSummaryReport(user.id, startDate, endDate);
      }

      if (!result.tableRows.length) {
        setEmptyStateMessage("No data found for the selected date range. Try a wider range.");
        return;
      }

      const generated = {
        ...result,
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
      };
      setPreview(generated);
      await savePreviewToHistory(generated, null);
      pushToast("Report generated successfully.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async (data, type, historyRow = null) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFillColor(12, 18, 34);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 72, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text("SIRIUS", 40, 45);
    doc.setFontSize(12);
    doc.text(data.reportName, 110, 45);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.text(`Report Type: ${reportTypeLabel(data.reportType)}`, 40, 95);
    doc.text(`Date Range: ${toDisplayDate(data.startDate)} to ${toDisplayDate(data.endDate)}`, 40, 112);
    doc.text(`Generated At: ${formatUtc(data.generatedAt)}`, 40, 129);

    const summaryRows = summaryEntries(data.reportType, data.summary);
    autoTable(doc, {
      startY: 150,
      head: [["Summary Metric", "Value"]],
      body: summaryRows,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [32, 77, 255] },
    });

    const tableBody = data.tableRows.map((row) =>
      data.tableColumns.map((col) => formatCellValue(col, row[col])),
    );
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [data.tableColumns.map((c) => c.replace(/_/g, " "))],
      body: tableBody,
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [18, 39, 94] },
      margin: { left: 24, right: 24 },
    });

    const filename = `sirius-${slugForReportType(data.reportType)}-${type}.pdf`;
    doc.save(filename);
    if (preview && data === preview) {
      await savePreviewToHistory(preview, "pdf");
    } else if (historyRow) {
      // keep existing history row; only download action required
    }
    pushToast("Download started.", "success");
  };

  const handleDeleteHistory = async (row) => {
    const ok = window.confirm(
      "This will delete this report history record only. Source CDM and analysis data will not be affected.",
    );
    if (!ok || !user?.id) return;
    try {
      await deleteReportHistoryRow(row, user.id);
      const target = String(row.id ?? row.report_id ?? "");
      setHistoryRows((prev) => prev.filter((r) => String(r.id ?? r.report_id ?? "") !== target));
      if (savedReportRow && String(savedReportRow.id ?? savedReportRow.report_id ?? "") === target) {
        setSavedReportRow(null);
      }
      pushToast("Report history row deleted.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const allHistorySelected =
    historyRows.length > 0 &&
    historyRows.every((row) => selectedHistoryIds.has(String(row.id ?? row.report_id ?? "")));
  const someHistorySelected =
    historyRows.some((row) => selectedHistoryIds.has(String(row.id ?? row.report_id ?? ""))) &&
    !allHistorySelected;

  useEffect(() => {
    const el = selectAllHistoryRef.current;
    if (el) el.indeterminate = someHistorySelected;
  }, [someHistorySelected, allHistorySelected]);

  useEffect(() => {
    if (!openMenuReportId) return;
    const onDocMouseDown = (e) => {
      const root = menuRef.current;
      if (root && !root.contains(e.target)) {
        setOpenMenuReportId(null);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenuReportId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuReportId]);

  const toggleSelectAllHistory = () => {
    setSelectedHistoryIds((prev) => {
      if (!historyRows.length) return new Set();
      const allIds = historyRows.map((row) => String(row.id ?? row.report_id ?? ""));
      if (allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  };

  const toggleSelectHistory = (id) => {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelectedHistory = async () => {
    const ids = [...selectedHistoryIds];
    if (!ids.length || !user?.id) return;
    const ok = window.confirm("Delete selected report history rows?");
    if (!ok) return;
    try {
      const selectedRows = historyRows.filter((r) => ids.includes(String(r.id ?? r.report_id ?? "")));
      await Promise.all(selectedRows.map((row) => deleteReportHistoryRow(row, user.id)));
      setHistoryRows((prev) => prev.filter((r) => !ids.includes(String(r.id ?? r.report_id ?? ""))));
      setSelectedHistoryIds(new Set());
      pushToast("Selected report history rows deleted.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const handleDownloadSelectedHistory = async () => {
    const ids = [...selectedHistoryIds];
    if (!ids.length) return;
    for (const row of historyRows) {
      const id = String(row.id ?? row.report_id ?? "");
      if (!ids.includes(id)) continue;
      const restored = normalizeReportRecord(row);
      await handleDownloadPdf(restored, String(row.report_id ?? row.id ?? "report"), row);
    }
  };

  const summaryCards = useMemo(() => {
    if (!preview) return [];
    return summaryEntries(preview.reportType, preview.summary).map(([label, value]) => ({
      label,
      value,
    }));
  }, [preview]);

  if (authLoading || !user) return null;

  return (
    <DashboardPageLayout
      title="Reports & Analytics"
    >
      <section className="reports-card">
        <h2 className="reports-section-title">Generate Report</h2>
        <div className="reports-form-grid">
          <label className="dash-field">
            <span>Report Type</span>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="dash-select">
              <option value="">Select report type</option>
              {REPORT_TYPE_OPTIONS.map((opt) => (
                <option value={opt.value} key={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.reportType ? <small className="reports-error">{fieldErrors.reportType}</small> : null}
          </label>
          <label className="dash-field">
            <span>Start Date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dash-input" />
            {fieldErrors.startDate ? <small className="reports-error">{fieldErrors.startDate}</small> : null}
          </label>
          <label className="dash-field">
            <span>End Date</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dash-input" />
            {fieldErrors.endDate ? <small className="reports-error">{fieldErrors.endDate}</small> : null}
          </label>
        </div>
        <div className="reports-actions">
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => void generateReport()} disabled={busy}>
            {busy ? "Generating..." : "Generate Report"}
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--ghost"
            disabled={!preview}
            onClick={() => preview && void handleDownloadPdf(preview, String(savedReportRow?.report_id ?? savedReportRow?.id ?? "report"))}
          >
            Download
          </button>
        </div>
      </section>

      {emptyStateMessage ? (
        <section className="reports-empty-state">
          <p>{emptyStateMessage}</p>
        </section>
      ) : null}

      {preview ? (
        <section className="reports-card">
          <div className="reports-preview-head">
            <div>
              <h2 className="reports-section-title">{preview.reportName}</h2>
              <p className="reports-muted">
                {toDisplayDate(preview.startDate)} to {toDisplayDate(preview.endDate)} | Generated {formatUtc(preview.generatedAt)}
              </p>
            </div>
            <span className={`dash-badge reports-type-pill ${TYPE_BADGE_CLASS[preview.reportType] ?? ""}`}>
              {reportTypeLabel(preview.reportType)}
            </span>
          </div>

          <div className="reports-summary-grid">
            {summaryCards.map((card) => (
              <article key={card.label} className="reports-summary-card">
                <p>{card.label}</p>
                <h3>{card.value}</h3>
              </article>
            ))}
          </div>

          {preview.chartData?.length ? (
            <div className="reports-chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={preview.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" stroke="#9fb3d1" />
                  <YAxis stroke="#9fb3d1" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3d6df2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="dash-table-wrap reports-table-wrap">
            <table className="dash-table reports-table">
              <thead>
                <tr>
                  {preview.tableColumns.map((col) => (
                    <th key={col}>{col.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.tableRows.slice(0, 100).map((row, idx) => (
                  <tr key={`${row.assessment_id ?? row.event_id ?? idx}-${idx}`}>
                    {preview.tableColumns.map((col) => (
                      <td key={`${idx}-${col}`}>{formatCellValue(col, row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <></>
      )}

      <section className="reports-card dash-table-section dash-table-section--cdm-events">
        <div className="dash-table-head">
          <h2 className="dash-table-title">
            Report History
            <span className="dash-table-count"> ({historyRows.length})</span>
          </h2>
        </div>
        {historyBusy ? (
          <p className="reports-muted">Loading report history...</p>
        ) : historyRows.length === 0 ? (
          <p className="reports-muted">No report history yet.</p>
        ) : (
          <div
            className={
              selectedHistoryIds.size > 0
                ? "dash-cdm-table-anchor dash-cdm-table-anchor--float"
                : "dash-cdm-table-anchor"
            }
          >
            {selectedHistoryIds.size > 0 ? (
              <div
                className="dash-cdm-floating-selection"
                role="toolbar"
                aria-label="Selected reports"
              >
                <span className="dash-cdm-floating-meta" role="status" aria-live="polite">
                  <span className="dash-cdm-floating-count">{selectedHistoryIds.size}</span>
                  <span className="dash-cdm-floating-suffix"> selected</span>
                </span>
                <span className="dash-cdm-floating-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="dash-cdm-floating-btn dash-cdm-floating-btn--danger"
                  onClick={() => void handleDeleteSelectedHistory()}
                >
                  Delete Selected
                </button>
                <button
                  type="button"
                  className="dash-cdm-floating-btn"
                  onClick={() => void handleDownloadSelectedHistory()}
                >
                  Download Selected
                </button>
                <button
                  type="button"
                  className="dash-cdm-floating-btn"
                  onClick={() => setSelectedHistoryIds(new Set())}
                >
                  Clear Selection
                </button>
              </div>
            ) : null}
          <div className="dash-table-wrap reports-table-wrap">
            <table className="dash-table reports-table">
              <thead>
                <tr>
                  <th scope="col" className="dash-table-th--checkbox">
                    <input
                      ref={selectAllHistoryRef}
                      type="checkbox"
                      className="dash-events-checkbox"
                      checked={allHistorySelected && historyRows.length > 0}
                      onChange={toggleSelectAllHistory}
                      aria-label="Select all report history rows"
                    />
                  </th>
                  <th>Report ID</th>
                  <th>Date Generated</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => {
                  const reportId = row.report_id ?? row.id ?? "—";
                  const restored = normalizeReportRecord(row);
                  return (
                    <tr key={String(reportId)}>
                      <td className="dash-table-td--checkbox">
                        <input
                          type="checkbox"
                          className="dash-events-checkbox"
                          checked={selectedHistoryIds.has(String(reportId))}
                          onChange={() => toggleSelectHistory(String(reportId))}
                          aria-label={`Select report ${String(reportId)}`}
                        />
                      </td>
                      <td className="reports-mono">{reportId}</td>
                      <td>{formatUtc(row.created_at)}</td>
                      <td>
                        <span className={`dash-badge reports-type-pill ${TYPE_BADGE_CLASS[row.report_type] ?? ""}`}>
                          {reportTypeLabel(row.report_type)}
                        </span>
                      </td>
                      <td>
                        <span className={`dash-badge reports-status-pill ${statusToneClass(row.status)}`}>
                          {row.status ?? "—"}
                        </span>
                      </td>
                      <td className="dash-table-td--actions dash-table-cell--center">
                        <div className="dash-row-menu-wrap" ref={openMenuReportId === String(reportId) ? menuRef : null}>
                          <button
                            type="button"
                            className="dash-row-menu-trigger"
                            aria-haspopup="menu"
                            aria-expanded={openMenuReportId === String(reportId)}
                            aria-label={`Actions for report ${String(reportId)}`}
                            onClick={() =>
                              setOpenMenuReportId((cur) =>
                                cur === String(reportId) ? null : String(reportId),
                              )
                            }
                          >
                            <span aria-hidden="true">⋮</span>
                          </button>
                          {openMenuReportId === String(reportId) ? (
                            <ul className="dash-row-menu" role="menu" aria-label={`Actions for report ${String(reportId)}`}>
                              <li role="none">
                                <button
                                  type="button"
                                  className="dash-row-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuReportId(null);
                                      setDetailModalRow(row);
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
                                    setOpenMenuReportId(null);
                                    void handleDownloadPdf(restored, String(reportId), row);
                                  }}
                                >
                                  Download
                                </button>
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  className="dash-row-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuReportId(null);
                                    void handleDeleteHistory(row);
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
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </section>
      {detailModalRow ? (
        <ReportDetailsModal
          row={detailModalRow}
          onClose={() => setDetailModalRow(null)}
        />
      ) : null}
    </DashboardPageLayout>
  );
}

function ReportDetailsModal({ row, onClose }) {
  const restored = normalizeReportRecord(row);
  return (
    <div
      className="dash-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-details-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dash-modal">
        <div className="dash-modal-header">
          <h2 id="report-details-title" className="dash-modal-title">
            Report details
          </h2>
          <button type="button" className="dash-modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="dash-modal-meta">
          Report ID: <span className="dash-mono">{String(row.report_id ?? row.id ?? "—")}</span>
        </p>
        <p className="dash-modal-meta">
          Type: <span className="dash-mono">{reportTypeLabel(restored.reportType)}</span>
        </p>
        <p className="dash-modal-meta">
          Date range:{" "}
          <span className="dash-mono">
            {toDisplayDate(restored.startDate)} to {toDisplayDate(restored.endDate)}
          </span>
        </p>
        <h3 className="dash-modal-section-title">Summary</h3>
        <div className="dash-modal-table-wrap">
          <table className="dash-table dash-modal-table">
            <tbody>
              {summaryEntries(restored.reportType, restored.summary).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="dash-modal-section-title">Preview rows</h3>
        <div className="dash-modal-table-wrap">
          <table className="dash-table dash-modal-table">
            <thead>
              <tr>
                {restored.tableColumns.map((col) => (
                  <th key={col}>{col.replace(/_/g, " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {restored.tableRows.slice(0, 20).map((r, idx) => (
                <tr key={String(idx)}>
                  {restored.tableColumns.map((col) => (
                    <td key={`${idx}-${col}`}>{formatCellValue(col, r[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

