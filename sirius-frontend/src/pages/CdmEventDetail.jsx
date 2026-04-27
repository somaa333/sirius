import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Breadcrumbs from "../components/Breadcrumbs";
import { useAuth } from "../AuthContext.jsx";
import { fetchCdmsForEvent, formatProbability, formatUtc } from "../data/cdmEventData.js";
import "./CdmEventDetail.css";

const COPYABLE_KEYS = new Set([
  "message_id",
  "conjunction_id",
  "object1_object_designator",
  "object2_object_designator",
]);

const FIELD_GROUPS = [
  {
    title: "Overview",
    fields: [
      "source_type",
      "conjunction_id",
      "message_id",
      "creation_date",
      "tca",
      "miss_distance",
      "collision_probability",
    ],
  },
  {
    title: "Relative Geometry",
    fields: [
      "relative_position_r",
      "relative_position_t",
      "relative_position_n",
      "relative_velocity_r",
      "relative_velocity_t",
      "relative_velocity_n",
    ],
  },
  {
    title: "Screening Window",
    fields: ["start_screen_period", "stop_screen_period", "screen_volume_shape"],
  },
  {
    title: "Collision Probability Details",
    fields: [
      "collision_probability",
      "collision_probability_method",
      "collision_max_probability",
      "collision_max_pc_method",
    ],
  },
  {
    title: "Object 1 Metadata",
    fields: [
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
    ],
  },
  {
    title: "Object 1 Physical / State Data",
    fields: [
      "object1_area_pc",
      "object1_area_pc_max",
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
    title: "Object 2 Metadata",
    fields: [
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
    ],
  },
  {
    title: "Object 2 Physical / State Data",
    fields: [
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

export default function CdmEventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [rows, setRows] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [sortOrder, setSortOrder] = useState(/** @type {'asc' | 'desc'} */ ("asc"));
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));
  const [activeTrend, setActiveTrend] = useState(
    /** @type {'missDistance' | 'collisionProbability' | 'relativeSpeed'} */ ("missDistance"),
  );
  const [copiedField, setCopiedField] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (loading || !user) return;
    const id = eventId ? decodeURIComponent(eventId) : "";
    if (!id) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setFetching(true);
    setError(null);
    fetchCdmsForEvent(id, user.id)
      .then((data) => {
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setRows([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, loading, user]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const ta = getRowDate(a) ?? "";
      const tb = getRowDate(b) ?? "";
      return sortOrder === "asc" ? ta.localeCompare(tb) : tb.localeCompare(ta);
    });
    return copy;
  }, [rows, sortOrder]);

  useEffect(() => {
    if (!sortedRows.length) {
      setSelectedId(null);
      return;
    }
    const hasSelected = selectedId != null && sortedRows.some((r) => getStableRowId(r) === selectedId);
    if (hasSelected) return;
    setSelectedId(getStableRowId(sortedRows[0]));
  }, [sortedRows, selectedId]);

  const selectedRow = useMemo(() => {
    if (!selectedId) return sortedRows[0] ?? null;
    return sortedRows.find((r) => getStableRowId(r) === selectedId) ?? sortedRows[0] ?? null;
  }, [sortedRows, selectedId]);

  const sequenceRows = useMemo(
    () =>
      sortedRows.map((row, idx) => ({
        id: getStableRowId(row),
        seq: idx + 1,
        creationDate: getRowDate(row),
        tca: toIso(row.tca),
        missDistance: toNumber(row.miss_distance),
        collisionProbability: toNumber(row.collision_probability),
        relativeSpeed: toNumber(row.relative_speed),
      })),
    [sortedRows],
  );

  const summaryMetrics = useMemo(() => {
    const creationTimes = sortedRows
      .map((r) => {
        const iso = getRowDate(r);
        if (!iso) return null;
        const t = new Date(iso).getTime();
        return Number.isNaN(t) ? null : t;
      })
      .filter((v) => v != null);
    const firstMs = creationTimes.length ? Math.min(...creationTimes) : null;
    const lastMs = creationTimes.length ? Math.max(...creationTimes) : null;
    return [
      { label: "CDMs in Event", value: String(sortedRows.length) },
      { label: "Time Span", value: formatTimeSpan(firstMs, lastMs) },
    ];
  }, [sortedRows]);

  const trendPoints = useMemo(
    () =>
      sequenceRows.map((item) => ({
        seq: item.seq,
        label: `#${item.seq}`,
        creationDate: item.creationDate,
        missDistance: item.missDistance,
        collisionProbability: item.collisionProbability,
        relativeSpeed: item.relativeSpeed,
      })),
    [sequenceRows],
  );

  const selectedSeqNo =
    selectedRow == null
      ? "—"
      : sequenceRows.find((s) => s.id === getStableRowId(selectedRow))?.seq ?? "—";

  if (loading || !user) return null;

  const id = eventId ? decodeURIComponent(eventId) : "—";

  return (
    <div className="cdm-event-page">
      <main className="cdm-event-main">
        <Breadcrumbs />
        <div className="cdm-event-shell">
          <header className="cdm-event-header">
            <Link to="/dashboard" className="cdm-event-back">
              ← Back to Dashboard
            </Link>
            <h1 className="cdm-event-title">Event Details</h1>
            <p className="cdm-event-meta">
              Event ID: <span className="cdm-event-id-value">{id}</span>
            </p>
          </header>

          {fetching ? (
            <LoadingSkeleton />
          ) : error ? (
            <p className="cdm-event-state cdm-event-state--error">{error}</p>
          ) : sortedRows.length === 0 ? (
            <p className="cdm-event-state">No CDMs were found for this event.</p>
          ) : (
            <>
              <section className="cdm-event-top-row" aria-label="Event summary and sequence table">
                <div className="cdm-event-summary-stack" aria-label="Event summary metrics">
                  {summaryMetrics.map((metric) => (
                    <article className="cdm-event-summary-card" key={metric.label}>
                      <p className="cdm-event-summary-label">{metric.label}</p>
                      <p className="cdm-event-summary-value">{metric.value || "—"}</p>
                    </article>
                  ))}
                </div>
                <section className="cdm-event-sequence-card" aria-label="CDM sequence list">
                  <h2 className="cdm-event-section-title">CDM Sequence</h2>
                  <div className="cdm-event-sequence-table-wrap">
                    <table className="cdm-event-sequence-table">
                      <thead>
                        <tr>
                          <th>CDM</th>
                          <th>Creation</th>
                          <th>TCA</th>
                          <th>Miss Distance</th>
                          <th>Collision Probability</th>
                          <th>Relative Speed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sequenceRows.map((item) => {
                          const isSelected = item.id === selectedId;
                          return (
                            <tr
                              key={item.id}
                              className={isSelected ? "is-selected" : ""}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <td>#{item.seq}</td>
                              <td className="cdm-event-mono">{formatUtc(item.creationDate)}</td>
                              <td className="cdm-event-mono">{formatUtc(item.tca)}</td>
                              <td>{formatDistance(item.missDistance)}</td>
                              <td>{formatProbability(item.collisionProbability)}</td>
                              <td>{formatSpeed(item.relativeSpeed)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>

              <section className="cdm-event-workspace" aria-label="CDM timeline and selected details">
                <div className="cdm-event-left-col">
                  <section className="cdm-event-timeline-card" aria-label="CDM timeline">
                    <div className="cdm-event-section-head">
                      <h2 className="cdm-event-section-title">CDM Timeline</h2>
                      <label className="cdm-event-control">
                        Sort
                        <select
                          value={sortOrder}
                          onChange={(e) => setSortOrder(/** @type {'asc' | 'desc'} */ (e.target.value))}
                        >
                          <option value="asc">Creation date ↑</option>
                          <option value="desc">Creation date ↓</option>
                        </select>
                      </label>
                    </div>

                    <div className="cdm-event-timeline-scroll">
                      <ol className="cdm-event-real-timeline" aria-label="CDM timeline sequence">
                        {sequenceRows.map((item) => {
                          const isSelected = item.id === selectedId;
                          return (
                            <li className="cdm-event-real-timeline-item" key={item.id}>
                              <button
                                type="button"
                                className={`cdm-event-real-node ${isSelected ? "is-selected" : ""}`}
                                onClick={() => setSelectedId(item.id)}
                                aria-label={`Select CDM ${item.seq}`}
                              >
                                <span className="cdm-event-real-node-dot" />
                                <span className="cdm-event-real-node-label">CDM #{item.seq}</span>
                                <span className="cdm-event-real-node-date">{formatUtc(item.creationDate)}</span>
                                <span className="cdm-event-node-hover" role="tooltip">
                                  <span>{formatUtc(item.creationDate)}</span>
                                  <span>Miss {formatDistance(item.missDistance)}</span>
                                  <span>Pc {formatProbability(item.collisionProbability)}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </section>

                  <section className="cdm-event-trends-card" aria-label="CDM trends">
                    <div className="cdm-event-section-head">
                      <h2 className="cdm-event-section-title">CDM Trends</h2>
                      <div className="cdm-event-tabs" role="tablist" aria-label="Trend metric">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTrend === "missDistance"}
                          className={activeTrend === "missDistance" ? "is-active" : ""}
                          onClick={() => setActiveTrend("missDistance")}
                        >
                          Miss Distance
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTrend === "collisionProbability"}
                          className={activeTrend === "collisionProbability" ? "is-active" : ""}
                          onClick={() => setActiveTrend("collisionProbability")}
                        >
                          Collision Probability
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeTrend === "relativeSpeed"}
                          className={activeTrend === "relativeSpeed" ? "is-active" : ""}
                          onClick={() => setActiveTrend("relativeSpeed")}
                        >
                          Relative Speed
                        </button>
                      </div>
                    </div>
                    <TrendChart
                      points={trendPoints}
                      dataKey={activeTrend}
                      title={getTrendTitle(activeTrend)}
                      stroke={getTrendStroke(activeTrend)}
                      unit={getTrendUnit(activeTrend)}
                    />
                  </section>

                </div>

                <aside className="cdm-event-selected-card" aria-label="Selected CDM details">
                  <div className="cdm-event-section-head">
                    <h2 className="cdm-event-section-title">Selected CDM #{selectedSeqNo}</h2>
                  </div>
                  {selectedRow ? (
                    <div className="cdm-event-detail-groups">
                      {buildSelectedDetailGroups(selectedRow).map((group, idx) => (
                        <details className="cdm-event-detail-group" key={group.title} open={idx === 0}>
                          <summary>{group.title}</summary>
                          <div className="cdm-event-detail-grid">
                            {group.fields.map((field) => (
                              <div className="cdm-event-detail-row" key={field.key}>
                                <span>{field.label}</span>
                                <strong className="cdm-event-detail-value">
                                  <span>{field.value}</span>
                                  {field.copyable ? (
                                    <button
                                      type="button"
                                      className="cdm-event-copy-btn"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        void copyFieldValue(field.key, field.raw, setCopiedField);
                                      }}
                                    >
                                      {copiedField === field.key ? "Copied" : "Copy"}
                                    </button>
                                  ) : null}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="cdm-event-state">Select a CDM to inspect details.</p>
                  )}
                </aside>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * @param {Record<string, unknown> | undefined} row
 */
function getRowDate(row) {
  if (!row) return null;
  return toIso(row.creation_date) ?? toIso(row.created_at) ?? toIso(row.inserted_at);
}

/**
 * @param {unknown} v
 */
function toIso(v) {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {unknown} v
 */
function toNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} v
 */
function formatDistance(v) {
  const n = toNumber(v);
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} km`;
}

/**
 * @param {unknown} v
 */
function formatSpeed(v) {
  const n = toNumber(v);
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} km/s`;
}

function formatTimeSpan(firstMs, lastMs) {
  if (firstMs == null || lastMs == null) return "—";
  const diff = Math.max(0, lastMs - firstMs);
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / (24 * 60));
  const hours = Math.floor((mins % (24 * 60)) / 60);
  const minutes = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * @param {Record<string, unknown>} row
 */
function getStableRowId(row) {
  if (row == null || typeof row !== "object") return "unknown-row";
  if (row.id != null && String(row.id).trim()) return String(row.id);
  const msg = row.message_id != null ? String(row.message_id) : "";
  const created = getRowDate(row) ?? "";
  const event = row.event_id != null ? String(row.event_id) : "";
  return `${event}|${msg}|${created}`;
}

/**
 * @param {Record<string, unknown>} row
 */
function buildSelectedDetailGroups(row) {
  return FIELD_GROUPS.map((group) => ({
    title: group.title,
    fields: group.fields.map((key) => ({
      key,
      label: toLabel(key),
      raw: row[key],
      value: formatFieldValue(key, row[key]),
      copyable: COPYABLE_KEYS.has(key),
    })),
  }));
}

function toLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatFieldValue(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.includes("probability")) return formatProbability(value);
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  const s = String(value);
  const iso = toIso(s);
  if (iso && (key.includes("date") || key.includes("time") || key === "tca" || key.includes("period"))) {
    return formatUtc(iso);
  }
  const n = toNumber(s);
  if (n != null && key.includes("probability")) return formatProbability(n);
  return s.trim() || "—";
}

async function copyFieldValue(fieldKey, rawValue, setCopiedField) {
  const s = String(rawValue ?? "").trim();
  if (!s) return;
  try {
    await navigator.clipboard.writeText(s);
    setCopiedField(fieldKey);
    window.setTimeout(() => setCopiedField(null), 1200);
  } catch {
    // no-op fallback; avoid noisy errors
  }
}

function LoadingSkeleton() {
  return (
    <div className="cdm-event-loading">
      <div className="cdm-event-skeleton-row" />
      <div className="cdm-event-skeleton-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="cdm-event-skeleton-card" key={String(i)} />
        ))}
      </div>
      <div className="cdm-event-skeleton-panel" />
    </div>
  );
}

function TrendChart({ title, dataKey, stroke, points, unit }) {
  const hasData = points.some((p) => Number.isFinite(p[dataKey]));
  return (
    <article className="cdm-event-chart-card">
      <h3 className="cdm-event-chart-title">{title}</h3>
      {!hasData ? (
        <p className="cdm-event-state">No values available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
            />
            <Tooltip
              formatter={(v) => [formatTrendValue(v, dataKey, unit), title]}
              labelFormatter={(label, payload) =>
                `CDM ${label} • ${formatUtc(payload?.[0]?.payload?.creationDate ?? null)}`
              }
              contentStyle={{
                background: "#0f172a",
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: 10,
                color: "#e2e8f0",
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={2.3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive
              animationDuration={550}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </article>
  );
}

function getTrendTitle(metric) {
  if (metric === "collisionProbability") return "Collision Probability over CDM sequence";
  if (metric === "relativeSpeed") return "Relative Speed over CDM sequence";
  return "Miss Distance over CDM sequence";
}

function getTrendStroke(metric) {
  if (metric === "collisionProbability") return "#60a5fa";
  if (metric === "relativeSpeed") return "#22d3ee";
  return "#a78bfa";
}

function getTrendUnit(metric) {
  if (metric === "relativeSpeed") return "km/s";
  if (metric === "missDistance") return "km";
  return "";
}

function formatTrendValue(v, dataKey, unit) {
  const n = toNumber(v);
  if (n == null) return "—";
  if (dataKey === "collisionProbability") return formatProbability(n);
  const fixed = n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return unit ? `${fixed} ${unit}` : fixed;
}
