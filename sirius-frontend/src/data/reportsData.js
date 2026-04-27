import { supabase } from "../supabaseClient";

const MAX_ROWS = 5000;

export const REPORT_TYPE_OPTIONS = [
  { value: "risk_summary", label: "Risk Summary Report" },
  { value: "cdm_event_summary", label: "CDM Event Summary Report" },
  { value: "prediction_summary", label: "Prediction Summary Report" },
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

    tableRows.push({
      event_id: eventId,
      cdms_in_event: rows.length,
      first_cdm_creation: rows[0]?.creation_date ?? null,
      latest_cdm_creation: latest?.creation_date ?? null,
      latest_tca: latest?.tca ?? null,
      minimum_miss_distance: eventMinMiss,
      maximum_collision_probability: eventMaxProb,
    });
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

export async function buildPredictionSummaryReport(userId, startDate, endDate) {
  const { startIso, endIso } = dateRangeToUtcBounds(startDate, endDate);
  const { data, error } = await supabase
    .from("risk_assessments")
    .select("*")
    .eq("created_by", userId)
    .eq("analysis_type", "predicted")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  const assessments = Array.isArray(data) ? data : [];
  const predictedIds = assessments
    .map((r) => String(r.predicted_cdm_record_id ?? "").trim())
    .filter(Boolean);

  let predictedRows = [];
  if (predictedIds.length) {
    const predResp = await supabase
      .from("predicted_cdm_records")
      .select("*")
      .eq("created_by", userId)
      .in("id", predictedIds)
      .limit(MAX_ROWS);
    if (predResp.error) throw predResp.error;
    predictedRows = Array.isArray(predResp.data) ? predResp.data : [];
  }
  const predMap = new Map(predictedRows.map((r) => [String(r.id), r]));

  const confVals = [];
  const missVals = [];
  const speedVals = [];
  const uncertainVals = [];
  let highCount = 0;
  let lowCount = 0;

  const tableRows = assessments.map((a) => {
    const confidence = toNumber(a.confidence_score);
    if (confidence != null) confVals.push(confidence);
    const risk = String(a.risk_level ?? "").toLowerCase();
    if (risk === "high") highCount += 1;
    if (risk === "low") lowCount += 1;

    const pred = predMap.get(String(a.predicted_cdm_record_id ?? ""));
    const miss = toNumber(pred?.miss_distance);
    const speed = toNumber(pred?.relative_speed);
    if (miss != null) missVals.push(miss);
    if (speed != null) speedVals.push(speed);

    let overallUncertainty = toNumber(pred?.overall_uncertainty);
    if (overallUncertainty == null) {
      const predictionOutput = parseMaybeJson(a.prediction_output);
      overallUncertainty = toNumber(predictionOutput?.overall_uncertainty);
    }
    if (overallUncertainty != null) uncertainVals.push(overallUncertainty);

    return {
      assessment_id: a.assessment_id ?? a.id ?? "—",
      event_id: a.event_id ?? "—",
      risk_level: a.risk_level ?? "—",
      confidence,
      predicted_cdm_creation: pred?.creation_date ?? null,
      predicted_miss_distance: miss,
      predicted_collision_probability: toNumber(pred?.collision_probability),
      created_at: a.created_at ?? null,
      overall_uncertainty: overallUncertainty,
    };
  });

  return {
    reportName: reportTypeLabel("prediction_summary"),
    reportType: "prediction_summary",
    summary: {
      total_predicted_analyses: assessments.length,
      average_confidence: confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : null,
      average_predicted_miss_distance: missVals.length ? missVals.reduce((a, b) => a + b, 0) / missVals.length : null,
      average_predicted_relative_speed: speedVals.length ? speedVals.reduce((a, b) => a + b, 0) / speedVals.length : null,
      average_overall_uncertainty: uncertainVals.length ? uncertainVals.reduce((a, b) => a + b, 0) / uncertainVals.length : null,
      high_risk_predicted_count: highCount,
      low_risk_predicted_count: lowCount,
    },
    tableColumns: [
      "assessment_id",
      "event_id",
      "risk_level",
      "confidence",
      "predicted_cdm_creation",
      "predicted_miss_distance",
      "predicted_collision_probability",
      "created_at",
    ],
    tableRows: sortByDateDesc(tableRows, "created_at"),
    chartData: [
      { name: "High", value: highCount },
      { name: "Low", value: lowCount },
    ],
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

export async function deleteReportHistoryRow(reportRow, userId) {
  const key = getReportPrimaryKey(reportRow);
  if (!key) return;
  const { error } = await supabase
    .from("reports")
    .delete()
    .eq(key.column, key.value)
    .eq("created_by", userId);
  if (error) throw error;
}

