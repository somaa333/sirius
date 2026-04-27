import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";
import { runActualAnalysis, runPredictedAnalysis } from "../services/analysisApi.js";
import RiskTrendChart from "../components/dashboard/RiskTrendChart.jsx";
import RiskDistributionChart from "../components/dashboard/RiskDistributionChart.jsx";
import {
  fetchAnalysisEventSummaries,
  filterEventSummariesByPath,
  fetchRiskAssessments,
  deleteRiskAssessment,
  deleteRiskAssessments,
  getAssessmentRowId,
  getAssessmentPrimaryKey,
  getEventIdFromAssessment,
  getAnalysisType,
  getRiskLevel,
  getConfidence,
  getRecommendedDecision,
} from "../data/analysisData.js";
import { formatUtc } from "../data/cdmEventData.js";
import "./AnalysisPage.css";
import "../components/dashboard/DashboardComponents.css";

/** @param {number | null} conf */
function formatConfidencePct(conf) {
  if (conf == null || !Number.isFinite(conf)) return "—";
  if (conf >= 0 && conf <= 1) return `${(conf * 100).toFixed(1)}%`;
  return `${conf.toFixed(1)}%`;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
function computeStats(rows) {
  let actual = 0;
  let predicted = 0;
  let confSum = 0;
  let confN = 0;
  for (const r of rows) {
    const t = getAnalysisType(r);
    if (t === "actual") actual += 1;
    if (t === "predicted") predicted += 1;
    const status = String(r.status ?? r.assessment_status ?? "").toLowerCase();
    if (status !== "completed") continue;
    const c = getConfidence(r);
    if (c != null && Number.isFinite(c)) {
      confSum += c >= 0 && c <= 1 ? c * 100 : c;
      confN += 1;
    }
  }
  const avgConf = confN === 0 ? null : confSum / confN;
  return {
    total: rows.length,
    actual,
    predicted,
    avgConfidence: avgConf,
  };
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function getAssessmentDetailsIdFromRunResult(payload) {
  if (!payload || typeof payload !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (payload);
  const uuid = record.assessment_uuid;
  if (typeof uuid === "string" && uuid.trim()) return uuid.trim();
  const code = record.assessment_id;
  if (typeof code === "string" && code.trim()) return code.trim();
  return null;
}

export default function AnalysisPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { pushToast } = useToast();
  const selectionZoneRef = useRef(null);

  /** @type {null | 'actual' | 'predicted'} */
  const [path, setPath] = useState(null);
  const [eventSummaries, setEventSummaries] = useState(/** @type {any[]} */ ([]));
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(/** @type {string | null} */ (null));

  const [eventSearch, setEventSearch] = useState("");
  /** @type {'range' | 'exact'} */
  const [cdmFilterMode, setCdmFilterMode] = useState("range");
  /** 'all' or stringified minimum CDM count */
  const [cdmMin, setCdmMin] = useState("all");
  /** 'all' or stringified maximum CDM count */
  const [cdmMax, setCdmMax] = useState("all");
  /** 'all' or stringified exact CDM count */
  const [cdmExact, setCdmExact] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState("");

  const [assessments, setAssessments] = useState(
    /** @type {Array<Record<string, unknown>>} */ ([]),
  );
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentsError, setAssessmentsError] = useState(
    /** @type {string | null} */ (null),
  );

  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState(
    /** @type {'all' | 'actual' | 'predicted'} */ ("all"),
  );
  const [historyRisk, setHistoryRisk] = useState(
    /** @type {'all' | 'High' | 'Low'} */ ("all"),
  );
  const [assessmentsPageSize, setAssessmentsPageSize] = useState(
    /** @type {10 | 50 | 100} */ (10),
  );
  const [assessmentsPage, setAssessmentsPage] = useState(1);
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState(
    /** @type {Set<string>} */ (new Set()),
  );
  const [openAssessmentMenuId, setOpenAssessmentMenuId] = useState(
    /** @type {string | null} */ (null),
  );
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const selectAllAssessmentsRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const [runBusy, setRunBusy] = useState(false);
  const [eventPage, setEventPage] = useState(1);

  const loadEvents = useCallback(async () => {
    if (!user?.id) return;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const summaries = await fetchAnalysisEventSummaries(user.id);
      setEventSummaries(summaries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEventsError(msg);
      setEventSummaries([]);
      pushToast(msg, "error");
    } finally {
      setEventsLoading(false);
    }
  }, [pushToast, user?.id]);

  const loadAssessments = useCallback(async () => {
    if (!user?.id) return;
    setAssessmentsLoading(true);
    setAssessmentsError(null);
    try {
      const rows = await fetchRiskAssessments(user.id);
      setAssessments(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAssessmentsError(msg);
      setAssessments([]);
      pushToast(msg, "error");
    } finally {
      setAssessmentsLoading(false);
    }
  }, [pushToast, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void loadEvents();
    void loadAssessments();
  }, [user, loadEvents, loadAssessments]);

  useEffect(() => {
    if (!path) return;
    const onMouseDown = (ev) => {
      const root = selectionZoneRef.current;
      if (!root) return;
      if (!root.contains(ev.target)) {
        setPath(null);
        setSelectedEventId("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [path]);

  const pathFilteredEvents = useMemo(() => {
    if (!path) return [];
    return filterEventSummariesByPath(path, eventSummaries);
  }, [path, eventSummaries]);

  const availableCdmCounts = useMemo(() => {
    const set = new Set();
    for (const e of pathFilteredEvents) {
      const n = Number(e.cdmCount);
      if (Number.isFinite(n) && n >= 0) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  }, [pathFilteredEvents]);

  const tierMin = cdmMin === "all" ? null : Number(cdmMin);
  const tierMax = cdmMax === "all" ? null : Number(cdmMax);
  const exactCount = cdmExact === "all" ? null : Number(cdmExact);
  const isRangeInvalid = tierMin != null && tierMax != null && tierMin > tierMax;
  const isExactInvalid = exactCount != null && (!Number.isFinite(exactCount) || exactCount < 1);

  useEffect(() => {
    if (cdmMin !== "all") {
      const n = Number(cdmMin);
      if (!Number.isFinite(n) || !availableCdmCounts.includes(n)) setCdmMin("all");
    }
    if (cdmMax !== "all") {
      const n = Number(cdmMax);
      if (!Number.isFinite(n) || !availableCdmCounts.includes(n)) setCdmMax("all");
    }
    if (cdmExact !== "all") {
      const n = Number(cdmExact);
      if (!Number.isFinite(n) || !availableCdmCounts.includes(n)) setCdmExact("all");
    }
  }, [cdmMin, cdmMax, cdmExact, availableCdmCounts]);

  useEffect(() => {
    if (cdmFilterMode === "exact") {
      setCdmMin("all");
      setCdmMax("all");
      return;
    }
    setCdmExact("all");
  }, [cdmFilterMode]);

  const selectableEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    let list = pathFilteredEvents;
    if (cdmFilterMode === "range") {
      if (tierMin != null) {
        list = list.filter((e) => e.cdmCount >= tierMin);
      }
      if (tierMax != null) {
        list = list.filter((e) => e.cdmCount <= tierMax);
      }
      if (isRangeInvalid) {
        // Ignore invalid range safely and keep default list.
        list = pathFilteredEvents;
      }
    } else if (exactCount != null && !isExactInvalid) {
      list = list.filter((e) => e.cdmCount === exactCount);
    }
    if (q) {
      list = list.filter((e) => String(e.id).toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const ta = a.latestCreationDate ?? a.timestamp ?? "";
      const tb = b.latestCreationDate ?? b.timestamp ?? "";
      return String(tb).localeCompare(String(ta));
    });
  }, [
    pathFilteredEvents,
    eventSearch,
    cdmFilterMode,
    tierMin,
    tierMax,
    exactCount,
    isRangeInvalid,
    isExactInvalid,
  ]);

  useEffect(() => {
    setEventPage(1);
  }, [path, eventSearch, cdmFilterMode, cdmMin, cdmMax, cdmExact, selectableEvents.length]);

  const eventsPageSize = 10;
  const eventsTotalPages = Math.max(1, Math.ceil(selectableEvents.length / eventsPageSize));
  const safeEventPage = Math.min(eventPage, eventsTotalPages);
  const pagedSelectableEvents = useMemo(() => {
    const start = (safeEventPage - 1) * eventsPageSize;
    return selectableEvents.slice(start, start + eventsPageSize);
  }, [selectableEvents, safeEventPage]);

  const stats = useMemo(() => computeStats(assessments), [assessments]);
  const avgConfidenceTone =
    stats.avgConfidence == null
      ? ""
      : stats.avgConfidence > 80
        ? "analysis-stat-value--confidence-high"
        : stats.avgConfidence < 60
          ? "analysis-stat-value--confidence-low"
          : "analysis-stat-value--confidence-neutral";

  const distributionData = useMemo(() => {
    const high = assessments.filter((r) => getRiskLevel(r).toLowerCase() === "high").length;
    const low = assessments.filter((r) => getRiskLevel(r).toLowerCase() === "low").length;
    const total = high + low;
    if (total === 0) return [];
    const pct = (n) => Math.round((n / total) * 100);
    return [
      { name: "High risk", value: high, pct: pct(high) },
      { name: "Low risk", value: low, pct: pct(low) },
    ];
  }, [assessments]);

  const trendData = useMemo(() => {
    /** @type {Map<string, {date: string, highRisk: number, lowRisk: number}>} */
    const map = new Map();
    for (const row of assessments) {
      const raw = row.created_at ?? row.createdAt;
      const d = new Date(String(raw ?? ""));
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) {
        map.set(key, { date: key, highRisk: 0, lowRisk: 0 });
      }
      const bucket = map.get(key);
      if (!bucket) continue;
      if (getRiskLevel(row).toLowerCase() === "high") bucket.highRisk += 1;
      else bucket.lowRisk += 1;
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [assessments]);

  const filteredAssessments = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return assessments.filter((row) => {
      const aid = getAssessmentRowId(row) ?? "";
      const eid = getEventIdFromAssessment(row);
      if (historyType !== "all" && getAnalysisType(row) !== historyType) {
        return false;
      }
      if (historyRisk !== "all") {
        const rl = getRiskLevel(row);
        if (rl.toLowerCase() !== historyRisk.toLowerCase()) return false;
      }
      if (q) {
        const hit =
          aid.toLowerCase().includes(q) || eid.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [assessments, historySearch, historyType, historyRisk]);

  useEffect(() => {
    setAssessmentsPage(1);
  }, [historySearch, historyType, historyRisk, filteredAssessments.length, assessmentsPageSize]);

  useEffect(() => {
    setSelectedAssessmentIds((prev) => {
      const validIds = new Set(
        filteredAssessments
          .map((row) => getAssessmentPrimaryKey(row))
          .filter((v) => typeof v === "string" && v.length > 0),
      );
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredAssessments]);

  const totalAssessmentPages = Math.max(
    1,
    Math.ceil(filteredAssessments.length / assessmentsPageSize),
  );
  const safeAssessmentsPage = Math.min(assessmentsPage, totalAssessmentPages);
  const pagedAssessments = useMemo(() => {
    const start = (safeAssessmentsPage - 1) * assessmentsPageSize;
    return filteredAssessments.slice(start, start + assessmentsPageSize);
  }, [filteredAssessments, safeAssessmentsPage, assessmentsPageSize]);

  const allFilteredAssessmentsSelected =
    filteredAssessments.length > 0 &&
    filteredAssessments.every((row) => {
      const id = getAssessmentPrimaryKey(row);
      return id ? selectedAssessmentIds.has(id) : false;
    });
  const someFilteredAssessmentsSelected =
    filteredAssessments.some((row) => {
      const id = getAssessmentPrimaryKey(row);
      return id ? selectedAssessmentIds.has(id) : false;
    }) && !allFilteredAssessmentsSelected;

  useEffect(() => {
    const el = selectAllAssessmentsRef.current;
    if (el) el.indeterminate = someFilteredAssessmentsSelected;
  }, [someFilteredAssessmentsSelected, allFilteredAssessmentsSelected]);

  useEffect(() => {
    if (!openAssessmentMenuId) return;
    const onDocMouseDown = (e) => {
      const root = menuRef.current;
      if (root && !root.contains(/** @type {Node} */ (e.target))) {
        setOpenAssessmentMenuId(null);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenAssessmentMenuId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openAssessmentMenuId]);

  const toggleSelectAllFilteredAssessments = () => {
    setSelectedAssessmentIds((prev) => {
      if (!filteredAssessments.length) return new Set();
      const allIds = filteredAssessments
        .map((row) => getAssessmentPrimaryKey(row))
        .filter((v) => typeof v === "string" && v.length > 0);
      if (allIds.every((id) => prev.has(id))) return new Set();
      return new Set(allIds);
    });
  };

  const toggleSelectAssessment = (id) => {
    setSelectedAssessmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSingleAssessment = async (id) => {
    try {
      await deleteRiskAssessment(id, user.id);
      setSelectedAssessmentIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      pushToast("Assessment deleted.", "success");
      await loadAssessments();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast(msg, "error");
    }
  };

  const handleDeleteSelectedAssessments = async () => {
    const ids = [...selectedAssessmentIds];
    if (!ids.length) return;
    try {
      await deleteRiskAssessments(ids, user.id);
      setSelectedAssessmentIds(new Set());
      pushToast("Selected assessments deleted.", "success");
      await loadAssessments();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast(msg, "error");
    }
  };

  const handleRunAnalysis = async () => {
    if (!path || !selectedEventId || runBusy) return;
    setRunBusy(true);
    try {
      let runResult = null;
      if (path === "actual") {
        runResult = await runActualAnalysis(selectedEventId, user.id);
        pushToast("Actual analysis completed.", "success");
      } else {
        runResult = await runPredictedAnalysis(selectedEventId, user.id);
        pushToast("Predicted analysis completed.", "success");
      }
      await loadAssessments();
      await loadEvents();

      const detailsId = getAssessmentDetailsIdFromRunResult(runResult);
      if (detailsId) {
        navigate(`/analysis/${encodeURIComponent(detailsId)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast(msg, "error");
    } finally {
      setRunBusy(false);
    }
  };

  const handleAssessmentView = (id) => {
    navigate(`/analysis/${encodeURIComponent(id)}`);
  };

  if (authLoading || !user) return null;

  return (
    <DashboardPageLayout
      title="Analysis"
    >
      <section
        className="analysis-selection-zone"
        aria-label="Choose analysis path"
        ref={selectionZoneRef}
      >
      <section className="analysis-path-row">
        <button
          type="button"
          className={`analysis-path-card ${path === "actual" ? "analysis-path-card--active" : ""}`}
          onClick={() => {
            setPath("actual");
            setSelectedEventId("");
            setCdmFilterMode("range");
            setCdmMin("all");
            setCdmMax("all");
            setCdmExact("all");
          }}
        >
          <span className="analysis-path-card-accent" aria-hidden />
          <div className="analysis-path-card-head">
            <h2 className="analysis-path-card-title">Analyze Actual CDMs</h2>
            <span className="analysis-badge analysis-badge--actual">Actual</span>
          </div>
          <p className="analysis-path-card-desc">
            Classify the latest actual CDM using the event history.
          </p>
          <span className="analysis-path-card-cta">
            {path === "actual" ? "Path selected" : "Select path"}
            <span className="analysis-path-card-arrow" aria-hidden>
              →
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`analysis-path-card ${path === "predicted" ? "analysis-path-card--active" : ""}`}
          onClick={() => {
            setPath("predicted");
            setSelectedEventId("");
            setCdmFilterMode("range");
            setCdmMin("all");
            setCdmMax("all");
            setCdmExact("all");
          }}
        >
          <span className="analysis-path-card-accent" aria-hidden />
          <div className="analysis-path-card-head">
            <h2 className="analysis-path-card-title">Predict Next CDM</h2>
            <span className="analysis-badge analysis-badge--predicted">Predicted</span>
          </div>
          <p className="analysis-path-card-desc">
            Predict the next CDM first, then classify the future risk.
          </p>
          <span className="analysis-path-card-cta">
            {path === "predicted" ? "Path selected" : "Select path"}
            <span className="analysis-path-card-arrow" aria-hidden>
              →
            </span>
          </span>
        </button>
      </section>

      {path ? (
        <section className="analysis-panel" aria-label="Select event">
          <header className="analysis-panel-head">
            <h2 className="analysis-panel-title">Select event</h2>
            <p className="analysis-panel-hint">
              {path === "actual"
                ? "Events need at least 1 actual CDM."
                : "Events need at least 3 actual CDMs."}
            </p>
          </header>

          <div className="analysis-filters">
            <label className="analysis-field">
              <span className="analysis-field-label">Search event ID</span>
              <input
                type="search"
                className="analysis-input"
                placeholder="Filter by event id…"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
              />
            </label>
            <label className="analysis-field">
              <span className="analysis-field-label">CDM Count</span>
              <div className="analysis-segment" role="radiogroup" aria-label="CDM count filter mode">
                <button
                  type="button"
                  className={`analysis-segment-btn ${cdmFilterMode === "range" ? "is-active" : ""}`}
                  role="radio"
                  aria-checked={cdmFilterMode === "range"}
                  onClick={() => setCdmFilterMode("range")}
                >
                  Range
                </button>
                <button
                  type="button"
                  className={`analysis-segment-btn ${cdmFilterMode === "exact" ? "is-active" : ""}`}
                  role="radio"
                  aria-checked={cdmFilterMode === "exact"}
                  onClick={() => setCdmFilterMode("exact")}
                >
                  Exact
                </button>
              </div>
            </label>
            {cdmFilterMode === "range" ? (
              <>
                <label className="analysis-field">
                  <span className="analysis-field-label">Min CDMs</span>
                  <select
                    className="analysis-select"
                    value={cdmMin}
                    onChange={(e) => setCdmMin(e.target.value)}
                  >
                    <option value="all">All</option>
                    {availableCdmCounts.map((n) => (
                      <option key={`min-${n}`} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="analysis-field">
                  <span className="analysis-field-label">Max CDMs</span>
                  <select
                    className="analysis-select"
                    value={cdmMax}
                    onChange={(e) => setCdmMax(e.target.value)}
                  >
                    <option value="all">All</option>
                    {availableCdmCounts.map((n) => (
                      <option key={`max-${n}`} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="analysis-field">
                <span className="analysis-field-label">Exact CDMs</span>
                <select
                  className="analysis-select"
                  value={cdmExact}
                  onChange={(e) => setCdmExact(e.target.value)}
                >
                  <option value="all">All</option>
                  {availableCdmCounts
                    .filter((n) => n > 0)
                    .map((n) => (
                      <option key={`exact-${n}`} value={String(n)}>
                        {n}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          {cdmFilterMode === "range" && isRangeInvalid ? (
            <p className="analysis-filter-validation" role="alert">
              Min CDMs cannot be greater than Max CDMs.
            </p>
          ) : null}
          {cdmFilterMode === "exact" && isExactInvalid ? (
            <p className="analysis-filter-validation" role="alert">
              Exact CDMs must be a positive number.
            </p>
          ) : null}

          {eventsLoading ? (
            <p className="analysis-muted">Loading events…</p>
          ) : eventsError ? (
            <p className="analysis-error" role="alert">
              {eventsError}
            </p>
          ) : (
            <div className="analysis-event-table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th scope="col">Select</th>
                    <th scope="col">Event ID</th>
                    <th scope="col">CDMs</th>
                  </tr>
                </thead>
                <tbody>
                  {selectableEvents.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="analysis-table-empty">
                        No events match the current filters for this analysis path.
                      </td>
                    </tr>
                  ) : (
                    pagedSelectableEvents.map((ev) => {
                      const id = String(ev.id);
                      const checked = selectedEventId === id;
                      return (
                        <tr
                          key={id}
                          className={`analysis-row ${checked ? "analysis-row--selected" : ""}`}
                          onClick={() => setSelectedEventId(id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedEventId(id);
                            }
                          }}
                          tabIndex={0}
                          role="radio"
                          aria-checked={checked}
                          aria-label={`Select event ${id}`}
                        >
                          <td>
                            <input
                              type="radio"
                              name="analysis-event"
                              className="analysis-event-radio"
                              checked={checked}
                              onChange={() => setSelectedEventId(id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-hidden="true"
                              tabIndex={-1}
                            />
                          </td>
                          <td className="analysis-mono">{id}</td>
                          <td>{ev.cdmCount}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {selectableEvents.length > eventsPageSize ? (
            <div className="analysis-pagination">
              <button
                type="button"
                className="analysis-btn analysis-btn--ghost"
                disabled={safeEventPage <= 1}
                onClick={() => setEventPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="analysis-pagination-info">
                Page {safeEventPage} of {eventsTotalPages}
              </span>
              <button
                type="button"
                className="analysis-btn analysis-btn--ghost"
                disabled={safeEventPage >= eventsTotalPages}
                onClick={() => setEventPage((p) => Math.min(eventsTotalPages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}

          <div className="analysis-run-row">
            <button
              type="button"
              className="analysis-btn analysis-btn--primary"
              disabled={!selectedEventId || runBusy}
              onClick={() => void handleRunAnalysis()}
            >
              {runBusy
                ? "Running…"
                : path === "actual"
                  ? "Run actual analysis"
                  : "Run predicted analysis"}
            </button>
          </div>
        </section>
      ) : null}
      </section>

      <section className="analysis-overview-head" aria-label="Analysis overview section">
        <p className="analysis-overview-label">Analysis Overview</p>
      </section>

      <section className="analysis-stats" aria-label="Assessment statistics">
        <article className="analysis-stat-card">
          <p className="analysis-stat-label">Total analyses</p>
          <p className="analysis-stat-value">{stats.total}</p>
        </article>
        <article className="analysis-stat-card">
          <p className="analysis-stat-label">Actual analyses</p>
          <p className="analysis-stat-value">{stats.actual}</p>
        </article>
        <article className="analysis-stat-card">
          <p className="analysis-stat-label">Predicted analyses</p>
          <p className="analysis-stat-value">{stats.predicted}</p>
        </article>
        <article className="analysis-stat-card">
          <p className="analysis-stat-label">Avg confidence</p>
          <p className={`analysis-stat-value ${avgConfidenceTone}`}>
            {stats.avgConfidence == null
              ? "—"
              : `${stats.avgConfidence.toFixed(1)}%`}
          </p>
        </article>
      </section>

      <div className="analysis-chart-grid">
        <RiskTrendChart
          data={trendData}
          title="Risk trend — user assessments (last 30 points)"
          className="analysis-stat-card analysis-chart-card"
        />
        <RiskDistributionChart
          data={distributionData}
          className="analysis-stat-card analysis-chart-card"
        />
      </div>

      <section
        className="analysis-panel analysis-panel--assessments dash-table-section dash-table-section--cdm-events"
        aria-label="Risk assessments"
      >
        <div className="dash-table-head">
          <div>
            <h2 className="dash-table-title">
              Risk Assessments
              <span className="dash-table-count"> ({filteredAssessments.length})</span>
            </h2>
          </div>
          <div className="dash-table-toolbar-stack">
            <div className="dash-table-controls dash-table-controls--events">
              <label className="dash-field dash-field--cdm-count">
                <span className="visually-hidden">Filter by type</span>
                <select
                  className="dash-select"
                  value={historyType}
                  onChange={(e) =>
                    setHistoryType(
                      /** @type {'all' | 'actual' | 'predicted'} */ (e.target.value),
                    )
                  }
                  aria-label="Filter by analysis type"
                >
                  <option value="all">All types</option>
                  <option value="actual">Actual</option>
                  <option value="predicted">Predicted</option>
                </select>
              </label>
              <label className="dash-field dash-field--cdm-count">
                <span className="visually-hidden">Filter by risk</span>
                <select
                  className="dash-select"
                  value={historyRisk}
                  onChange={(e) =>
                    setHistoryRisk(
                      /** @type {'all' | 'High' | 'Low'} */ (e.target.value),
                    )
                  }
                  aria-label="Filter by risk level"
                >
                  <option value="all">All risks</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label className="dash-field dash-field--search">
                <span className="visually-hidden">Search assessments</span>
                <input
                  type="search"
                  className="dash-input"
                  placeholder="Search assessments…"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
        {assessmentsLoading ? (
          <p className="analysis-muted">Loading analyses…</p>
        ) : assessmentsError ? (
          <p className="analysis-error" role="alert">
            {assessmentsError}
          </p>
        ) : (
          <div
            className={
              selectedAssessmentIds.size > 0
                ? "dash-cdm-table-anchor dash-cdm-table-anchor--float"
                : "dash-cdm-table-anchor"
            }
          >
            {selectedAssessmentIds.size > 0 ? (
              <div
                className="dash-cdm-floating-selection"
                role="toolbar"
                aria-label="Selected assessments"
              >
                <span
                  className="dash-cdm-floating-meta"
                  role="status"
                  aria-live="polite"
                  aria-label={`${selectedAssessmentIds.size} assessments selected`}
                >
                  <span className="dash-cdm-floating-count">{selectedAssessmentIds.size}</span>
                  <span className="dash-cdm-floating-suffix"> selected</span>
                </span>
                <span className="dash-cdm-floating-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="dash-cdm-floating-btn dash-cdm-floating-btn--danger"
                  onClick={() => void handleDeleteSelectedAssessments()}
                >
                  Delete Selected
                </button>
                <button
                  type="button"
                  className="dash-cdm-floating-btn"
                  onClick={() => setSelectedAssessmentIds(new Set())}
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
                      ref={selectAllAssessmentsRef}
                      type="checkbox"
                      className="dash-events-checkbox"
                      checked={allFilteredAssessmentsSelected && filteredAssessments.length > 0}
                      onChange={toggleSelectAllFilteredAssessments}
                      aria-label="Select all assessments in current list"
                      disabled={filteredAssessments.length === 0}
                    />
                  </th>
                  <th scope="col">Assessment ID</th>
                  <th scope="col">Event ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Risk</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="dash-table-cell--center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="analysis-table-empty">
                      No saved analyses match the filters.
                    </td>
                  </tr>
                ) : (
                  pagedAssessments.map((row) => {
                    const id = getAssessmentRowId(row) ?? "—";
                    const primaryId = getAssessmentPrimaryKey(row);
                    const detailsId = primaryId ?? (id !== "—" ? id : null);
                    const eid = getEventIdFromAssessment(row) || "—";
                    const rl = getRiskLevel(row);
                    const conf = formatConfidencePct(getConfidence(row));
                    return (
                      <tr
                        key={id}
                        className={
                          primaryId && selectedAssessmentIds.has(primaryId)
                            ? "dash-table-row dash-table-row--selected"
                            : "dash-table-row"
                        }
                      >
                        <td className="dash-table-td--checkbox">
                          <input
                            type="checkbox"
                            className="dash-events-checkbox"
                            checked={primaryId ? selectedAssessmentIds.has(primaryId) : false}
                            onChange={() => {
                              if (!primaryId) return;
                              toggleSelectAssessment(primaryId);
                            }}
                            aria-label={`Select assessment ${id}`}
                            disabled={!primaryId}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="dash-link dash-link--id"
                            onClick={() => {
                              if (!detailsId) return;
                              handleAssessmentView(detailsId);
                            }}
                            disabled={!detailsId}
                          >
                            {id}
                          </button>
                        </td>
                        <td className="analysis-mono">{eid}</td>
                        <td>
                          <span
                            className={`analysis-badge ${getAnalysisType(row) === "predicted" ? "analysis-badge--predicted" : "analysis-badge--actual"}`}
                          >
                            {getAnalysisType(row)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`analysis-risk-pill ${rl.toLowerCase() === "high" ? "analysis-risk-pill--high" : "analysis-risk-pill--low"}`}
                          >
                            {rl}
                          </span>
                        </td>
                        <td>{conf}</td>
                        <td>{getRecommendedDecision(row)}</td>
                        <td className="analysis-mono">
                          {formatUtc(row.created_at ?? row.createdAt)}
                        </td>
                        <td className="dash-table-td--actions dash-table-cell--center">
                          <div
                            className="dash-row-menu-wrap"
                            ref={openAssessmentMenuId === String(id) ? menuRef : null}
                          >
                            <button
                              type="button"
                              className="dash-row-menu-trigger"
                              aria-haspopup="menu"
                              aria-expanded={openAssessmentMenuId === String(id)}
                              aria-label={`Actions for assessment ${id}`}
                              onClick={() =>
                                setOpenAssessmentMenuId((cur) =>
                                  cur === String(id) ? null : String(id),
                                )
                              }
                            >
                              <span aria-hidden="true">⋮</span>
                            </button>
                            {openAssessmentMenuId === String(id) ? (
                              <ul
                                className="dash-row-menu"
                                role="menu"
                                aria-label={`Actions for assessment ${id}`}
                              >
                                <li role="none">
                                  <button
                                    type="button"
                                    className="dash-row-menu-item"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenAssessmentMenuId(null);
                                      if (!detailsId) return;
                                      handleAssessmentView(detailsId);
                                    }}
                                    disabled={!detailsId}
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
                                      setOpenAssessmentMenuId(null);
                                      if (!primaryId) return;
                                      void handleDeleteSingleAssessment(primaryId);
                                    }}
                                    disabled={!primaryId}
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
                  })
                )}
              </tbody>
              </table>
            </div>
          </div>
        )}
        {filteredAssessments.length > 0 ? (
          <div className="dash-pagination">
            <label className="dash-pagination-rows">
              <select
                className="dash-pagination-rows-select"
                value={String(assessmentsPageSize)}
                onChange={(e) =>
                  setAssessmentsPageSize(
                    /** @type {10 | 50 | 100} */ (Number(e.target.value)),
                  )
                }
              >
                <option value="10">10 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
            </label>
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              disabled={safeAssessmentsPage <= 1}
              onClick={() => setAssessmentsPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="dash-pagination-info">
              Page {safeAssessmentsPage} of {totalAssessmentPages}
            </span>
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              disabled={safeAssessmentsPage >= totalAssessmentPages}
              onClick={() => setAssessmentsPage((p) => Math.min(totalAssessmentPages, p + 1))}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </DashboardPageLayout>
  );
}
