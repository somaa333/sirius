import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import {
  fetchRiskAssessmentById,
  fetchAssessmentCdmLinks,
  fetchCdmRecordsByIds,
  fetchPredictedCdmRecordById,
  linkCdmRecordId,
  getAssessmentRowId,
  getAssessmentPrimaryKey,
  getEventIdFromAssessment,
  getAnalysisType,
  getRiskLevel,
  getConfidence,
  getRecommendedDecision,
  getClassificationProbability,
  getStatus,
  getPredictionOutput,
  getClassificationOutput,
  getPredictedCdmRecordId,
  getShapOutput,
} from "../data/analysisData.js";
import { formatUtc } from "../data/cdmEventData.js";
import "./AnalysisDetailsPage.css";

const TAB_OVERVIEW = "overview";
const TAB_CLASSIFICATION = "classification";
const TAB_INPUT = "input";
const TAB_PREDICTION = "prediction";
const TAB_RAW = "raw";

const CDM_GROUPS = [
  {
    title: "Identification",
    keys: ["event_id", "conjunction_id", "message_id", "source_type"],
  },
  {
    title: "Timeline",
    keys: ["creation_date", "tca", "imported_at", "created_at"],
  },
  {
    title: "Risk & Geometry",
    keys: [
      "miss_distance",
      "relative_speed",
      "collision_probability",
      "relative_position_r",
      "relative_position_t",
      "relative_position_n",
      "relative_velocity_r",
      "relative_velocity_t",
      "relative_velocity_n",
    ],
  },
  {
    title: "Screening",
    keys: [
      "start_screen_period",
      "stop_screen_period",
      "screen_volume_shape",
      "screen_volume_radius",
      "screen_entry_time",
      "screen_exit_time",
    ],
  },
  {
    title: "Collision Probability Details",
    keys: [
      "collision_probability_method",
      "collision_max_probability",
      "collision_max_pc_method",
    ],
  },
  {
    title: "Object 1",
    keys: [
      "object1_object_designator",
      "object1_catalog_name",
      "object1_object_name",
      "object1_international_designator",
      "object1_object_type",
      "object1_ephemeris_name",
      "object1_covariance_method",
      "object1_maneuverable",
      "object1_orbit_center",
      "object1_ref_frame",
      "object1_cov_type",
      "object1_area_pc",
      "object1_area_pc_max",
      "object1_hbr",
      "object1_x",
      "object1_y",
      "object1_z",
      "object1_x_dot",
      "object1_y_dot",
      "object1_z_dot",
      "object1_cr_r",
      "object1_ct_t",
      "object1_cn_n",
    ],
  },
  {
    title: "Object 2",
    keys: [
      "object2_object_designator",
      "object2_catalog_name",
      "object2_object_name",
      "object2_international_designator",
      "object2_object_type",
      "object2_ephemeris_name",
      "object2_covariance_method",
      "object2_maneuverable",
      "object2_orbit_center",
      "object2_ref_frame",
      "object2_cov_type",
      "object2_area_pc",
      "object2_area_pc_max",
      "object2_hbr",
      "object2_x",
      "object2_y",
      "object2_z",
      "object2_x_dot",
      "object2_y_dot",
      "object2_z_dot",
      "object2_cr_r",
      "object2_ct_t",
      "object2_cn_n",
    ],
  },
];

function toIso(v) {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseMaybeJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function getObj(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  return obj[key];
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatPercent(v) {
  const n = asNumber(v);
  if (n == null) return "—";
  const pct = n >= 0 && n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function formatSci(v) {
  const n = asNumber(v);
  if (n == null) return "—";
  return n.toExponential(3);
}

function formatDistanceKm(v) {
  const n = asNumber(v);
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} km`;
}

function formatSpeedKmS(v) {
  const n = asNumber(v);
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} km/s`;
}

const SHAP_FEATURE_LABELS = {
  miss_distance: "Miss Distance",
  collision_probability: "Collision Probability",
  relative_speed: "Relative Speed",
  object1_x_dot: "Object 1 X Velocity",
};

/**
 * @param {string} featureKey
 */
function formatShapFeatureLabel(featureKey) {
  if (SHAP_FEATURE_LABELS[featureKey]) return SHAP_FEATURE_LABELS[featureKey];
  const od = /^object(\d+)_(x|y|z)_dot$/.exec(featureKey);
  if (od) {
    const axis = od[2].toUpperCase();
    return `Object ${od[1]} ${axis} Velocity`;
  }
  return featureKey
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * @param {Record<string, unknown>} item
 */
function getShapAbsStrength(item) {
  const a = item.abs_mean_shap ?? item.mean_abs_shap;
  const an = Number(a);
  if (Number.isFinite(an)) return Math.abs(an);
  const s = Number(item.signed_mean_shap);
  if (Number.isFinite(s)) return Math.abs(s);
  return 0;
}

/**
 * @param {unknown} signed
 */
function formatShapImpactSigned(signed) {
  const n = Number(signed);
  if (!Number.isFinite(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}${n.toFixed(3)}`;
}

/**
 * @param {unknown} signed
 */
function getShapDirectionLabel(signed) {
  const n = Number(signed);
  if (!Number.isFinite(n)) return "—";
  if (n > 0) return "Pushed toward High Risk";
  if (n < 0) return "Pushed toward Low Risk";
  return "Neutral impact";
}

function formatGenericValue(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.includes("probability")) return formatSci(value);
    if (key.includes("distance")) return formatDistanceKm(value);
    if (key.includes("speed")) return formatSpeedKmS(value);
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  if (typeof value === "string") {
    const iso = toIso(value);
    if (iso && (key.includes("date") || key.includes("time") || key === "tca")) {
      return formatUtc(iso);
    }
    return value;
  }
  return JSON.stringify(value);
}

function copyText(text) {
  if (!text) return;
  void navigator.clipboard.writeText(text);
}

function FieldRows({ rows, copyableKeys = [] }) {
  const [copiedKey, setCopiedKey] = useState("");
  const copyableSet = useMemo(() => new Set(copyableKeys), [copyableKeys]);
  return (
    <div className="analysis2-rows">
      {rows.map((r) => (
        <div className="analysis2-row" key={r.label}>
          <span>{r.label}</span>
          <strong className="analysis2-row-value">
            <span>{r.value}</span>
            {copyableSet.has(r.key) && r.value !== "—" ? (
              <button
                type="button"
                className="analysis2-inline-copy"
                aria-label={`Copy ${r.label}`}
                onClick={() => {
                  copyText(String(r.rawValue ?? r.value));
                  setCopiedKey(r.key);
                  window.setTimeout(() => {
                    setCopiedKey((prev) => (prev === r.key ? "" : prev));
                  }, 1200);
                }}
              >
                {copiedKey === r.key ? "Copied" : "Copy"}
              </button>
            ) : null}
          </strong>
        </div>
      ))}
    </div>
  );
}

function JsonViewer({ title, data, defaultOpen = false }) {
  const [query, setQuery] = useState("");
  const text = useMemo(() => JSON.stringify(data ?? null, null, 2), [data]);
  const shown = useMemo(() => {
    if (!query.trim()) return text;
    const lines = text.split("\n");
    const q = query.trim().toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(q)).join("\n") || "(No matching lines)";
  }, [text, query]);
  return (
    <details className="analysis2-json" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <span className="analysis2-json-tools" onClick={(e) => e.stopPropagation()}>
          <input
            type="search"
            className="analysis2-input"
            value={query}
            placeholder="Search JSON lines…"
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="analysis2-btn"
            onClick={(e) => {
              e.stopPropagation();
              copyText(text);
            }}
          >
            Copy
          </button>
        </span>
      </summary>
      <pre>{shown}</pre>
    </details>
  );
}

function StatCard({ label, value }) {
  return (
    <article className="analysis2-stat-card">
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  );
}

export default function AnalysisDetailsPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [inputCdms, setInputCdms] = useState([]);
  const [predictedRow, setPredictedRow] = useState(null);
  const [tab, setTab] = useState(TAB_OVERVIEW);
  const [selectedCdmIdx, setSelectedCdmIdx] = useState(0);
  const [uncertaintyMode, setUncertaintyMode] = useState("std");
  const [shapExpanded, setShapExpanded] = useState(false);

  const idParam = assessmentId ? decodeURIComponent(assessmentId) : "";
  const routeLooksLikeDisplayAssessmentId = /^RA[\w-]+$/i.test(idParam);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !idParam) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const row = await fetchRiskAssessmentById(idParam, user.id);
        if (cancelled) return;
        if (!row) {
          setError("Assessment not found.");
          setAssessment(null);
          setInputCdms([]);
          setPredictedRow(null);
          return;
        }
        setAssessment(row);
        const pk = getAssessmentPrimaryKey(row);
        if (!pk) {
          setError("Assessment has no id.");
          return;
        }
        const links = await fetchAssessmentCdmLinks(pk);
        const cdmIds = links
          .map((l) => linkCdmRecordId(l))
          .filter((x) => x != null && x !== "")
          .map((x) => String(x));
        const map = await fetchCdmRecordsByIds(cdmIds);
        const ordered = cdmIds.map((cid) => map.get(cid)).filter((r) => r != null);
        setInputCdms(ordered);
        setSelectedCdmIdx(0);

        const predId = getPredictedCdmRecordId(row);
        if (predId && getAnalysisType(row) === "predicted") {
          const pr = await fetchPredictedCdmRecordById(predId, user.id);
          if (!cancelled) setPredictedRow(pr);
        } else {
          setPredictedRow(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAssessment(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, idParam]);

  useEffect(() => {
    setShapExpanded(false);
  }, [idParam]);

  const assessmentIdText = useMemo(
    () => getAssessmentRowId(assessment ?? {}) ?? getAssessmentPrimaryKey(assessment ?? {}) ?? "",
    [assessment],
  );

  const breadcrumbItems = useMemo(
    () => [
      { label: "Home", to: "/" },
      { label: "Analysis", to: "/analysis" },
      {
        label: assessmentIdText
          ? `Assessment ${assessmentIdText}`
          : routeLooksLikeDisplayAssessmentId
            ? `Assessment ${idParam}`
            : "Assessment",
      },
    ],
    [assessmentIdText, routeLooksLikeDisplayAssessmentId, idParam],
  );

  const analysisType = getAnalysisType(assessment ?? {});
  const isPredicted = analysisType === "predicted";
  const status = String(getStatus(assessment ?? {})).toLowerCase();
  const riskLevel = getRiskLevel(assessment ?? {});
  const decision = getRecommendedDecision(assessment ?? {});
  const confidence = getConfidence(assessment ?? {});
  const classProb = getClassificationProbability(assessment ?? {});
  const classificationOutput = parseMaybeJson(getClassificationOutput(assessment ?? {}));
  const predictionOutput = parseMaybeJson(getPredictionOutput(assessment ?? {}));
  const shapOutput = getShapOutput(assessment ?? {});
  const shapTopFeatures = useMemo(() => {
    const raw = shapOutput && typeof shapOutput === "object" ? shapOutput.top_features : null;
    return Array.isArray(raw) ? raw : [];
  }, [shapOutput]);

  const shapRowsVisible = useMemo(() => {
    if (!shapTopFeatures.length) return [];
    return shapExpanded ? shapTopFeatures : shapTopFeatures.slice(0, 3);
  }, [shapTopFeatures, shapExpanded]);

  const shapBarMax = useMemo(() => {
    let m = 0;
    for (const item of shapRowsVisible) {
      const v = getShapAbsStrength(/** @type {Record<string, unknown>} */ (item));
      if (v > m) m = v;
    }
    return m || 1;
  }, [shapRowsVisible]);

  const uncertaintyStd =
    asNumber(getObj(classificationOutput, "uncertainty_std")) ??
    asNumber(getObj(predictionOutput, "overall_uncertainty"));
  const confidencePct = Math.max(
    0,
    Math.min(100, asNumber(confidence) == null ? 0 : (confidence <= 1 ? confidence * 100 : confidence)),
  );

  const sortedInputCdms = useMemo(() => {
    return [...inputCdms].sort((a, b) => {
      const ta = toIso(a.creation_date ?? a.created_at) ?? "";
      const tb = toIso(b.creation_date ?? b.created_at) ?? "";
      return ta.localeCompare(tb);
    });
  }, [inputCdms]);

  const selectedCdm = sortedInputCdms[selectedCdmIdx] ?? null;

  useEffect(() => {
    if (selectedCdmIdx >= sortedInputCdms.length) {
      setSelectedCdmIdx(0);
    }
  }, [selectedCdmIdx, sortedInputCdms.length]);

  const firstInput = sortedInputCdms[0];
  const lastInput = sortedInputCdms[sortedInputCdms.length - 1];

  const metricCards = useMemo(() => {
    const cards = [
      { label: "Input CDMs", value: String(sortedInputCdms.length) },
      {
        label: "First Input CDM",
        value: firstInput ? formatUtc(firstInput.creation_date ?? firstInput.created_at) : "—",
      },
      {
        label: "Last Input CDM",
        value: lastInput ? formatUtc(lastInput.creation_date ?? lastInput.created_at) : "—",
      },
    ];
    if (isPredicted) {
      cards.push(
        {
          label: "Predicted CDM Created",
          value: predictedRow ? formatUtc(predictedRow.creation_date ?? predictedRow.created_at) : "—",
        },
      );
    }
    return cards;
  }, [sortedInputCdms.length, firstInput, lastInput, isPredicted, predictedRow]);

  const mcDropout = getObj(classificationOutput, "mc_dropout");
  const mcSamples = Array.isArray(getObj(mcDropout, "samples")) ? getObj(mcDropout, "samples") : [];
  const mcNumeric = mcSamples.map(asNumber).filter((n) => n != null);
  const mcStats = useMemo(() => {
    if (!mcNumeric.length) return null;
    const min = Math.min(...mcNumeric);
    const max = Math.max(...mcNumeric);
    const mean = mcNumeric.reduce((a, b) => a + b, 0) / mcNumeric.length;
    const variance = mcNumeric.reduce((a, b) => a + (b - mean) ** 2, 0) / mcNumeric.length;
    return { min, max, mean, std: Math.sqrt(variance), count: mcNumeric.length };
  }, [mcNumeric]);

  const featureUncertaintyRows = useMemo(() => {
    if (!predictionOutput || typeof predictionOutput !== "object") return [];
    const stdMap = getObj(predictionOutput, "feature_uncertainty_std");
    const varMap = getObj(predictionOutput, "feature_uncertainty_variance");
    if (!stdMap || typeof stdMap !== "object") return [];
    return Object.keys(stdMap)
      .map((feature) => ({
        feature,
        std: asNumber(stdMap[feature]),
        variance: varMap && typeof varMap === "object" ? asNumber(varMap[feature]) : null,
      }))
      .sort((a, b) => (b.std ?? -Infinity) - (a.std ?? -Infinity));
  }, [predictionOutput]);

  const shownUncertaintyRows = featureUncertaintyRows.map((r) => ({
    feature: r.feature,
    value: uncertaintyMode === "variance" ? r.variance : r.std,
  }));

  const tabDefs = useMemo(() => {
    const base = [
      { id: TAB_OVERVIEW, label: "Overview" },
      { id: TAB_CLASSIFICATION, label: "Classification" },
    ];
    if (isPredicted) base.push({ id: TAB_PREDICTION, label: "Prediction" });
    base.push({ id: TAB_INPUT, label: "Input CDMs" });
    base.push({ id: TAB_RAW, label: "Raw Data" });
    return base;
  }, [isPredicted]);

  useEffect(() => {
    if (!tabDefs.some((t) => t.id === tab)) setTab(TAB_OVERVIEW);
  }, [tab, tabDefs]);

  if (authLoading || !user) return null;

  return (
    <DashboardPageLayout title="Analysis details" breadcrumbItems={breadcrumbItems}>
      <div className="analysis2-back">
        <Link className="analysis2-back-link" to="/analysis">
          ← Back to Analysis
        </Link>
      </div>

      {loading ? (
        <p className="analysis2-muted">Loading assessment…</p>
      ) : error ? (
        <p className="analysis2-error" role="alert">
          {error}
        </p>
      ) : !assessment ? null : (
        <>
          <section className="analysis2-header-card">
            <div className="analysis2-header-main">
              <h2>Assessment {assessmentIdText || "—"}</h2>
              <div className="analysis2-chip-row">
                <span className={`analysis2-chip ${analysisType === "predicted" ? "predicted" : "actual"}`}>
                  {analysisType === "predicted" ? "Predicted" : "Actual"}
                </span>
                <span className={`analysis2-chip status status-${status || "unknown"}`}>{status || "—"}</span>
              </div>
            </div>
            <div className="analysis2-header-meta">
              <span>Event: {getEventIdFromAssessment(assessment) || "—"}</span>
              <span>Created: {formatUtc(assessment.created_at ?? assessment.createdAt)}</span>
            </div>
          </section>

          <section className="analysis2-hero">
            <div className="analysis2-hero-left">
              <p className="analysis2-hero-label">Risk level</p>
              <h3 className={`analysis2-risk ${String(riskLevel).toLowerCase() === "high" ? "high" : "low"}`}>
                {riskLevel}
              </h3>
              <div className="analysis2-chip-row">
                <span className="analysis2-chip decision">{decision || "—"}</span>
                <span className="analysis2-chip">{`Class prob: ${
                  asNumber(classProb) != null
                    ? asNumber(classProb) < 0
                      ? "0 (raw below zero)"
                      : formatSci(classProb)
                    : "—"
                }`}</span>
                <span className="analysis2-chip">{`Uncertainty std: ${
                  uncertaintyStd == null ? "—" : uncertaintyStd.toFixed(6)
                }`}</span>
              </div>
            </div>
            <div className="analysis2-hero-right">
              <p>Confidence</p>
              <h4>{formatPercent(confidence)}</h4>
              <div className="analysis2-progress">
                <span style={{ width: `${confidencePct}%` }} />
              </div>
            </div>
          </section>

          <section className="analysis2-metrics-grid">
            {metricCards.map((m) => (
              <StatCard key={m.label} label={m.label} value={m.value} />
            ))}
          </section>

          <section className="analysis2-tabs">
            {tabDefs.map((t) => (
              <button
                type="button"
                key={t.id}
                className={tab === t.id ? "is-active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </section>

          {tab === TAB_OVERVIEW ? (
            <section className="analysis2-panel">
              <div className="analysis2-grid-2">
                <article className="analysis2-block">
                  <h3>Assessment metadata</h3>
                  <FieldRows
                    rows={[
                      { label: "Assessment ID", value: assessmentIdText || "—" },
                      { label: "Event ID", value: getEventIdFromAssessment(assessment) || "—" },
                      { label: "Analysis Type", value: analysisType || "—" },
                      { label: "Status", value: getStatus(assessment) || "—" },
                      { label: "Created At", value: formatUtc(assessment.created_at ?? assessment.createdAt) },
                    ]}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Final output</h3>
                  <FieldRows
                    rows={[
                      { label: "Risk Level", value: riskLevel || "—" },
                      { label: "Confidence", value: formatPercent(confidence) },
                      {
                        label: "Classification Probability",
                        value:
                          asNumber(classProb) == null
                            ? "—"
                            : asNumber(classProb) < 0
                              ? "0 (raw below zero, post-process expected)"
                              : formatSci(classProb),
                      },
                      { label: "Recommended Decision", value: decision || "—" },
                    ]}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Processing summary</h3>
                  <FieldRows
                    rows={[
                      { label: "Input CDM Count", value: String(sortedInputCdms.length) },
                      {
                        label: "First Input Creation Date",
                        value: firstInput ? formatUtc(firstInput.creation_date ?? firstInput.created_at) : "—",
                      },
                      {
                        label: "Last Input Creation Date",
                        value: lastInput ? formatUtc(lastInput.creation_date ?? lastInput.created_at) : "—",
                      },
                    ]}
                  />
                </article>

                <article className="analysis2-block analysis2-shap-card">
                  <div className="analysis2-shap-title-row">
                    <h3>Decision Explanation</h3>
                    <button
                      type="button"
                      className="analysis2-shap-info"
                      aria-label="SHAP impact sign help"
                      title="Positive impact pushes the model toward High Risk. Negative impact pushes it toward Low Risk."
                    >
                      ?
                    </button>
                  </div>
                  <p className="analysis2-shap-lede">
                    SHAP highlights which input features had the strongest influence on this classification.
                  </p>
                  {!shapOutput || shapTopFeatures.length === 0 ? (
                    <p className="analysis2-muted">No explanation data is available for this assessment.</p>
                  ) : (
                    <>
                      <ul className="analysis2-shap-list">
                        {shapRowsVisible.map((raw, idx) => {
                          const item = /** @type {Record<string, unknown>} */ (raw);
                          const fname = String(item.feature ?? "");
                          const signed = Number(item.signed_mean_shap);
                          const strength = getShapAbsStrength(item);
                          const pct = shapBarMax > 0 ? Math.min(100, (strength / shapBarMax) * 100) : 0;
                          const barTone =
                            !Number.isFinite(signed) || signed === 0
                              ? "neutral"
                              : signed > 0
                                ? "high"
                                : "low";
                          return (
                            <li key={`${fname}-${idx}`} className="analysis2-shap-item">
                              <div className="analysis2-shap-item-head">
                                <span className="analysis2-shap-rank">{idx + 1}.</span>
                                <span className="analysis2-shap-name" title={fname || undefined}>
                                  {formatShapFeatureLabel(fname)}
                                </span>
                              </div>
                              <div
                                className={`analysis2-shap-bar analysis2-shap-bar-${barTone}`}
                                aria-hidden
                              >
                                <span style={{ width: `${pct}%` }} />
                              </div>
                              <div className="analysis2-shap-meta">
                                <span>
                                  Impact:{" "}
                                  <strong>{formatShapImpactSigned(item.signed_mean_shap)}</strong>
                                </span>
                                <span className="analysis2-shap-dir">{getShapDirectionLabel(signed)}</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {shapTopFeatures.length > 3 ? (
                        <button
                          type="button"
                          className="analysis2-shap-expand"
                          onClick={() => setShapExpanded((v) => !v)}
                        >
                          {shapExpanded ? "Show top 3 features" : "Show top 10 features"}
                        </button>
                      ) : null}
                    </>
                  )}
                </article>
              </div>
            </section>
          ) : null}

          {tab === TAB_CLASSIFICATION ? (
            <section className="analysis2-panel">
              <div className="analysis2-grid-2">
                <article className="analysis2-block">
                  <h3>Classification result</h3>
                  <FieldRows
                    rows={[
                      { label: "Risk Level", value: String(getObj(classificationOutput, "risk_level") ?? riskLevel) },
                      {
                        label: "Classification Probability",
                        value: formatSci(getObj(classificationOutput, "classification_probability") ?? classProb),
                      },
                      {
                        label: "Confidence Score",
                        value: formatPercent(getObj(classificationOutput, "confidence_score") ?? confidence),
                      },
                      {
                        label: "Decision Threshold",
                        value: formatGenericValue("decision_threshold", getObj(classificationOutput, "decision_threshold")),
                      },
                      {
                        label: "Recommended Decision",
                        value: String(
                          getObj(classificationOutput, "recommended_decision") ?? decision ?? "—",
                        ),
                      },
                      {
                        label: "Target True Label",
                        value: formatGenericValue(
                          "target_true_label_if_known",
                          getObj(classificationOutput, "target_true_label_if_known"),
                        ),
                      },
                    ]}
                  />
                </article>

                <article className="analysis2-block">
                  <h3>Uncertainty / MC Dropout</h3>
                  <FieldRows
                    rows={[
                      {
                        label: "Enabled",
                        value: formatGenericValue("enabled", getObj(mcDropout, "enabled")),
                      },
                      { label: "Passes", value: formatGenericValue("passes", getObj(mcDropout, "passes")) },
                      {
                        label: "Uncertainty Std",
                        value: formatGenericValue(
                          "uncertainty_std",
                          getObj(classificationOutput, "uncertainty_std"),
                        ),
                      },
                    ]}
                  />
                  {mcStats ? (
                    <FieldRows
                      rows={[
                        { label: "Sample Count", value: String(mcStats.count) },
                        { label: "Min Sample", value: mcStats.min.toExponential(3) },
                        { label: "Max Sample", value: mcStats.max.toExponential(3) },
                        { label: "Mean Sample", value: mcStats.mean.toExponential(3) },
                        { label: "Std Sample", value: mcStats.std.toExponential(3) },
                      ]}
                    />
                  ) : (
                    <p className="analysis2-muted">No MC Dropout samples available.</p>
                  )}
                  {mcNumeric.length ? (
                    <details className="analysis2-collapsible">
                      <summary>View Samples</summary>
                      <pre>{JSON.stringify(mcNumeric, null, 2)}</pre>
                    </details>
                  ) : null}
                </article>
              </div>
            </section>
          ) : null}

          {tab === TAB_INPUT ? (
            <section className="analysis2-panel">
              {sortedInputCdms.length === 0 ? (
                <p className="analysis2-muted">No linked CDM records.</p>
              ) : (
                <div className="analysis2-cdm-layout">
                  <aside className="analysis2-cdm-list">
                    {sortedInputCdms.map((row, idx) => (
                      <button
                        type="button"
                        key={String(row.id ?? idx)}
                        className={selectedCdmIdx === idx ? "is-active" : ""}
                        onClick={() => setSelectedCdmIdx(idx)}
                      >
                        <span>CDM #{idx + 1}</span>
                        <small>{formatUtc(row.creation_date ?? row.created_at)}</small>
                      </button>
                    ))}
                  </aside>
                  <div className="analysis2-cdm-detail">
                    <h3>Selected CDM details</h3>
                    {CDM_GROUPS.map((group) => (
                      <details key={group.title} className="analysis2-collapsible" open={group.title === "Identification"}>
                        <summary>{group.title}</summary>
                        <FieldRows
                          rows={group.keys.map((k) => ({
                            key: k,
                            label: k,
                            value: formatGenericValue(k, selectedCdm?.[k]),
                            rawValue: selectedCdm?.[k],
                          }))}
                          copyableKeys={
                            group.title === "Identification"
                              ? ["message_id", "conjunction_id"]
                              : []
                          }
                        />
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {tab === TAB_PREDICTION && isPredicted ? (
            <section className="analysis2-panel">
              <div className="analysis2-grid-2">
                <article className="analysis2-block">
                  <h3>Predicted CDM summary</h3>
                  <FieldRows
                    rows={[
                      { label: "Predicted CDM ID", value: formatGenericValue("id", predictedRow?.id) },
                      { label: "Event ID", value: formatGenericValue("event_id", predictedRow?.event_id) },
                      {
                        label: "Creation Date",
                        value: formatGenericValue("creation_date", predictedRow?.creation_date ?? predictedRow?.created_at),
                      },
                      { label: "TCA", value: formatGenericValue("tca", predictedRow?.tca) },
                      { label: "Time To TCA", value: formatGenericValue("time_to_tca", predictedRow?.time_to_tca) },
                      {
                        label: "Source Last CDM ID",
                        value: formatGenericValue("source_actual_event_last_cdm_id", predictedRow?.source_actual_event_last_cdm_id),
                      },
                      {
                        label: "Prediction Model Version",
                        value: formatGenericValue("prediction_model_version", predictedRow?.prediction_model_version ?? getObj(predictionOutput, "model_version")),
                      },
                      {
                        label: "Overall Uncertainty",
                        value: formatGenericValue("overall_uncertainty", predictedRow?.overall_uncertainty ?? getObj(predictionOutput, "overall_uncertainty")),
                      },
                    ]}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Predicted risk & geometry</h3>
                  <FieldRows
                    rows={[
                      {
                        label: "Collision Probability",
                        value:
                          asNumber(predictedRow?.collision_probability) == null
                            ? "—"
                            : asNumber(predictedRow?.collision_probability) < 0
                              ? "0 (raw below zero, post-process expected)"
                              : formatSci(predictedRow?.collision_probability),
                      },
                      { label: "Log Risk", value: formatGenericValue("log_risk", predictedRow?.log_risk) },
                      { label: "Miss Distance", value: formatGenericValue("miss_distance", predictedRow?.miss_distance) },
                      { label: "Relative Speed", value: formatGenericValue("relative_speed", predictedRow?.relative_speed) },
                      { label: "Relative Position R", value: formatGenericValue("relative_position_r", predictedRow?.relative_position_r) },
                      { label: "Relative Position T", value: formatGenericValue("relative_position_t", predictedRow?.relative_position_t) },
                      { label: "Relative Position N", value: formatGenericValue("relative_position_n", predictedRow?.relative_position_n) },
                      { label: "Relative Velocity R", value: formatGenericValue("relative_velocity_r", predictedRow?.relative_velocity_r) },
                      { label: "Relative Velocity T", value: formatGenericValue("relative_velocity_t", predictedRow?.relative_velocity_t) },
                      { label: "Relative Velocity N", value: formatGenericValue("relative_velocity_n", predictedRow?.relative_velocity_n) },
                    ]}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Predicted object 1 state</h3>
                  <FieldRows
                    rows={[
                      "object1_hbr",
                      "object1_x",
                      "object1_y",
                      "object1_z",
                      "object1_x_dot",
                      "object1_y_dot",
                      "object1_z_dot",
                      "object1_cn_n",
                      "object1_cr_r",
                      "object1_ct_t",
                    ].map((k) => ({ label: k, value: formatGenericValue(k, predictedRow?.[k]) }))}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Predicted object 2 state</h3>
                  <FieldRows
                    rows={[
                      "object2_hbr",
                      "object2_x",
                      "object2_y",
                      "object2_z",
                      "object2_x_dot",
                      "object2_y_dot",
                      "object2_z_dot",
                      "object2_cn_n",
                      "object2_cr_r",
                      "object2_ct_t",
                    ].map((k) => ({ label: k, value: formatGenericValue(k, predictedRow?.[k]) }))}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Prediction output</h3>
                  <FieldRows
                    rows={[
                      { label: "MC Passes", value: formatGenericValue("mc_passes", getObj(predictionOutput, "mc_passes")) },
                      { label: "Max Seq Len", value: formatGenericValue("max_seq_len", getObj(predictionOutput, "max_seq_len")) },
                      { label: "Model Version", value: formatGenericValue("model_version", getObj(predictionOutput, "model_version")) },
                      { label: "Input CDM Count", value: formatGenericValue("input_cdm_count", getObj(predictionOutput, "input_cdm_count")) },
                      {
                        label: "First Input Creation Date",
                        value: formatGenericValue("first_input_creation_date", getObj(predictionOutput, "first_input_creation_date")),
                      },
                      {
                        label: "Last Input Creation Date",
                        value: formatGenericValue("last_input_creation_date", getObj(predictionOutput, "last_input_creation_date")),
                      },
                      {
                        label: "Padded Rows",
                        value: formatGenericValue("padded_rows", getObj(getObj(predictionOutput, "preprocessing_summary"), "padded_rows")),
                      },
                      {
                        label: "Valid Input Rows",
                        value: formatGenericValue("valid_input_rows", getObj(getObj(predictionOutput, "preprocessing_summary"), "valid_input_rows")),
                      },
                      {
                        label: "Used Rows After Truncation",
                        value: formatGenericValue(
                          "used_rows_after_truncation",
                          getObj(getObj(predictionOutput, "preprocessing_summary"), "used_rows_after_truncation"),
                        ),
                      },
                    ]}
                  />
                </article>
                <article className="analysis2-block">
                  <h3>Feature uncertainty</h3>
                  <div className="analysis2-copy-row">
                    <button
                      type="button"
                      className={`analysis2-btn ${uncertaintyMode === "std" ? "is-active" : ""}`}
                      onClick={() => setUncertaintyMode("std")}
                    >
                      Std
                    </button>
                    <button
                      type="button"
                      className={`analysis2-btn ${uncertaintyMode === "variance" ? "is-active" : ""}`}
                      onClick={() => setUncertaintyMode("variance")}
                    >
                      Variance
                    </button>
                  </div>
                  <div className="analysis2-table-wrap">
                    <table className="analysis2-table">
                      <thead>
                        <tr>
                          <th>Feature</th>
                          <th>{uncertaintyMode === "variance" ? "Variance" : "Std"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownUncertaintyRows.map((r) => (
                          <tr key={r.feature}>
                            <td>{r.feature}</td>
                            <td>{r.value == null ? "—" : r.value.toExponential(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            </section>
          ) : null}

          {tab === TAB_RAW ? (
            <section className="analysis2-panel">
              <JsonViewer title="Assessment raw object" data={assessment} />
              <JsonViewer title="SHAP Output" data={shapOutput} />
              <JsonViewer title="Classification output raw JSON" data={classificationOutput} />
              {isPredicted ? <JsonViewer title="Prediction output raw JSON" data={predictionOutput} /> : null}
              {isPredicted ? <JsonViewer title="Predicted CDM raw object" data={predictedRow} /> : null}
              <JsonViewer title="Input CDMs raw JSON" data={sortedInputCdms} />
            </section>
          ) : null}
        </>
      )}
    </DashboardPageLayout>
  );
}
