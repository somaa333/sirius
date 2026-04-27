import { supabase } from "../supabaseClient";

const TREND_PAGE_SIZE = 1000;
/** Safety cap so one dashboard load cannot pull unbounded rows. */
const TREND_MAX_ROWS = 25000;

/**
 * Rolling windows: current = [now-7d, now), previous = [now-14d, now-7d), UTC-based instants.
 * @returns {{ previousStartMs: number, currentStartMs: number, endMs: number, previousStartIso: string, currentStartIso: string, endIso: string }}
 */
export function getRollingTwoWeekWindowBounds() {
  const endMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const currentStartMs = endMs - sevenDaysMs;
  const previousStartMs = endMs - 2 * sevenDaysMs;
  return {
    previousStartMs,
    currentStartMs,
    endMs,
    previousStartIso: new Date(previousStartMs).toISOString(),
    currentStartIso: new Date(currentStartMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

/**
 * @param {Record<string, unknown>} r
 * @param {string} userId
 */
function isCdmRecordOwnedByUser(r, userId) {
  const createdBy = r.created_by == null ? "" : String(r.created_by);
  const upload = r.upload;
  const uploadedBy =
    upload && typeof upload === "object" && "uploaded_by" in upload
      ? String(/** @type {{ uploaded_by?: unknown }} */ (upload).uploaded_by ?? "")
      : "";
  return createdBy === userId || uploadedBy === userId;
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function importedAtMs(v) {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Fetch actual CDM rows imported in the last 14 days (by `imported_at`) for trend aggregation.
 * Same visibility rules as the dashboard CDM list (created_by or upload uploaded_by).
 * @param {string} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchCdmRecordsForTwoWeekTrend(userId) {
  const { previousStartIso, endIso } = getRollingTwoWeekWindowBounds();
  const acc = /** @type {Array<Record<string, unknown>>} */ ([]);
  let offset = 0;

  while (offset < TREND_MAX_ROWS) {
    const { data, error } = await supabase
      .from("cdm_records")
      .select("event_id, imported_at, created_by, upload:cdm_uploads(uploaded_by)")
      .eq("source_type", "actual")
      .gte("imported_at", previousStartIso)
      .lt("imported_at", endIso)
      .order("imported_at", { ascending: true })
      .range(offset, offset + TREND_PAGE_SIZE - 1);

    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    for (const row of batch) {
      if (!isCdmRecordOwnedByUser(row, userId)) continue;
      acc.push(row);
    }
    if (batch.length < TREND_PAGE_SIZE) break;
    offset += TREND_PAGE_SIZE;
  }

  return acc;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} previousStartMs
 * @param {number} currentStartMs
 * @param {number} endMs
 */
function aggregateTrendWindows(rows, previousStartMs, currentStartMs, endMs) {
  const currentEventIds = new Set();
  const previousEventIds = new Set();
  let currentRowCount = 0;
  let previousRowCount = 0;

  for (const r of rows) {
    const t = importedAtMs(r.imported_at);
    if (t == null) continue;
    const eid = r.event_id == null ? "" : String(r.event_id).trim();

    if (t >= currentStartMs && t < endMs) {
      currentRowCount += 1;
      if (eid) currentEventIds.add(eid);
    } else if (t >= previousStartMs && t < currentStartMs) {
      previousRowCount += 1;
      if (eid) previousEventIds.add(eid);
    }
  }

  const currentUniqueEvents = currentEventIds.size;
  const previousUniqueEvents = previousEventIds.size;

  const currentAvg =
    currentUniqueEvents > 0 ? currentRowCount / currentUniqueEvents : null;
  const previousAvg =
    previousUniqueEvents > 0 ? previousRowCount / previousUniqueEvents : null;

  return {
    currentUniqueEvents,
    previousUniqueEvents,
    currentRowCount,
    previousRowCount,
    currentAvg,
    previousAvg,
  };
}

/**
 * @typedef {{ line: string, tone: 'positive' | 'negative' | 'muted', arrow: 'up' | 'down' | null }} TrendLine
 */

/**
 * Count-based week-over-week trend (e.g. unique events or row totals).
 * @param {number} current
 * @param {number} previous
 * @returns {TrendLine}
 */
export function formatCountWeekTrend(current, previous) {
  if (previous === 0) {
    if (current === 0) {
      return { line: "No change this week", tone: "muted", arrow: null };
    }
    return { line: "New this week", tone: "positive", arrow: "up" };
  }
  const rawPct = ((current - previous) / previous) * 100;
  const rounded = Math.round(rawPct * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return { line: "0% from last week", tone: "muted", arrow: null };
  }
  const sign = rounded > 0 ? "+" : "";
  return {
    line: `${sign}${rounded}% from last week`,
    tone: rounded > 0 ? "positive" : "negative",
    arrow: rounded > 0 ? "up" : "down",
  };
}

/**
 * Average CDMs per event: compare current-week average to previous-week average.
 * @param {number | null} currentAvg
 * @param {number | null} previousAvg
 * @param {number} currentUniqueEvents
 * @param {number} previousUniqueEvents
 * @returns {TrendLine}
 */
export function formatAverageWeekTrend(
  currentAvg,
  previousAvg,
  currentUniqueEvents,
  previousUniqueEvents,
) {
  if (previousUniqueEvents === 0) {
    if (currentUniqueEvents === 0) {
      return { line: "No change this week", tone: "muted", arrow: null };
    }
    return { line: "New this week", tone: "positive", arrow: "up" };
  }

  if (currentUniqueEvents === 0) {
    const prev = /** @type {number} */ (previousAvg);
    const rawPct = ((0 - prev) / prev) * 100;
    const rounded = Math.round(rawPct * 10) / 10;
    return {
      line: `${rounded}% from last week`,
      tone: "negative",
      arrow: "down",
    };
  }

  const cur = /** @type {number} */ (currentAvg);
  const prev = /** @type {number} */ (previousAvg);
  const rawPct = ((cur - prev) / prev) * 100;
  const rounded = Math.round(rawPct * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return { line: "0% from last week", tone: "muted", arrow: null };
  }
  const sign = rounded > 0 ? "+" : "";
  return {
    line: `${sign}${rounded}% from last week`,
    tone: rounded > 0 ? "positive" : "negative",
    arrow: rounded > 0 ? "up" : "down",
  };
}

/**
 * Loads `cdm_records` imported in the last 14 days (`imported_at`) and returns formatted trend lines for the three KPIs.
 * @param {string} userId
 * @returns {Promise<{ events: TrendLine, rows: TrendLine, avg: TrendLine }>}
 */
export async function fetchDashboardWeeklyTrendLines(userId) {
  const bounds = getRollingTwoWeekWindowBounds();
  const rows = await fetchCdmRecordsForTwoWeekTrend(userId);
  const agg = aggregateTrendWindows(
    rows,
    bounds.previousStartMs,
    bounds.currentStartMs,
    bounds.endMs,
  );

  return {
    events: formatCountWeekTrend(
      agg.currentUniqueEvents,
      agg.previousUniqueEvents,
    ),
    rows: formatCountWeekTrend(agg.currentRowCount, agg.previousRowCount),
    avg: formatAverageWeekTrend(
      agg.currentAvg,
      agg.previousAvg,
      agg.currentUniqueEvents,
      agg.previousUniqueEvents,
    ),
  };
}
