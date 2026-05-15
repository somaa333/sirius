import { supabase } from "../supabaseClient";
import {
  groupCdmsByEvent,
  buildEventSummaries,
  formatUtc,
  formatProbability,
  fetchAllCdmRecords,
} from "./cdmEventData.js";

const MAX_ASSESSMENTS = 5000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} value
 */
function isAssessmentUuid(value) {
  return UUID_RE.test(String(value).trim());
}

/**
 * Display code from FastAPI, e.g. RA42.
 * @param {string} value
 */
function isDisplayAssessmentCode(value) {
  return /^RA\d+$/i.test(String(value).trim());
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function toIso(v) {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string | null}
 */
export function getAssessmentRowId(row) {
  const fromAssessment = normalizeAssessmentIdentifier(row.assessment_id);
  if (fromAssessment) return fromAssessment;
  const fromId = normalizeAssessmentIdentifier(row.id);
  if (fromId) return fromId;
  return null;
}

/**
 * DB PK uuid for relationship lookups.
 * @param {Record<string, unknown>} row
 */
export function getAssessmentPrimaryKey(row) {
  const fromId = normalizeAssessmentIdentifier(row.id);
  if (fromId) return fromId;
  const fromAssessment = normalizeAssessmentIdentifier(row.assessment_id);
  if (fromAssessment) return fromAssessment;
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeAssessmentIdentifier(value) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const v = String(value).trim();
    return v ? v : null;
  }
  if (typeof value === "object") {
    const rec = /** @type {Record<string, unknown>} */ (value);
    const nested =
      rec.id ??
      rec.assessment_id ??
      rec.value ??
      rec.uuid ??
      null;
    if (nested == null) return null;
    const v = String(nested).trim();
    return v ? v : null;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} row
 */
export function getEventIdFromAssessment(row) {
  const v = row.event_id ?? row.eventId;
  return v == null ? "" : String(v).trim();
}

/**
 * @param {Record<string, unknown>} row
 */
export function getAnalysisType(row) {
  const t = String(row.analysis_type ?? row.analysisType ?? "").toLowerCase();
  if (t === "actual" || t === "predicted") return t;
  return t || "—";
}

/**
 * @param {Record<string, unknown>} row
 */
export function getRiskLevel(row) {
  const r = String(row.risk_level ?? row.riskLevel ?? "").trim();
  return r || "—";
}

/**
 * @param {Record<string, unknown>} row
 */
export function getConfidence(row) {
  const n = Number(
    row.confidence_score ?? row.confidence ?? row.confidenceScore,
  );
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} row
 */
export function getRecommendedDecision(row) {
  const v =
    row.recommended_decision ??
    row.recommendedDecision ??
    row.decision ??
    row.recommendation;
  return v == null ? "—" : String(v);
}

/**
 * @param {Record<string, unknown>} row
 */
export function getClassificationProbability(row) {
  const n = Number(
    row.classification_probability ?? row.classificationProbability,
  );
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} row
 */
export function getStatus(row) {
  return String(row.status ?? row.job_status ?? "—");
}

/**
 * @param {Record<string, unknown>} row
 */
export function getPredictionOutput(row) {
  return row.prediction_output ?? row.predictionOutput;
}

/**
 * @param {Record<string, unknown>} row
 */
export function getClassificationOutput(row) {
  return row.classification_output ?? row.classificationOutput;
}

/**
 * Parsed SHAP explanation payload (may be null for older assessments).
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown> | null}
 */
export function getShapOutput(row) {
  const raw = row.shap_output ?? row.shapOutput;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return /** @type {Record<string, unknown>} */ (JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  return null;
}

/**
 * @param {Record<string, unknown>} row
 */
export function getPredictedCdmRecordId(row) {
  const v = row.predicted_cdm_record_id ?? row.predictedCdmRecordId;
  return v == null || v === "" ? null : String(v);
}

/**
 * Event summaries for the analysis picker (newest latest_creation_date first).
 * Uses the same ownership rules as the Dashboard: `created_by` OR upload `uploaded_by`.
 * @param {string} userId
 * @returns {Promise<ReturnType<typeof buildEventSummaries>>}
 */
export async function fetchAnalysisEventSummaries(userId) {
  const records = await fetchAllCdmRecords(userId);
  const { grouped } = groupCdmsByEvent(records);
  return buildEventSummaries(grouped);
}

/**
 * @param {'actual' | 'predicted'} path
 * @param {ReturnType<typeof buildEventSummaries>} summaries
 */
export function filterEventSummariesByPath(path, summaries) {
  const min = path === "actual" ? 1 : 3;
  return summaries.filter((s) => s.cdmCount >= min);
}

/**
 * @param {string} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchRiskAssessments(userId) {
  const { data, error } = await supabase
    .from("risk_assessments")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_ASSESSMENTS);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} idOrCode — uuid or display code (RA…)
 * @param {string} userId
 * @returns {Promise<string | null>} risk_assessments.id (uuid)
 */
async function resolveAssessmentPkForDelete(idOrCode, userId) {
  const row = await fetchRiskAssessmentById(idOrCode, userId);
  if (!row) return null;
  return getAssessmentPrimaryKey(row);
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
function mapRiskAssessmentDeleteRpcError(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "Could not delete assessment.");
  if (code === "PGRST202" || /delete_risk_assessment/i.test(message)) {
    return new Error(
      "Delete is not configured on the database yet. Apply the Supabase migration `20260515120000_delete_risk_assessment.sql`, then try again.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * @param {unknown} payload
 */
function assertRiskAssessmentDeleteRpcOk(payload) {
  if (payload?.ok === true) return;
  const reason = String(payload?.reason ?? "");
  if (reason === "not_found" || reason === "not_deleted") {
    throw new Error("Assessment not found or you do not have permission to delete it.");
  }
  throw new Error("Assessment could not be deleted.");
}

/**
 * @param {string} id
 * @param {string} userId
 */
export async function deleteRiskAssessment(id, userId) {
  const pk = await resolveAssessmentPkForDelete(id, userId);
  if (!pk) {
    throw new Error("Assessment not found or you do not have permission to delete it.");
  }

  const { data, error } = await supabase.rpc("delete_risk_assessment", {
    p_assessment_id: pk,
  });
  if (error) throw mapRiskAssessmentDeleteRpcError(error);
  assertRiskAssessmentDeleteRpcOk(data);
}

/**
 * @param {string[]} ids
 * @param {string} userId
 */
export async function deleteRiskAssessments(ids, userId) {
  const keys = [...new Set((ids ?? []).map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (!keys.length) return;

  const pks = [];
  for (const key of keys) {
    const pk = await resolveAssessmentPkForDelete(key, userId);
    if (pk) pks.push(pk);
  }
  const uniquePks = [...new Set(pks)];
  if (!uniquePks.length) {
    throw new Error("No assessments could be found to delete.");
  }

  const { data, error } = await supabase.rpc("delete_risk_assessments", {
    p_assessment_ids: uniquePks,
  });
  if (error) throw mapRiskAssessmentDeleteRpcError(error);

  if (data?.ok === true) return;

  const reason = String(data?.reason ?? "");
  const deleted = Number(data?.deleted ?? 0);
  const requested = Number(data?.requested ?? uniquePks.length);

  if (reason === "partial" && deleted > 0) {
    throw new Error(`Only ${deleted} of ${requested} selected assessments were deleted.`);
  }
  if (reason === "not_found" || deleted === 0) {
    throw new Error("No assessments could be deleted. They may not exist or you may not have permission.");
  }
  throw new Error("Assessments could not be deleted.");
}

/**
 * @param {string} assessmentId
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function fetchRiskAssessmentById(assessmentId, userId) {
  const id = String(assessmentId).trim();
  if (!id) return null;

  // Query by display code first — never pass RA… into a uuid `id` column (Postgres error).
  if (isDisplayAssessmentCode(id)) {
    const byCode = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("assessment_id", id)
      .eq("created_by", userId)
      .maybeSingle();
    if (byCode.error) throw byCode.error;
    return byCode.data ? /** @type {Record<string, unknown>} */ (byCode.data) : null;
  }

  if (isAssessmentUuid(id)) {
    const byPk = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("id", id)
      .eq("created_by", userId)
      .maybeSingle();
    if (byPk.error) throw byPk.error;
    if (byPk.data) return /** @type {Record<string, unknown>} */ (byPk.data);
  }

  const byAlt = await supabase
    .from("risk_assessments")
    .select("*")
    .eq("assessment_id", id)
    .eq("created_by", userId)
    .maybeSingle();
  if (byAlt.error) throw byAlt.error;
  return byAlt.data ? /** @type {Record<string, unknown>} */ (byAlt.data) : null;
}

/**
 * @param {string} assessmentId — FK to risk_assessments.id
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchAssessmentCdmLinks(assessmentId) {
  const id = String(assessmentId).trim();
  const { data, error } = await supabase
    .from("assessment_cdm_links")
    .select("*")
    .eq("assessment_id", id);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return sortLinksByCreationDate(rows);
}

/**
 * @param {string[]} ids
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
export async function fetchCdmRecordsByIds(ids) {
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  if (!unique.length) return new Map();

  const { data, error } = await supabase
    .from("cdm_records")
    .select("*")
    .in("id", unique);
  if (error) throw error;
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  for (const row of data ?? []) {
    const id = row?.id != null ? String(row.id) : "";
    if (id) map.set(id, /** @type {Record<string, unknown>} */ (row));
  }
  return map;
}

/**
 * @param {string | null | undefined} predictedId
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function fetchPredictedCdmRecordById(predictedId, userId) {
  if (predictedId == null || predictedId === "") return null;
  const id = String(predictedId).trim();
  const { data, error } = await supabase
    .from("predicted_cdm_records")
    .select("*")
    .eq("id", id)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? /** @type {Record<string, unknown>} */ (data) : null;
}

/**
 * @param {unknown} v
 */
export function linkCdmRecordId(linkRow) {
  const r = /** @type {Record<string, unknown>} */ (linkRow);
  return (
    r.cdm_record_id ??
    r.cdm_id ??
    r.record_id ??
    r.cdm_records_id
  );
}

/**
 * Sort links by creation_date ascending (fallback: id).
 * @param {Array<Record<string, unknown>>} links
 */
export function sortLinksByCreationDate(links) {
  return [...links].sort((a, b) => {
    const da = toIso(a.creation_date ?? a.created_at) ?? "";
    const db = toIso(b.creation_date ?? b.created_at) ?? "";
    if (da !== db) return da.localeCompare(db);
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

export { formatUtc, formatProbability };
