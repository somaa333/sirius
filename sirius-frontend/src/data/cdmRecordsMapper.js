import { supabase } from "../supabaseClient";

/**
 * Normalize risk for dashboard badges.
 * @param {unknown} raw
 * @returns {'high' | 'low'}
 */
export function normalizeRiskLevel(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "high" || s === "h" || s === "red") return "high";
  return "low";
}

/**
 * @param {unknown} raw
 * @returns {number} 0–1
 */
export function normalizeConfidence(raw) {
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    if (raw > 1 && raw <= 100) return raw / 100;
    if (raw >= 0 && raw <= 1) return raw;
  }
  const n = parseFloat(String(raw));
  if (!Number.isNaN(n)) {
    if (n > 1 && n <= 100) return n / 100;
    if (n >= 0 && n <= 1) return n;
  }
  return 0;
}

/**
 * Map a `cdm_records` row to dashboard event shape.
 * Tolerates common column naming variants.
 * @param {Record<string, unknown>} row
 */
export function mapCdmRecordToEvent(row) {
  const id = String(
    row.event_id ??
      row.event_cdm_id ??
      row.cdm_id ??
      row.id ??
      "unknown",
  );

  const ts =
    row.conjunction_time ??
    row.event_time ??
    row.timestamp ??
    row.t_ca ??
    row.closest_approach_time ??
    row.created_at ??
    row.inserted_at;

  let timestamp;
  if (ts instanceof Date) {
    timestamp = ts.toISOString();
  } else if (typeof ts === "string" || typeof ts === "number") {
    const d = new Date(ts);
    timestamp = Number.isNaN(d.getTime())
      ? new Date().toISOString()
      : d.toISOString();
  } else {
    timestamp = new Date().toISOString();
  }

  const decisionRaw =
    row.decision ??
    row.maneuver_decision ??
    row.recommended_action ??
    row.action ??
    "Monitor";

  const decision = String(decisionRaw);

  return {
    id,
    timestamp,
    riskLevel: normalizeRiskLevel(row.risk_level ?? row.risk ?? row.collision_risk),
    confidence: normalizeConfidence(
      row.confidence ?? row.pc ?? row.collision_probability,
    ),
    decision,
    sourceType: "actual",
    status: String(row.status ?? "imported"),
  };
}

/**
 * Fetch actual CDM rows for the operator dashboard.
 * @returns {Promise<Array<ReturnType<typeof mapCdmRecordToEvent>>>}
 */
export async function fetchActualCdmRecords() {
  const { data, error } = await supabase
    .from("cdm_records")
    .select("*")
    .eq("source_type", "actual")
    .limit(2000);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) =>
    mapCdmRecordToEvent(/** @type {Record<string, unknown>} */ (r)),
  );
}

/**
 * Build risk trend series from events (for Actual CDM source).
 * @param {Array<{ timestamp: string, riskLevel: string }>} events
 * @param {string} dateStart YYYY-MM-DD
 * @param {string} dateEnd YYYY-MM-DD
 */
export function buildTrendFromActualEvents(events, dateStart, dateEnd) {
  const startMs = new Date(`${dateStart}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${dateEnd}T23:59:59.999Z`).getTime();

  /** @type {Map<string, { highRisk: number, lowRisk: number }>} */
  const byDay = new Map();

  for (const e of events) {
    const t = new Date(e.timestamp).getTime();
    if (t < startMs || t > endMs) continue;
    const d = new Date(e.timestamp);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    if (!byDay.has(key)) {
      byDay.set(key, {
        date: label,
        dateKey: key,
        highRisk: 0,
        lowRisk: 0,
      });
    }
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (e.riskLevel === "high") {
      bucket.highRisk += 1;
    } else {
      bucket.lowRisk += 1;
    }
  }

  return Array.from(byDay.values()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey),
  );
}
