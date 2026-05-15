import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";
import {
  REPORT_TYPE_OPTIONS,
  buildRiskSummaryReport,
  buildCdmEventSummaryReport,
  createReportHistoryRow,
  deleteReportHistoryRow,
  deleteReportHistoryRows,
  fetchReportHistory,
  getReportDisplayId,
  getReportHistoryRowKey,
  updateReportHistoryFileType,
} from "../data/reportsData.js";
import { formatUtc } from "../data/cdmEventData.js";
import { FileCheck, X } from "lucide-react";
import "./ReportsPage.css";

const TYPE_BADGE_CLASS = {
  risk_summary: "reports-badge--risk",
  cdm_event_summary: "reports-badge--cdm",
  prediction_summary: "reports-badge--legacy",
};

/** Labels for rows saved before prediction report removal */
const LEGACY_REPORT_LABELS = {
  prediction_summary: "Prediction Summary",
};

const RISK_COLUMN_HEADERS = {
  assessment_id: "Assessment ID",
  event_id: "Event ID",
  analysis_type: "Type",
  risk_level: "Risk Level",
  confidence: "Confidence",
  recommended_decision: "Decision",
  created_at: "Date",
};

const CDM_COLUMN_HEADERS = {
  event_id: "Event ID",
  cdms_in_event: "CDM Count",
  first_cdm_creation: "First Creation Date",
  latest_cdm_creation: "Latest Creation Date",
  latest_tca: "Latest TCA",
  minimum_miss_distance: "Min Miss Distance",
  maximum_collision_probability: "Max Collision Probability",
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

function formatAnalysisType(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return "—";
  if (s === "actual") return "Actual";
  if (s === "predicted") return "Predicted";
  return String(value);
}

function columnHeader(reportType, col) {
  if (reportType === "risk_summary") return RISK_COLUMN_HEADERS[col] ?? col.replace(/_/g, " ");
  if (reportType === "cdm_event_summary") return CDM_COLUMN_HEADERS[col] ?? col.replace(/_/g, " ");
  return col.replace(/_/g, " ");
}

function formatCellValue(reportType, key, value) {
  if (value == null || value === "") return "—";
  if (key === "analysis_type") return formatAnalysisType(value);
  if (key === "risk_level") return String(value ?? "—");
  if (key === "recommended_decision") return String(value ?? "—");
  if (key.includes("date") || key.includes("created_at") || key.includes("tca")) {
    return formatUtc(value);
  }
  if (key.includes("confidence")) return formatPercent(value);
  if (key.includes("probability")) return formatProbability(value);
  if (typeof value === "number") return formatMetric(value);
  return String(value);
}

function formatCellForCsv(reportType, key, value) {
  return formatCellValue(reportType, key, value);
}

function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function reportTypeLabel(type) {
  return (
    REPORT_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ??
    LEGACY_REPORT_LABELS[type] ??
    "Report"
  );
}

/** Short label for type badges in tables */
function reportTypeBadgeLabel(type) {
  if (type === "risk_summary") return "Risk Summary";
  if (type === "cdm_event_summary") return "CDM Event";
  if (type === "prediction_summary") return "Prediction";
  return reportTypeLabel(type);
}

function slugForReportType(type) {
  if (type === "risk_summary") return "risk-summary";
  if (type === "cdm_event_summary") return "cdm-event-summary";
  return "report";
}

function statusToneClass(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "completed") return "reports-status-pill--completed";
  if (v === "failed") return "reports-status-pill--failed";
  if (v === "pending") return "reports-status-pill--pending";
  return "";
}

function riskSummaryPrimaryEntries(summary) {
  return [
    ["Total analyses", formatMetric(summary.total_analyses)],
    ["Actual analyses", formatMetric(summary.actual_analyses)],
    ["Predicted analyses", formatMetric(summary.predicted_analyses)],
    ["High risk", formatMetric(summary.high_risk_count)],
    ["Low risk", formatMetric(summary.low_risk_count)],
    ["Average confidence", formatPercent(summary.average_confidence)],
  ];
}

function riskDistributionText(summary) {
  const high = safeNumber(summary.high_risk_count) ?? 0;
  const low = safeNumber(summary.low_risk_count) ?? 0;
  const total = high + low;
  if (total === 0) return "No high/low risk rows in this range.";
  const highPct = ((high / total) * 100).toFixed(1);
  const lowPct = ((low / total) * 100).toFixed(1);
  return `High risk ${highPct}% (${formatMetric(high)} of ${formatMetric(total)}) · Low risk ${lowPct}% (${formatMetric(low)} of ${formatMetric(total)})`;
}

function riskDecisionEntries(summary) {
  return [
    ["Maneuver", formatMetric(summary.maneuver_count)],
    ["Wait", formatMetric(summary.wait_count)],
  ];
}

function cdmSummaryPrimaryEntries(summary) {
  return [
    ["Total events", formatMetric(summary.total_events)],
    ["Total CDMs", formatMetric(summary.total_cdm_rows)],
    ["Average CDMs per event", formatMetric(summary.average_cdms_per_event)],
    ["Minimum miss distance", formatMetric(summary.minimum_miss_distance)],
    ["Maximum collision probability", formatProbability(summary.maximum_collision_probability)],
  ];
}

function cdmEventInsightsEntries(summary) {
  const largest =
    summary.largest_event_id != null
      ? `${summary.largest_event_id} (${formatMetric(summary.largest_event_cdm_count)} CDMs)`
      : "—";
  const smallest =
    summary.smallest_event_id != null
      ? `${summary.smallest_event_id} (${formatMetric(summary.smallest_event_cdm_count)} CDMs)`
      : "—";
  return [
    ["Largest event (highest CDM count)", largest],
    ["Smallest event", smallest],
    ["Average relative speed", formatMetric(summary.average_relative_speed)],
  ];
}

/** Full summary list for legacy prediction rows and modal detail tables */
function summaryEntries(reportType, summary) {
  if (reportType === "risk_summary") {
    return [
      ...riskSummaryPrimaryEntries(summary),
      ["Distribution", riskDistributionText(summary)],
      ...riskDecisionEntries(summary),
      ["Average class probability", formatProbability(summary.average_classification_probability)],
    ];
  }
  if (reportType === "cdm_event_summary") {
    return [...cdmSummaryPrimaryEntries(summary), ...cdmEventInsightsEntries(summary)];
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

const PDF_BG = [15, 23, 42];
const PDF_CARD = [30, 41, 59];
const PDF_ACCENT = [61, 109, 242];
const PDF_TEXT = [241, 245, 249];
const PDF_MUTED = [148, 163, 184];

/**
 * Full-bleed background for structured PDFs. autoTable adds pages via `addPage`;
 * those pages default to white unless we paint them.
 * @param {jsPDF} doc
 */
function pdfFillStructuredPageBackground(doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...PDF_BG);
  doc.rect(0, 0, pageW, pageH, "F");
}

/**
 * @param {jsPDF} doc
 * @param {number} y
 * @param {string} title
 */
function pdfSectionBar(doc, y, title) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_CARD);
  doc.roundedRect(36, y, pageW - 72, 20, 4, 4, "F");
  doc.setTextColor(...PDF_TEXT);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, 46, y + 13);
  doc.setFont("helvetica", "normal");
  return y + 28;
}

/**
 * @param {jsPDF} doc
 * @param {Record<string, unknown>} data
 */
function renderStructuredPdf(doc, data) {
  const pageW = doc.internal.pageSize.getWidth();
  pdfFillStructuredPageBackground(doc);

  const origAddPage = doc.addPage.bind(doc);
  doc.addPage = function addPageWithBackground(...args) {
    const out = origAddPage(...args);
    pdfFillStructuredPageBackground(this);
    return out;
  };

  try {
  doc.setFillColor(12, 18, 34);
  doc.rect(0, 0, pageW, 48, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("SIRIUS", 40, 32);
  doc.setFont("helvetica", "normal");

  let y = 64;
  const summary = data.summary ?? {};

  if (data.reportType === "risk_summary") {
    y = pdfSectionBar(doc, y, "Summary statistics");
    const gridBody = riskSummaryPrimaryEntries(summary);
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: gridBody,
      theme: "plain",
      styles: { fillColor: PDF_CARD, textColor: PDF_TEXT, fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: PDF_ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [51, 65, 85] },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 16;

    y = pdfSectionBar(doc, y, "Distribution");
    doc.setTextColor(...PDF_TEXT);
    doc.setFontSize(10);
    doc.text(riskDistributionText(summary), 40, y + 6);
    y += 28;

    y = pdfSectionBar(doc, y, "Decisions");
    autoTable(doc, {
      startY: y,
      head: [["Decision", "Count"]],
      body: riskDecisionEntries(summary),
      theme: "plain",
      styles: { fillColor: PDF_CARD, textColor: PDF_TEXT, fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: PDF_ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 16;
  } else if (data.reportType === "cdm_event_summary") {
    y = pdfSectionBar(doc, y, "Summary statistics");
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: cdmSummaryPrimaryEntries(summary),
      theme: "plain",
      styles: { fillColor: PDF_CARD, textColor: PDF_TEXT, fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: PDF_ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [51, 65, 85] },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 16;

    y = pdfSectionBar(doc, y, "Event insights");
    autoTable(doc, {
      startY: y,
      head: [["Insight", "Value"]],
      body: cdmEventInsightsEntries(summary),
      theme: "plain",
      styles: { fillColor: PDF_CARD, textColor: PDF_TEXT, fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: PDF_ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 16;
  } else {
    y = pdfSectionBar(doc, y, "Summary statistics");
    const legacyBody = summaryEntries(data.reportType, summary).map(([k, v]) => [k, v]);
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: legacyBody,
      theme: "plain",
      styles: { fillColor: PDF_CARD, textColor: PDF_TEXT, fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: PDF_ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [51, 65, 85] },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  y = pdfSectionBar(doc, y, "Data table");
  const headers = data.tableColumns.map((c) => columnHeader(data.reportType, c));
  const body = data.tableRows.map((row) =>
    data.tableColumns.map((col) => formatCellForCsv(data.reportType, col, row[col])),
  );
  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: "striped",
    styles: { fillColor: PDF_CARD, textColor: PDF_TEXT, fontSize: 8, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: PDF_ACCENT, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [51, 65, 85] },
    margin: { left: 28, right: 28 },
    tableWidth: "auto",
  });
  } finally {
    doc.addPage = origAddPage;
  }
}

function PreviewTableCell({ reportType, col, value }) {
  if (reportType === "risk_summary" && col === "risk_level") {
    const v = String(value ?? "").trim().toLowerCase();
    if (v === "high") {
      return <span className="dash-badge dash-badge--high">{String(value ?? "—")}</span>;
    }
    if (v === "low") {
      return <span className="dash-badge dash-badge--low">{String(value ?? "—")}</span>;
    }
  }
  return formatCellValue(reportType, col, value);
}

function PreviewTable({ reportType, tableColumns, tableRows, maxRows = 100 }) {
  const slice = tableRows.slice(0, maxRows);
  return (
    <div className="dash-table-wrap reports-preview-table-wrap">
      <table className="dash-table reports-table reports-preview-table">
        <thead>
          <tr>
            {tableColumns.map((col) => (
              <th key={col}>{columnHeader(reportType, col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row, idx) => (
            <tr key={`${row.assessment_id ?? row.event_id ?? idx}-${idx}`}>
              {tableColumns.map((col) => (
                <td key={`${idx}-${col}`}>
                  <PreviewTableCell reportType={reportType} col={col} value={row[col]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportPreviewSections({ data, tableMaxRows = 100 }) {
  const summary = data.summary ?? {};
  if (data.reportType === "risk_summary") {
    return (
      <>
        <h3 className="reports-preview-section-title">Summary statistics</h3>
        <div className="reports-summary-grid">
          {riskSummaryPrimaryEntries(summary).map(([label, value]) => (
            <article key={label} className="reports-summary-card">
              <p>{label}</p>
              <h3>{value}</h3>
            </article>
          ))}
        </div>
        <h3 className="reports-preview-section-title">Distribution</h3>
        <p className="reports-distribution-text">{riskDistributionText(summary)}</p>
        <h3 className="reports-preview-section-title">Decisions</h3>
        <div className="reports-decisions-row">
          {riskDecisionEntries(summary).map(([label, value]) => (
            <article key={label} className="reports-summary-card reports-summary-card--decision">
              <p>{label}</p>
              <h3>{value}</h3>
            </article>
          ))}
        </div>
        <h3 className="reports-preview-section-title">Table</h3>
        <PreviewTable
          reportType={data.reportType}
          tableColumns={data.tableColumns}
          tableRows={data.tableRows}
          maxRows={tableMaxRows}
        />
      </>
    );
  }
  if (data.reportType === "cdm_event_summary") {
    return (
      <>
        <h3 className="reports-preview-section-title">Summary statistics</h3>
        <div className="reports-summary-grid">
          {cdmSummaryPrimaryEntries(summary).map(([label, value]) => (
            <article key={label} className="reports-summary-card">
              <p>{label}</p>
              <h3>{value}</h3>
            </article>
          ))}
        </div>
        <h3 className="reports-preview-section-title">Event insights</h3>
        <div className="reports-insights-list">
          {cdmEventInsightsEntries(summary).map(([label, value]) => (
            <div key={label} className="reports-insights-row">
              <span className="reports-insights-label">{label}</span>
              <span className="reports-insights-value">{value}</span>
            </div>
          ))}
        </div>
        <h3 className="reports-preview-section-title">Table</h3>
        <PreviewTable
          reportType={data.reportType}
          tableColumns={data.tableColumns}
          tableRows={data.tableRows}
          maxRows={tableMaxRows}
        />
      </>
    );
  }
  return (
    <>
      <h3 className="reports-preview-section-title">Summary statistics</h3>
      <div className="reports-summary-grid">
        {summaryEntries(data.reportType, summary).map(([label, value]) => (
          <article key={label} className="reports-summary-card">
            <p>{label}</p>
            <h3>{value}</h3>
          </article>
        ))}
      </div>
      <h3 className="reports-preview-section-title">Table</h3>
      <PreviewTable
        reportType={data.reportType}
        tableColumns={data.tableColumns}
        tableRows={data.tableRows}
        maxRows={tableMaxRows}
      />
    </>
  );
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
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [emptyStateMessage, setEmptyStateMessage] = useState("");
  const [savedReportRow, setSavedReportRow] = useState(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [openMenuReportId, setOpenMenuReportId] = useState(null);
  const [detailModalRow, setDetailModalRow] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(
    /** @type {10 | 50 | 100} */ (10),
  );
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

  useEffect(() => {
    setHistoryPage(1);
  }, [historyRows.length, historyPageSize]);

  const totalHistoryPages = Math.max(1, Math.ceil(historyRows.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const pagedHistoryRows = useMemo(() => {
    const start = (safeHistoryPage - 1) * historyPageSize;
    return historyRows.slice(start, start + historyPageSize);
  }, [historyRows, safeHistoryPage, historyPageSize]);

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
    setPreviewExpanded(false);
    try {
      let result;
      if (reportType === "risk_summary") {
        result = await buildRiskSummaryReport(user.id, startDate, endDate);
      } else if (reportType === "cdm_event_summary") {
        result = await buildCdmEventSummaryReport(user.id, startDate, endDate);
      } else {
        pushToast("Select a valid report type.", "error");
        return;
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
      setSuccessPulse(true);
      window.setTimeout(() => setSuccessPulse(false), 900);
      pushToast("Report generated successfully.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async (data, typeSlug, historyRow = null) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    renderStructuredPdf(doc, data);
    const filename = `sirius-${slugForReportType(data.reportType)}-${typeSlug}.pdf`;
    doc.save(filename);
    if (user?.id && historyRow) {
      await updateReportHistoryFileType(historyRow, "pdf", user.id);
    } else if (user?.id && preview && data === preview && savedReportRow) {
      await updateReportHistoryFileType(savedReportRow, "pdf", user.id);
    }
    pushToast("PDF download started.", "success");
  };

  const handleDownloadCsv = async (data, typeSlug, historyRow = null) => {
    const headers = data.tableColumns.map((c) => columnHeader(data.reportType, c));
    const lines = [
      headers.map(escapeCsvCell).join(","),
      ...data.tableRows.map((row) =>
        data.tableColumns
          .map((col) => escapeCsvCell(formatCellForCsv(data.reportType, col, row[col])))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sirius-${slugForReportType(data.reportType)}-${typeSlug}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (user?.id && historyRow) {
      await updateReportHistoryFileType(historyRow, "csv", user.id);
    } else if (user?.id && preview && data === preview && savedReportRow) {
      await updateReportHistoryFileType(savedReportRow, "csv", user.id);
    }
    pushToast("CSV download started.", "success");
  };

  const handleDeleteHistory = async (row) => {
    const ok = window.confirm(
      "This will delete this report history record only. Source CDM and analysis data will not be affected.",
    );
    if (!ok || !user?.id) return;
    try {
      await deleteReportHistoryRow(row, user.id);
      const target = getReportHistoryRowKey(row);
      setHistoryRows((prev) => prev.filter((r) => getReportHistoryRowKey(r) !== target));
      if (savedReportRow && getReportHistoryRowKey(savedReportRow) === target) {
        setSavedReportRow(null);
      }
      pushToast("Report history row deleted.", "success");
      await loadHistory();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const allHistorySelected =
    historyRows.length > 0 &&
    historyRows.every((row) => selectedHistoryIds.has(getReportHistoryRowKey(row)));
  const someHistorySelected =
    historyRows.some((row) => selectedHistoryIds.has(getReportHistoryRowKey(row))) &&
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
      const allIds = historyRows.map((row) => getReportHistoryRowKey(row));
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
      const selectedRows = historyRows.filter((r) => ids.includes(getReportHistoryRowKey(r)));
      await deleteReportHistoryRows(selectedRows, user.id);
      setHistoryRows((prev) => prev.filter((r) => !ids.includes(getReportHistoryRowKey(r))));
      setSelectedHistoryIds(new Set());
      pushToast("Selected report history rows deleted.", "success");
      await loadHistory();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const handleDownloadSelectedHistory = async () => {
    const ids = [...selectedHistoryIds];
    if (!ids.length) return;
    for (const row of historyRows) {
      const id = getReportHistoryRowKey(row);
      if (!ids.includes(id)) continue;
      const restored = normalizeReportRecord(row);
      await handleDownloadPdf(restored, getReportDisplayId(row), row);
    }
  };

  const handleDownloadSelectedHistoryCsv = async () => {
    const ids = [...selectedHistoryIds];
    if (!ids.length) return;
    for (const row of historyRows) {
      const id = getReportHistoryRowKey(row);
      if (!ids.includes(id)) continue;
      const restored = normalizeReportRecord(row);
      await handleDownloadCsv(restored, getReportDisplayId(row), row);
    }
  };

  const dismissGeneratedReport = () => {
    setPreview(null);
    setPreviewExpanded(false);
    setSuccessPulse(false);
  };

  const previewRowCount = preview?.tableRows?.length ?? 0;
  const previewSlug = savedReportRow ? getReportDisplayId(savedReportRow) : "report";

  if (authLoading || !user) return null;

  return (
    <DashboardPageLayout
      title="Reports"
    >
      <section id="generate-report" className="reports-card">
        <h2 className="reports-section-title">Generate Report</h2>
        <div className="reports-form-grid">
          <label className="dash-field">
            <span>Report Type</span>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="dash-select"
              disabled={busy}
            >
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
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="dash-input"
              disabled={busy}
            />
            {fieldErrors.startDate ? <small className="reports-error">{fieldErrors.startDate}</small> : null}
          </label>
          <label className="dash-field">
            <span>End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="dash-input"
              disabled={busy}
            />
            {fieldErrors.endDate ? <small className="reports-error">{fieldErrors.endDate}</small> : null}
          </label>
        </div>
        <div className="reports-actions">
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => void generateReport()} disabled={busy}>
            {busy ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </section>

      {emptyStateMessage ? (
        <section className="reports-empty-state">
          <p>{emptyStateMessage}</p>
        </section>
      ) : null}

      {preview ? (
        <>
          <section
            className={`reports-ready-card reports-card ${successPulse ? "reports-ready-card--pulse" : ""}`}
            aria-live="polite"
          >
            <button
              type="button"
              className="reports-ready-dismiss"
              onClick={dismissGeneratedReport}
              aria-label="Dismiss report summary"
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="reports-ready-card__badge" aria-hidden="true">
              <FileCheck className="reports-ready-icon" size={26} strokeWidth={1.75} />
            </div>
            <div className="reports-ready-card__body">
              <h2 className="reports-ready-card__title">Report Ready</h2>
              <dl className="reports-ready-meta">
                <div>
                  <dt>Report name</dt>
                  <dd>{preview.reportName}</dd>
                </div>
                <div>
                  <dt>Report type</dt>
                  <dd>
                    <span className={`dash-badge reports-type-pill ${TYPE_BADGE_CLASS[preview.reportType] ?? ""}`}>
                      {reportTypeBadgeLabel(preview.reportType)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Date range</dt>
                  <dd>
                    {toDisplayDate(preview.startDate)} → {toDisplayDate(preview.endDate)}
                  </dd>
                </div>
                <div>
                  <dt>Total rows</dt>
                  <dd>{formatMetric(previewRowCount)}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{formatUtc(preview.generatedAt)}</dd>
                </div>
              </dl>
            </div>
            <div className="reports-ready-card__actions">
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={busy}
                onClick={() => void handleDownloadPdf(preview, previewSlug)}
              >
                Download PDF
              </button>
              <button
                type="button"
                className="dash-btn reports-btn-secondary"
                disabled={busy}
                onClick={() => void handleDownloadCsv(preview, previewSlug)}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                disabled={busy}
                aria-expanded={previewExpanded}
                onClick={() => setPreviewExpanded((v) => !v)}
              >
                {previewExpanded ? "Hide preview" : "Preview Report"}
              </button>
            </div>
          </section>

          <div className={previewExpanded ? "reports-collapsible reports-collapsible--open" : "reports-collapsible"}>
            <div className="reports-collapsible__measure">
              <section className="reports-card reports-preview-shell">
                <ReportPreviewSections data={preview} />
              </section>
            </div>
          </div>
        </>
      ) : null}

      <section
        id="report-history"
        className="reports-card dash-table-section dash-table-section--cdm-events reports-history-section"
      >
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
                  Download PDF
                </button>
                <button
                  type="button"
                  className="dash-cdm-floating-btn"
                  onClick={() => void handleDownloadSelectedHistoryCsv()}
                >
                  Download CSV
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
                  <th scope="col" className="dash-table-cell--center">
                    Report ID
                  </th>
                  <th scope="col" className="dash-table-cell--center">
                    Report Name
                  </th>
                  <th scope="col" className="dash-table-cell--center">
                    Date Generated
                  </th>
                  <th scope="col" className="dash-table-cell--center">
                    Type
                  </th>
                  <th scope="col" className="dash-table-cell--center">
                    Status
                  </th>
                  <th scope="col" className="dash-table-cell--center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedHistoryRows.map((row) => {
                  const rowKey = getReportHistoryRowKey(row);
                  const reportId = getReportDisplayId(row);
                  const restored = normalizeReportRecord(row);
                  const statusRaw = String(row.status ?? "").trim();
                  const statusLabel =
                    statusRaw.toLowerCase() === "completed"
                      ? "Completed"
                      : statusRaw.toLowerCase() === "failed"
                        ? "Failed"
                        : statusRaw || "—";
                  return (
                    <tr key={rowKey || String(reportId)}>
                      <td className="dash-table-td--checkbox">
                        <input
                          type="checkbox"
                          className="dash-events-checkbox"
                          checked={selectedHistoryIds.has(rowKey)}
                          onChange={() => toggleSelectHistory(rowKey)}
                          aria-label={`Select report ${String(reportId)}`}
                        />
                      </td>
                      <td className="dash-table-cell--center">
                        <button
                          type="button"
                          className="reports-report-id-link"
                          onClick={() => setDetailModalRow(row)}
                        >
                          {String(reportId)}
                        </button>
                      </td>
                      <td className="dash-table-cell--center reports-history-name">
                        {row.report_name ?? "—"}
                      </td>
                      <td className="dash-table-cell--center dash-mono">{formatUtc(row.created_at)}</td>
                      <td className="dash-table-cell--center">
                        <span className={`dash-badge reports-type-pill ${TYPE_BADGE_CLASS[row.report_type] ?? ""}`}>
                          {reportTypeBadgeLabel(row.report_type)}
                        </span>
                      </td>
                      <td className="dash-table-cell--center">
                        <span className={`dash-badge reports-status-pill ${statusToneClass(row.status)}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="dash-table-td--actions dash-table-cell--center">
                        <div className="dash-row-menu-wrap" ref={openMenuReportId === rowKey ? menuRef : null}>
                          <button
                            type="button"
                            className="dash-row-menu-trigger"
                            aria-haspopup="menu"
                            aria-expanded={openMenuReportId === rowKey}
                            aria-label={`Actions for report ${String(reportId)}`}
                            onClick={() =>
                              setOpenMenuReportId((cur) => (cur === rowKey ? null : rowKey))
                            }
                          >
                            <span aria-hidden="true">⋮</span>
                          </button>
                          {openMenuReportId === rowKey ? (
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
                                  Download PDF
                                </button>
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  className="dash-row-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuReportId(null);
                                    void handleDownloadCsv(restored, String(reportId), row);
                                  }}
                                >
                                  Download CSV
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
          {historyRows.length > 0 ? (
            <div className="dash-pagination">
              <label className="dash-pagination-rows">
                <select
                  className="dash-pagination-rows-select"
                  value={String(historyPageSize)}
                  onChange={(e) =>
                    setHistoryPageSize(/** @type {10 | 50 | 100} */ (Number(e.target.value)))
                  }
                  aria-label="Rows per page"
                >
                  <option value="10">10 rows</option>
                  <option value="50">50 rows</option>
                  <option value="100">100 rows</option>
                </select>
              </label>
              <button
                type="button"
                className="dash-btn dash-btn--ghost dash-btn--sm"
                disabled={safeHistoryPage <= 1}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="dash-pagination-info">
                Page {safeHistoryPage} of {totalHistoryPages}
              </span>
              <button
                type="button"
                className="dash-btn dash-btn--ghost dash-btn--sm"
                disabled={safeHistoryPage >= totalHistoryPages}
                onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          ) : null}
          </div>
        )}
      </section>
      {detailModalRow ? (
        <ReportDetailsModal
          row={detailModalRow}
          onClose={() => setDetailModalRow(null)}
          onDownloadPdf={() =>
            void handleDownloadPdf(
              normalizeReportRecord(detailModalRow),
              getReportDisplayId(detailModalRow),
              detailModalRow,
            )
          }
          onDownloadCsv={() =>
            void handleDownloadCsv(
              normalizeReportRecord(detailModalRow),
              getReportDisplayId(detailModalRow),
              detailModalRow,
            )
          }
        />
      ) : null}
    </DashboardPageLayout>
  );
}

function ReportDetailsModal({ row, onClose, onDownloadPdf, onDownloadCsv }) {
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
      <div className="dash-modal reports-detail-modal">
        <div className="dash-modal-header">
          <h2 id="report-details-title" className="dash-modal-title">
            Report details
          </h2>
          <button type="button" className="dash-modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="reports-detail-meta">
          <p>
            <span className="reports-detail-meta-label">Report name</span>
            <span className="reports-detail-meta-value">{restored.reportName}</span>
          </p>
          <p>
            <span className="reports-detail-meta-label">Report ID</span>
            <span className="reports-detail-meta-value dash-mono">{getReportDisplayId(row)}</span>
          </p>
          <p>
            <span className="reports-detail-meta-label">Type</span>
            <span className={`dash-badge reports-type-pill ${TYPE_BADGE_CLASS[restored.reportType] ?? ""}`}>
              {reportTypeBadgeLabel(restored.reportType)}
            </span>
          </p>
          <p>
            <span className="reports-detail-meta-label">Date range</span>
            <span className="reports-detail-meta-value">
              {toDisplayDate(restored.startDate)} → {toDisplayDate(restored.endDate)}
            </span>
          </p>
          <p>
            <span className="reports-detail-meta-label">Created</span>
            <span className="reports-detail-meta-value">{formatUtc(restored.generatedAt)}</span>
          </p>
        </div>
        <div className="reports-detail-downloads">
          <button type="button" className="dash-btn dash-btn--primary" onClick={onDownloadPdf}>
            Download PDF
          </button>
          <button type="button" className="dash-btn reports-btn-secondary" onClick={onDownloadCsv}>
            Download CSV
          </button>
        </div>
        <div className="reports-detail-scroll">
          <ReportPreviewSections data={restored} tableMaxRows={10} />
        </div>
      </div>
    </div>
  );
}

