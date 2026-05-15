/**
 * Report definitions and Supabase persistence for the Reports page.
 * Builds risk summary and CDM event summaries from `risk_assessments`, `cdm_records`, and `reports`.
 */
import { supabase } from "../supabaseClient";

const MAX_ROWS = 5000;

export const REPORT_TYPE_OPTIONS = [
  { value: "risk_summary", label: "Risk Summary Report" },
  { value: "cdm_event_summary", label: "CDM Event Summary Report" },
];

function toIso(value) {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateRangeToUtcBounds(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function normalizeFileType(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "pdf" || v === "csv" || v === "both") return v;
  return null;
}

export function mergeFileType(currentType, nextType) {
  const curr = normalizeFileType(currentType);
  const next = normalizeFileType(nextType);
  if (!next) return curr;
  if (!curr) return next;
  if (curr === next) return curr;
  return "both";
}

function reportTypeLabel(reportType) {
  return (
    REPORT_TYPE_OPTIONS.find((opt) => opt.value === reportType)?.label ?? "Report"
  );
}

function sortByDateDesc(rows, field) {
  return [...rows].sort((a, b) => {
    const da = toIso(a?.[field]) ?? "";
    const db = toIso(b?.[field]) ?? "";
    return db.localeCompare(da);
  });
}

export function getReportPrimaryKey(reportRow) {
  if (!reportRow || typeof reportRow !== "object") return null;
  const id = reportRow.id;
  if (id != null && String(id).trim()) return { column: "id", value: String(id) };
  const reportId = reportRow.report_id;
  if (reportId != null && String(reportId).trim()) {
    return { column: "report_id", value: String(reportId) };
  }
  return null;
}

function canReadCdmForUser(row, userId) {
  const createdBy = String(row.created_by ?? "");
  const uploadedBy =
    row.upload && typeof row.upload === "object"
      ? String(row.upload.uploaded_by ?? "")
      : "";
  return createdBy === userId || uploadedBy === userId;
}

async function fetchCdmRowsForUserInRange(userId, startDate, endDate) {
  const { startIso, endIso } = dateRangeToUtcBounds(startDate, endDate);
  const { data, error } = await supabase
    .from("cdm_records")
    .select("*, upload:cdm_uploads(uploaded_by)")
    .eq("source_type", "actual")
    .order("imported_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return rows.filter((r) => {
    if (!canReadCdmForUser(r, userId)) return false;
    const iso = toIso(r.imported_at) ?? toIso(r.creation_date);
    if (!iso) return false;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return false;
    return ms >= startMs && ms <= endMs;
  });
}

export async function buildRiskSummaryReport(userId, startDate, endDate) {
  const { startIso, endIso } = dateRangeToUtcBounds(startDate, endDate);
  const { data, error } = await supabase
    .from("risk_assessments")
    .select("*")
    .eq("created_by", userId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  const assessmentIds = rows
    .map((r) => String(r.id ?? "").trim())
    .filter(Boolean);
  let links = [];
  if (assessmentIds.length) {
    const linksResp = await supabase
      .from("assessment_cdm_links")
      .select("assessment_id, cdm_record_id")
      .in("assessment_id", assessmentIds)
      .limit(MAX_ROWS);
    if (linksResp.error) throw linksResp.error;
    links = Array.isArray(linksResp.data) ? linksResp.data : [];
  }
  const linkedCdmCount = links.length;

  const total = rows.length;
  const actualCount = rows.filter((r) => String(r.analysis_type).toLowerCase() === "actual").length;
  const predictedCount = rows.filter((r) => String(r.analysis_type).toLowerCase() === "predicted").length;
  const highRisk = rows.filter((r) => String(r.risk_level).toLowerCase() === "high").length;
  const lowRisk = rows.filter((r) => String(r.risk_level).toLowerCase() === "low").length;
  const waitCount = rows.filter((r) => String(r.recommended_decision).toLowerCase() === "wait").length;
  const maneuverCount = rows.filter((r) => String(r.recommended_decision).toLowerCase() === "maneuver").length;

  const confVals = rows.map((r) => toNumber(r.confidence_score)).filter((n) => n != null);
  const probVals = rows
    .map((r) => toNumber(r.classification_probability))
    .filter((n) => n != null);

  const summary = {
    total_analyses: total,
    actual_analyses: actualCount,
    predicted_analyses: predictedCount,
    high_risk_count: highRisk,
    low_risk_count: lowRisk,
    average_confidence: confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : null,
    average_classification_probability: probVals.length
      ? probVals.reduce((a, b) => a + b, 0) / probVals.length
      : null,
    wait_count: waitCount,
    maneuver_count: maneuverCount,
    linked_cdm_count: linkedCdmCount,
  };

  const tableRows = rows.map((r) => ({
    assessment_id: r.assessment_id ?? r.id ?? "—",
    event_id: r.event_id ?? "—",
    analysis_type: r.analysis_type ?? "—",
    risk_level: r.risk_level ?? "—",
    confidence: toNumber(r.confidence_score),
    recommended_decision: r.recommended_decision ?? "—",
    created_at: r.created_at ?? null,
  }));

  return {
    reportName: reportTypeLabel("risk_summary"),
    reportType: "risk_summary",
    summary,
    tableColumns: [
      "assessment_id",
      "event_id",
      "analysis_type",
      "risk_level",
      "confidence",
      "recommended_decision",
      "created_at",
    ],
    tableRows: sortByDateDesc(tableRows, "created_at"),
    chartData: [
      { name: "Wait", value: waitCount },
      { name: "Maneuver", value: maneuverCount },
    ],
  };
}

export async function buildCdmEventSummaryReport(userId, startDate, endDate) {
  const cdmRows = await fetchCdmRowsForUserInRange(userId, startDate, endDate);
  /** @type {Map<string, any[]>} */
  const byEvent = new Map();
  for (const row of cdmRows) {
    const eventId = String(row.event_id ?? "").trim();
    if (!eventId) continue;
    if (!byEvent.has(eventId)) byEvent.set(eventId, []);
    byEvent.get(eventId)?.push(row);
  }

  const tableRows = [];
  let minMissDistance = null;
  let maxCollisionProbability = null;
  let speedSum = 0;
  let speedCount = 0;
  let largestEventId = null;
  let largestCdmCount = 0;
  let smallestEventId = null;
  let smallestCdmCount = Infinity;

  for (const [eventId, rows] of byEvent.entries()) {
    rows.sort((a, b) => (toIso(a.creation_date) ?? "").localeCompare(toIso(b.creation_date) ?? ""));
    const missVals = rows.map((r) => toNumber(r.miss_distance)).filter((n) => n != null);
    const probVals = rows.map((r) => toNumber(r.collision_probability)).filter((n) => n != null);
    const speedVals = rows.map((r) => toNumber(r.relative_speed)).filter((n) => n != null);
    const eventMinMiss = missVals.length ? Math.min(...missVals) : null;
    const eventMaxProb = probVals.length ? Math.max(...probVals) : null;
    const latest = rows[rows.length - 1];

    if (eventMinMiss != null) {
      minMissDistance = minMissDistance == null ? eventMinMiss : Math.min(minMissDistance, eventMinMiss);
    }
    if (eventMaxProb != null) {
      maxCollisionProbability =
        maxCollisionProbability == null
          ? eventMaxProb
          : Math.max(maxCollisionProbability, eventMaxProb);
    }
    for (const v of speedVals) {
      speedSum += v;
      speedCount += 1;
    }

    const cdmCount = rows.length;
    tableRows.push({
      event_id: eventId,
      cdms_in_event: cdmCount,
      first_cdm_creation: rows[0]?.creation_date ?? null,
      latest_cdm_creation: latest?.creation_date ?? null,
      latest_tca: latest?.tca ?? null,
      minimum_miss_distance: eventMinMiss,
      maximum_collision_probability: eventMaxProb,
    });
    if (cdmCount > largestCdmCount) {
      largestCdmCount = cdmCount;
      largestEventId = eventId;
    }
    if (cdmCount < smallestCdmCount) {
      smallestCdmCount = cdmCount;
      smallestEventId = eventId;
    }
  }

  const totalEvents = byEvent.size;
  const totalRows = cdmRows.length;

  return {
    reportName: reportTypeLabel("cdm_event_summary"),
    reportType: "cdm_event_summary",
    summary: {
      total_events: totalEvents,
      total_cdm_rows: totalRows,
      average_cdms_per_event: totalEvents ? totalRows / totalEvents : null,
      minimum_miss_distance: minMissDistance,
      maximum_collision_probability: maxCollisionProbability,
      average_relative_speed: speedCount ? speedSum / speedCount : null,
      largest_event_id: largestEventId,
      largest_event_cdm_count: totalEvents ? largestCdmCount : null,
      smallest_event_id: smallestEventId,
      smallest_event_cdm_count: totalEvents ? smallestCdmCount : null,
    },
    tableColumns: [
      "event_id",
      "cdms_in_event",
      "first_cdm_creation",
      "latest_cdm_creation",
      "latest_tca",
      "minimum_miss_distance",
      "maximum_collision_probability",
    ],
    tableRows: sortByDateDesc(tableRows, "latest_cdm_creation"),
    chartData: tableRows.slice(0, 12).map((r) => ({ name: r.event_id, value: r.cdms_in_event })),
  };
}

export async function fetchReportHistory(userId) {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Number of persisted reports for this user (matches Reports history / `reports.created_by`).
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countReportsForUser(userId) {
  const id = String(userId ?? "").trim();
  if (!id) return 0;
  const { count, error } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("created_by", id);
  if (error) throw error;
  return typeof count === "number" ? count : 0;
}

export async function createReportHistoryRow(payload) {
  const { data, error } = await supabase
    .from("reports")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateReportHistoryFileType(reportRow, fileType, userId) {
  const key = getReportPrimaryKey(reportRow);
  if (!key) return reportRow;
  const mergedType = mergeFileType(reportRow?.file_type, fileType);
  const { data, error } = await supabase
    .from("reports")
    .update({ file_type: mergedType })
    .eq(key.column, key.value)
    .eq("created_by", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

const REPORT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Stable key for selection / delete (prefer internal uuid).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function getReportHistoryRowKey(row) {
  if (!row || typeof row !== "object") return "";
  const id = row.id;
  if (id != null && REPORT_UUID_RE.test(String(id))) return String(id).trim();
  const code = row.report_id;
  if (code != null && String(code).trim()) return String(code).trim();
  return "";
}

/**
 * Human-readable report code for display (e.g. RP4).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function getReportDisplayId(row) {
  if (!row || typeof row !== "object") return "—";
  const code = row.report_id;
  if (code != null && String(code).trim()) return String(code).trim();
  const id = row.id;
  if (id != null && String(id).trim()) return String(id).trim();
  return "—";
}

/**
 * @param {unknown} payload
 */
function normalizeRpcPayload(payload) {
  if (payload == null) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload;
}

/**
 * @param {unknown} payload
 */
function isRpcOk(payload) {
  const body = normalizeRpcPayload(payload);
  if (!body || typeof body !== "object") return false;
  return body.ok === true || body.ok === "true";
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
function mapReportDeleteRpcError(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "Could not delete report.");
  if (code === "PGRST202" || /delete_report/i.test(message)) {
    return new Error(
      "Delete is not configured on the database yet. Apply the Supabase migration `20260515130000_delete_report.sql`, then try again.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * @param {unknown} payload
 */
function assertReportDeleteRpcOk(payload) {
  if (isRpcOk(payload)) return;
  const body = normalizeRpcPayload(payload);
  const reason = String(body?.reason ?? "");
  if (reason === "not_found") {
    throw new Error("Report not found or you do not have permission to delete it.");
  }
  throw new Error("Report could not be deleted.");
}

/**
 * @param {Record<string, unknown>} reportRow
 * @param {string} userId
 * @returns {Promise<string | null>}
 */
async function resolveReportIdForDelete(reportRow, userId) {
  const rowKey = getReportHistoryRowKey(reportRow);
  if (!rowKey) return null;

  if (REPORT_UUID_RE.test(rowKey)) {
    const { data, error } = await supabase
      .from("reports")
      .select("id")
      .eq("id", rowKey)
      .eq("created_by", userId)
      .maybeSingle();
    if (error) throw error;
    return data?.id ? String(data.id) : null;
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id")
    .eq("report_id", rowKey)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

/**
 * @param {string} pk
 * @param {string} userId
 */
async function deleteReportByPk(pk, userId) {
  const { data, error } = await supabase
    .from("reports")
    .delete()
    .eq("id", pk)
    .eq("created_by", userId)
    .select("id");

  if (error) throw error;
  if (data?.length) return;

  const { data: rpcData, error: rpcError } = await supabase.rpc("delete_report", { p_id: pk });
  if (rpcError) throw mapReportDeleteRpcError(rpcError);
  assertReportDeleteRpcOk(rpcData);
}

/**
 * @param {Record<string, unknown>} reportRow
 * @param {string} userId
 */
export async function deleteReportHistoryRow(reportRow, userId) {
  const pk = await resolveReportIdForDelete(reportRow, userId);
  if (!pk) {
    throw new Error("Report not found or you do not have permission to delete it.");
  }

  await deleteReportByPk(pk, userId);
}

/**
 * @param {Record<string, unknown>[]} reportRows
 * @param {string} userId
 */
export async function deleteReportHistoryRows(reportRows, userId) {
  const rows = Array.isArray(reportRows) ? reportRows : [];
  if (!rows.length) {
    throw new Error("No reports selected to delete.");
  }

  const pks = [];
  for (const row of rows) {
    const pk = await resolveReportIdForDelete(row, userId);
    if (pk) pks.push(pk);
  }
  const uniquePks = [...new Set(pks)];
  if (!uniquePks.length) {
    throw new Error("No reports could be found to delete.");
  }

  const { data, error } = await supabase
    .from("reports")
    .delete()
    .in("id", uniquePks)
    .eq("created_by", userId)
    .select("id");

  if (error) throw error;

  const deletedCount = data?.length ?? 0;
  if (deletedCount === uniquePks.length) return;

  const remaining = uniquePks.filter((id) => !(data ?? []).some((row) => String(row.id) === id));
  if (!remaining.length) return;

  const { data: rpcData, error: rpcError } = await supabase.rpc("delete_reports", {
    p_ids: remaining,
  });
  if (rpcError) throw mapReportDeleteRpcError(rpcError);

  if (isRpcOk(rpcData)) return;

  const body = normalizeRpcPayload(rpcData);
  const reason = String(body?.reason ?? "");
  const rpcDeleted = Number(body?.deleted ?? 0);
  const requested = Number(body?.requested ?? remaining.length);
  const totalDeleted = deletedCount + rpcDeleted;

  if (reason === "partial" && totalDeleted > 0) {
    throw new Error(`Only ${totalDeleted} of ${uniquePks.length} selected reports were deleted.`);
  }
  if (totalDeleted === 0) {
    throw new Error("No reports could be deleted. They may not exist or you may not have permission.");
  }
  if (totalDeleted < uniquePks.length) {
    throw new Error(`Only ${totalDeleted} of ${uniquePks.length} selected reports were deleted.`);
  }
}

