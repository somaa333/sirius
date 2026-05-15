import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { parse } from "csv-parse";

export const BUCKET = "cdm-uploads";
export const INSERT_BATCH_SIZE = 500;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const EXPECTED_HEADERS = [
  "conjunction_id",
  "ccsds_cdm_vers",
  "comment_header",
  "creation_date",
  "originator",
  "classification",
  "message_for",
  "message_id",
  "event_id",
  "comment_relative_metadata_data",
  "tca",
  "miss_distance",
  "relative_speed",
  "relative_position_r",
  "relative_position_t",
  "relative_position_n",
  "relative_velocity_r",
  "relative_velocity_t",
  "relative_velocity_n",
  "start_screen_period",
  "stop_screen_period",
  "screen_volume_shape",
  "screen_volume_radius",
  "screen_entry_time",
  "screen_exit_time",
  "collision_probability",
  "collision_probability_method",
  "collision_max_probability",
  "collision_max_pc_method",
  "previous_message_id",
  "previous_message_epoch",
  "next_message_epoch",
  "comment_object1_metadata",
  "object1_object_designator",
  "object1_catalog_name",
  "object1_object_name",
  "object1_international_designator",
  "object1_object_type",
  "object1_operator_organization",
  "object1_ephemeris_name",
  "object1_covariance_method",
  "object1_maneuverable",
  "object1_orbit_center",
  "object1_ref_frame",
  "object1_cov_type",
  "object1_cov_ref_frame",
  "object1_gravity_model",
  "object1_atmospheric_model",
  "object1_n_body_perturbations",
  "object1_solar_rad_pressure",
  "object1_earth_tides",
  "comment_object1_od_parameters",
  "object1_time_lastob_start",
  "object1_time_lastob_end",
  "object1_recommended_od_span",
  "object1_actual_od_span",
  "object1_obs_available",
  "object1_obs_used",
  "object1_tracks_available",
  "object1_tracks_used",
  "object1_residuals_accepted",
  "object1_weighted_rms",
  "comment_object1_data_additional_parameters",
  "object1_area_pc",
  "object1_area_pc_max",
  "object1_mass",
  "object1_hbr",
  "comment_object1_state_vector",
  "object1_x",
  "object1_y",
  "object1_z",
  "object1_x_dot",
  "object1_y_dot",
  "object1_z_dot",
  "comment_object1_covmatrix",
  "object1_cr_r",
  "object1_ct_r",
  "object1_ct_t",
  "object1_cn_r",
  "object1_cn_t",
  "object1_cn_n",
  "object1_crdot_r",
  "object1_crdot_t",
  "object1_crdot_n",
  "object1_crdot_rdot",
  "object1_ctdot_r",
  "object1_ctdot_t",
  "object1_ctdot_n",
  "object1_ctdot_rdot",
  "object1_ctdot_tdot",
  "object1_cndot_r",
  "object1_cndot_t",
  "object1_cndot_n",
  "object1_cndot_rdot",
  "object1_cndot_tdot",
  "object1_cndot_ndot",
  "comment_object2_metadata",
  "object2_object_designator",
  "object2_catalog_name",
  "object2_object_name",
  "object2_international_designator",
  "object2_object_type",
  "object2_operator_organization",
  "object2_ephemeris_name",
  "object2_covariance_method",
  "object2_maneuverable",
  "object2_orbit_center",
  "object2_ref_frame",
  "object2_cov_type",
  "object2_cov_ref_frame",
  "object2_gravity_model",
  "object2_atmospheric_model",
  "object2_n_body_perturbations",
  "object2_solar_rad_pressure",
  "object2_earth_tides",
  "comment_object2_od_parameters",
  "object2_time_lastob_start",
  "object2_time_lastob_end",
  "object2_recommended_od_span",
  "object2_actual_od_span",
  "object2_obs_available",
  "object2_obs_used",
  "object2_tracks_available",
  "object2_tracks_used",
  "object2_residuals_accepted",
  "object2_weighted_rms",
  "comment_object2_data_additional_parameters",
  "object2_area_pc",
  "object2_area_pc_max",
  "object2_mass",
  "object2_hbr",
  "comment_object2_state_vector",
  "object2_x",
  "object2_y",
  "object2_z",
  "object2_x_dot",
  "object2_y_dot",
  "object2_z_dot",
  "comment_object2_covmatrix",
  "object2_cr_r",
  "object2_ct_r",
  "object2_ct_t",
  "object2_cn_r",
  "object2_cn_t",
  "object2_cn_n",
  "object2_crdot_r",
  "object2_crdot_t",
  "object2_crdot_n",
  "object2_crdot_rdot",
  "object2_ctdot_r",
  "object2_ctdot_t",
  "object2_ctdot_n",
  "object2_ctdot_rdot",
  "object2_ctdot_tdot",
  "object2_cndot_r",
  "object2_cndot_t",
  "object2_cndot_n",
  "object2_cndot_rdot",
  "object2_cndot_tdot",
  "object2_cndot_ndot",
] as const;

const REQUIRED_FIELDS = [
  "conjunction_id",
  "ccsds_cdm_vers",
  "creation_date",
  "originator",
  "message_id",
  "event_id",
  "tca",
  "miss_distance",
  "relative_speed",
  "collision_probability",
] as const;

const BIGINT_FIELDS = new Set([
  "conjunction_id",
  "event_id",
  "screen_volume_radius",
  "object1_object_designator",
  "object2_object_designator",
]);

const DOUBLE_FIELDS = new Set([
  "miss_distance",
  "relative_speed",
  "relative_position_r",
  "relative_position_t",
  "relative_position_n",
  "relative_velocity_r",
  "relative_velocity_t",
  "relative_velocity_n",
  "collision_probability",
  "collision_max_probability",
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
  "object1_ct_r",
  "object1_ct_t",
  "object1_cn_r",
  "object1_cn_t",
  "object1_cn_n",
  "object1_crdot_r",
  "object1_crdot_t",
  "object1_crdot_n",
  "object1_crdot_rdot",
  "object1_ctdot_r",
  "object1_ctdot_t",
  "object1_ctdot_n",
  "object1_ctdot_rdot",
  "object1_ctdot_tdot",
  "object1_cndot_r",
  "object1_cndot_t",
  "object1_cndot_n",
  "object1_cndot_rdot",
  "object1_cndot_tdot",
  "object1_cndot_ndot",
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
  "object2_ct_r",
  "object2_ct_t",
  "object2_cn_r",
  "object2_cn_t",
  "object2_cn_n",
  "object2_crdot_r",
  "object2_crdot_t",
  "object2_crdot_n",
  "object2_crdot_rdot",
  "object2_ctdot_r",
  "object2_ctdot_t",
  "object2_ctdot_n",
  "object2_ctdot_rdot",
  "object2_ctdot_tdot",
  "object2_cndot_r",
  "object2_cndot_t",
  "object2_cndot_n",
  "object2_cndot_rdot",
  "object2_cndot_tdot",
  "object2_cndot_ndot",
]);

const NUMERIC_1DP_FIELDS = new Set([
  "ccsds_cdm_vers",
]);

const TIMESTAMPTZ_FIELDS = new Set([
  "creation_date",
  "tca",
  "start_screen_period",
  "stop_screen_period",
  "screen_entry_time",
  "screen_exit_time",
  "previous_message_epoch",
  "next_message_epoch",
  "object1_time_lastob_start",
  "object1_time_lastob_end",
  "object2_time_lastob_start",
  "object2_time_lastob_end",
]);

const COMMENT_FIELDS = new Set([
  "comment_header",
  "comment_relative_metadata_data",
  "comment_object1_metadata",
  "comment_object1_od_parameters",
  "comment_object1_data_additional_parameters",
  "comment_object1_state_vector",
  "comment_object1_covmatrix",
  "comment_object2_metadata",
  "comment_object2_od_parameters",
  "comment_object2_data_additional_parameters",
  "comment_object2_state_vector",
  "comment_object2_covmatrix",
]);

const MANEUVERABLE_ALLOWED = new Set(["YES", "NO", "UNKNOWN"]);
const OBJECT_TYPE_ALLOWED = new Set(["PAYLOAD", "DEBRIS", "ROCKET BODY", "UNKNOWN"]);

type FieldError = {
  field_name: string;
  error_code: string;
  error_message: string;
  raw_value: string | null;
};

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

export function nowIso() {
  return new Date().toISOString();
}

function asTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function parseBigintField(value: unknown): number | null {
  const s = asTrimmedString(value);
  if (s === null) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function parseDoubleField(value: unknown): number | null {
  const s = asTrimmedString(value);
  if (s === null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseNumeric1Dp(value: unknown): number | null {
  const s = asTrimmedString(value);
  if (s === null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(1));
}

function parseTimestamp(value: unknown): string | null {
  const s0 = asTrimmedString(value);
  if (s0 === null) return null;

  const lowered = s0.toLowerCase();
  if (
    lowered === "null" ||
    lowered === "none" ||
    lowered === "n/a" ||
    lowered === "nan"
  ) {
    return null;
  }

  // Normalize common dataset forms:
  // 1) "YYYY-MM-DD HH:MM:SS(.ffffff)"
  // 2) "YYYY-MM-DDTHH:MM:SS(.ffffff)"
  // 3) optional trailing Z
  // 4) optional timezone offset like +00:00
  const m = s0.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:\s*(Z|[+-]\d{2}:\d{2}))?$/
  );

  if (!m) {
    return null;
  }

  const [, year, month, day, hour, minute, second, fractionRaw, tzRaw] = m;

  // JS Date supports milliseconds, so normalize microseconds -> milliseconds
  const milliseconds = (fractionRaw ?? "").padEnd(3, "0").slice(0, 3);
  const tz = tzRaw ?? "Z";

  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${tz}`;
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return d.toISOString();
}

function addError(
  errors: FieldError[],
  field_name: string,
  error_code: string,
  error_message: string,
  raw_value: unknown,
) {
  errors.push({
    field_name,
    error_code,
    error_message,
    raw_value: raw_value == null ? null : String(raw_value),
  });
}

export function headerDiff(actualHeaders: string[]) {
  const expectedSet = new Set(EXPECTED_HEADERS);
  const actualSet = new Set(actualHeaders);
  return {
    missing: EXPECTED_HEADERS.filter((h) => !actualSet.has(h)),
    extra: actualHeaders.filter((h) => !expectedSet.has(h)),
    wrongOrder:
      actualHeaders.length === EXPECTED_HEADERS.length &&
      actualHeaders.some((h, i) => h !== EXPECTED_HEADERS[i]),
  };
}

export function headersExact(actualHeaders: string[]) {
  if (actualHeaders.length !== EXPECTED_HEADERS.length) return false;
  return actualHeaders.every((h, i) => h === EXPECTED_HEADERS[i]);
}

export function normalizeRow(rawRow: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};

  for (const field of EXPECTED_HEADERS) {
    const rawValue = rawRow[field];

    if (BIGINT_FIELDS.has(field)) {
      normalized[field] = parseBigintField(rawValue);
      continue;
    }

    if (DOUBLE_FIELDS.has(field)) {
      normalized[field] = parseDoubleField(rawValue);
      continue;
    }

    if (NUMERIC_1DP_FIELDS.has(field)) {
      normalized[field] = parseNumeric1Dp(rawValue);
      continue;
    }

    if (TIMESTAMPTZ_FIELDS.has(field)) {
      normalized[field] = parseTimestamp(rawValue);
      continue;
    }

    normalized[field] = asTrimmedString(rawValue);
  }

  return normalized;
}

export function validateNormalizedRow(
  rawRow: Record<string, unknown>,
  normalizedRow: Record<string, unknown>,
  duplicateKeysInFile: Set<string>,
  sourceType: string,
): FieldError[] {
  const errors: FieldError[] = [];

  for (const field of REQUIRED_FIELDS) {
    const rawValue = asTrimmedString(rawRow[field]);

    if (rawValue === null) {
      addError(errors, field, "REQUIRED", `${field} is required.`, rawRow[field]);
    }
  }

  for (const field of BIGINT_FIELDS) {
    if (asTrimmedString(rawRow[field]) !== null && normalizedRow[field] === null) {
      addError(errors, field, "INVALID_INTEGER", `${field} must be a valid integer.`, rawRow[field]);
    }
  }

  for (const field of DOUBLE_FIELDS) {
    if (asTrimmedString(rawRow[field]) !== null && normalizedRow[field] === null) {
      addError(errors, field, "INVALID_NUMBER", `${field} must be numeric.`, rawRow[field]);
    }
  }

  for (const field of NUMERIC_1DP_FIELDS) {
    if (asTrimmedString(rawRow[field]) !== null && normalizedRow[field] === null) {
      addError(errors, field, "INVALID_NUMBER", `${field} must be numeric.`, rawRow[field]);
    }
  }

  for (const field of TIMESTAMPTZ_FIELDS) {
    const rawValue = asTrimmedString(rawRow[field]);

    if (rawValue === null) {
      continue;
    }

    const lowered = rawValue.toLowerCase();
    if (
      lowered === "null" ||
      lowered === "none" ||
      lowered === "n/a" ||
      lowered === "nan"
    ) {
      continue;
    }

    if (normalizedRow[field] === null) {
      addError(
        errors,
        field,
        "INVALID_DATETIME",
        `${field} must be a valid datetime.`,
        rawRow[field],
      );
    }
  }

  const nonNegativeFields = [
    "miss_distance",
    "relative_speed",
    "collision_probability",
    "collision_max_probability",
    "screen_volume_radius",
    "object1_area_pc",
    "object1_area_pc_max",
    "object1_hbr",
    "object2_area_pc",
    "object2_area_pc_max",
    "object2_hbr",
  ];

  for (const field of nonNegativeFields) {
    const value = normalizedRow[field];
    if (typeof value === "number" && value < 0) {
      addError(errors, field, "NEGATIVE_NUMBER", `${field} must be greater than or equal to 0.`, rawRow[field]);
    }
  }

  const ccsds = normalizedRow["ccsds_cdm_vers"];
  if (typeof ccsds === "number" && !(ccsds >= 1.0 && ccsds < 10.0)) {
    addError(
      errors,
      "ccsds_cdm_vers",
      "OUT_OF_RANGE",
      "ccsds_cdm_vers must be >= 1.0 and < 10.0.",
      rawRow["ccsds_cdm_vers"],
    );
  }

  const cp = normalizedRow["collision_probability"];
  if (typeof cp === "number" && (cp < 0 || cp > 1)) {
    addError(
      errors,
      "collision_probability",
      "OUT_OF_RANGE",
      "collision_probability must be between 0 and 1.",
      rawRow["collision_probability"],
    );
  }

  const maxCp = normalizedRow["collision_max_probability"];
  if (typeof maxCp === "number" && (maxCp < 0 || maxCp > 1)) {
    addError(
      errors,
      "collision_max_probability",
      "OUT_OF_RANGE",
      "collision_max_probability must be between 0 and 1.",
      rawRow["collision_max_probability"],
    );
  }

  if (typeof normalizedRow["screen_volume_radius"] === "number" && normalizedRow["screen_volume_radius"] <= 0) {
    addError(
      errors,
      "screen_volume_radius",
      "NON_POSITIVE",
      "screen_volume_radius must be > 0.",
      rawRow["screen_volume_radius"],
    );
  }

  if (
    typeof normalizedRow["creation_date"] === "string" &&
    typeof normalizedRow["tca"] === "string" &&
    new Date(normalizedRow["tca"]).getTime() < new Date(normalizedRow["creation_date"]).getTime()
  ) {
    addError(
      errors,
      "tca",
      "INVALID_RANGE",
      "tca must be later than or equal to creation_date.",
      rawRow["tca"],
    );
  }

  if (
    typeof normalizedRow["start_screen_period"] === "string" &&
    typeof normalizedRow["stop_screen_period"] === "string" &&
    new Date(normalizedRow["start_screen_period"]).getTime() >
      new Date(normalizedRow["stop_screen_period"]).getTime()
  ) {
    addError(
      errors,
      "stop_screen_period",
      "INVALID_RANGE",
      "stop_screen_period must be later than or equal to start_screen_period.",
      rawRow["stop_screen_period"],
    );
  }

  if (
    typeof normalizedRow["screen_entry_time"] === "string" &&
    typeof normalizedRow["screen_exit_time"] === "string" &&
    new Date(normalizedRow["screen_entry_time"]).getTime() >
      new Date(normalizedRow["screen_exit_time"]).getTime()
  ) {
    addError(
      errors,
      "screen_exit_time",
      "INVALID_RANGE",
      "screen_exit_time must be later than or equal to screen_entry_time.",
      rawRow["screen_exit_time"],
    );
  }

  const object1CovType = normalizedRow["object1_cov_type"];
  if (object1CovType !== null && object1CovType !== "RTN") {
    addError(errors, "object1_cov_type", "INVALID_ENUM", "object1_cov_type must be RTN.", rawRow["object1_cov_type"]);
  }

  const object2CovType = normalizedRow["object2_cov_type"];
  if (object2CovType !== null && object2CovType !== "RTN") {
    addError(errors, "object2_cov_type", "INVALID_ENUM", "object2_cov_type must be RTN.", rawRow["object2_cov_type"]);
  }

  const object1RefFrame = normalizedRow["object1_ref_frame"];
  if (object1RefFrame !== null && object1RefFrame !== "TEMEOFDATE") {
    addError(errors, "object1_ref_frame", "INVALID_ENUM", "object1_ref_frame must be TEMEOFDATE.", rawRow["object1_ref_frame"]);
  }

  const object2RefFrame = normalizedRow["object2_ref_frame"];
  if (object2RefFrame !== null && object2RefFrame !== "TEMEOFDATE") {
    addError(errors, "object2_ref_frame", "INVALID_ENUM", "object2_ref_frame must be TEMEOFDATE.", rawRow["object2_ref_frame"]);
  }

  const object1OrbitCenter = normalizedRow["object1_orbit_center"];
  if (object1OrbitCenter !== null && object1OrbitCenter !== "EARTH") {
    addError(errors, "object1_orbit_center", "INVALID_ENUM", "object1_orbit_center must be EARTH.", rawRow["object1_orbit_center"]);
  }

  const object2OrbitCenter = normalizedRow["object2_orbit_center"];
  if (object2OrbitCenter !== null && object2OrbitCenter !== "EARTH") {
    addError(errors, "object2_orbit_center", "INVALID_ENUM", "object2_orbit_center must be EARTH.", rawRow["object2_orbit_center"]);
  }

  const object1Maneuverable = normalizedRow["object1_maneuverable"];
  if (object1Maneuverable !== null && !MANEUVERABLE_ALLOWED.has(String(object1Maneuverable))) {
    addError(
      errors,
      "object1_maneuverable",
      "INVALID_ENUM",
      "object1_maneuverable must be YES, NO, or UNKNOWN.",
      rawRow["object1_maneuverable"],
    );
  }

  const object2Maneuverable = normalizedRow["object2_maneuverable"];
  if (object2Maneuverable !== null && !MANEUVERABLE_ALLOWED.has(String(object2Maneuverable))) {
    addError(
      errors,
      "object2_maneuverable",
      "INVALID_ENUM",
      "object2_maneuverable must be YES, NO, or UNKNOWN.",
      rawRow["object2_maneuverable"],
    );
  }

  const object1Type = normalizedRow["object1_object_type"];
  if (object1Type !== null && !OBJECT_TYPE_ALLOWED.has(String(object1Type))) {
    addError(
      errors,
      "object1_object_type",
      "INVALID_ENUM",
      "object1_object_type must be PAYLOAD, DEBRIS, ROCKET BODY, or UNKNOWN.",
      rawRow["object1_object_type"],
    );
  }

  const object2Type = normalizedRow["object2_object_type"];
  if (object2Type !== null && !OBJECT_TYPE_ALLOWED.has(String(object2Type))) {
    addError(
      errors,
      "object2_object_type",
      "INVALID_ENUM",
      "object2_object_type must be PAYLOAD, DEBRIS, ROCKET BODY, or UNKNOWN.",
      rawRow["object2_object_type"],
    );
  }

  for (const field of COMMENT_FIELDS) {
    const value = normalizedRow[field];
    if (value !== null && value !== "COMMENT") {
      addError(errors, field, "INVALID_ENUM", `${field} must be COMMENT when present.`, rawRow[field]);
    }
  }

  const messageId = normalizedRow["message_id"];
  if (typeof messageId === "string") {
    const dupKey = `${sourceType}::${messageId}`;
    if (duplicateKeysInFile.has(dupKey)) {
      addError(
        errors,
        "message_id",
        "DUPLICATE_IN_FILE",
        "Duplicate message_id found in the same uploaded file for this source_type.",
        rawRow["message_id"],
      );
    } else {
      duplicateKeysInFile.add(dupKey);
    }
  }

  return errors;
}

export async function insertJobEvent(
  serviceClient: ReturnType<typeof createClient>,
  uploadId: string,
  eventType: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const { error } = await serviceClient.from("cdm_upload_job_events").insert({
    upload_id: uploadId,
    event_type: eventType,
    message,
    details: details ?? {},
  });

  if (error) {
    console.error("Failed to insert job event:", error.message);
  }
}

export async function updateUpload(
  serviceClient: ReturnType<typeof createClient>,
  uploadId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await serviceClient
    .from("cdm_uploads")
    .update({
      ...patch,
      last_heartbeat_at: nowIso(),
    })
    .eq("id", uploadId);

  if (error) {
    console.error("Failed to update upload row:", error.message);
  }
}

export async function flushValidationErrors(
  serviceClient: ReturnType<typeof createClient>,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return;

  const { error } = await serviceClient
    .from("cdm_validation_errors")
    .insert(rows);

  if (error) {
    throw new Error(`Failed to insert validation errors: ${error.message}`);
  }
}

export async function flushValidRecords(
  serviceClient: ReturnType<typeof createClient>,
  rows: Array<Record<string, unknown>>,
  sourceType: string,
) {
  if (rows.length === 0) return;

  const messageIds = rows
    .map((r) => r["message_id"])
    .filter((v): v is string => typeof v === "string");

  if (messageIds.length > 0) {
    const { data: existing, error: existingError } = await serviceClient
      .from("cdm_records")
      .select("message_id")
      .eq("source_type", sourceType)
      .in("message_id", messageIds);

    if (existingError) {
      throw new Error(`Failed to check existing message_ids: ${existingError.message}`);
    }

    const existingSet = new Set(
      (existing ?? [])
        .map((r) => r.message_id)
        .filter((v): v is string => typeof v === "string"),
    );

    const filtered = rows.filter((r) => !existingSet.has(String(r["message_id"])));
    if (filtered.length === 0) return;

    const { error } = await serviceClient
      .from("cdm_records")
      .insert(filtered);

    if (error) {
      throw new Error(`Failed to insert valid CDM records: ${error.message}`);
    }

    return;
  }

  const { error } = await serviceClient
    .from("cdm_records")
    .insert(rows);

  if (error) {
    throw new Error(`Failed to insert valid CDM records: ${error.message}`);
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    let uploadId: string | undefined;

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        return jsonResponse({ success: false, error: "Missing required environment variables." }, 500);
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ success: false, error: "Missing or invalid Authorization header." }, 401);
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const serviceClient = createClient(supabaseUrl, serviceRoleKey);

      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();
      if (userError || !user) {
        return jsonResponse(
          { success: false, error: "Unauthorized. Could not validate user from access token." },
          401,
        );
      }

      const body = await req.json().catch(() => null);
      uploadId = body?.uploadId as string | undefined;
      if (!uploadId) return jsonResponse({ success: false, error: "Missing uploadId." }, 400);

      await insertJobEvent(serviceClient, uploadId, "processing_init_started", "Chunk init started");

      const { data: uploadRow, error: uploadError } = await serviceClient
        .from("cdm_uploads")
        .select("id, uploaded_by, file_path, source_type, status")
        .eq("id", uploadId)
        .single();

      if (uploadError || !uploadRow) return jsonResponse({ success: false, error: "Upload record not found." }, 404);
      if (uploadRow.uploaded_by !== user.id) return jsonResponse({ success: false, error: "You do not own this upload." }, 403);

      const { data: storageFile, error: downloadError } = await serviceClient.storage
        .from(BUCKET)
        .download(uploadRow.file_path);
      if (downloadError || !storageFile) {
        throw new Error(`Failed to download uploaded file: ${downloadError?.message ?? "Unknown error"}`);
      }

      await serviceClient.from("cdm_validation_errors").delete().eq("upload_id", uploadId);
      await serviceClient.from("cdm_records").delete().eq("upload_id", uploadId);

      await updateUpload(serviceClient, uploadId, {
        status: "processing",
        started_at: nowIso(),
        finished_at: null,
        processed_rows: 0,
        valid_rows: 0,
        invalid_rows: 0,
        failed_rows: 0,
        error_summary: null,
        chunk_size: 100,
        next_row_to_process: 2,
        total_rows: 0,
        progress_percent: 0,
      });

      await insertJobEvent(serviceClient, uploadId, "processing_started", "Chunk processing initialized.", {
        chunkSize: 100,
      });

      EdgeRuntime.waitUntil(runStreamingImport(uploadId, user.id));

      return jsonResponse({
        success: true,
        uploadId,
        status: "processing",
        message: "Streaming import started in background.",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown processing init error";
      console.error("process-cdm-upload init failed:", msg);
      if (uploadId) {
        try {
          const serviceClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          await updateUpload(serviceClient, uploadId, {
            status: "failed",
            finished_at: nowIso(),
            progress_percent: 100,
            error_summary: error instanceof Error ? error.message : "Unknown processing init error",
          });
          await insertJobEvent(serviceClient, uploadId, "failed", "CDM upload init failed.", {
            error: error instanceof Error ? error.message : "Unknown processing init error",
          });
        } catch (innerError) {
          const innerMsg =
            innerError instanceof Error ? innerError.message : "Unknown error";
          console.error("Failed to update upload status after init error:", innerMsg);
        }
      }
      return jsonResponse(
        { success: false, error: error instanceof Error ? error.message : "Unknown server error" },
        500,
      );
    }
  });
}

async function runStreamingImport(uploadId: string, userId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("runStreamingImport missing env vars");
    return;
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const FLUSH_SIZE = 100;

  try {
    const { data: uploadRow, error: uploadError } = await serviceClient
      .from("cdm_uploads")
      .select("id, uploaded_by, file_path, source_type, status")
      .eq("id", uploadId)
      .single();
    if (uploadError || !uploadRow) {
      throw new Error(`Upload row missing for background import: ${uploadError?.message ?? "not found"}`);
    }
    if (uploadRow.uploaded_by !== userId) {
      throw new Error("Upload ownership mismatch in background import.");
    }

    const { data: storageFile, error: downloadError } = await serviceClient.storage
      .from(BUCKET)
      .download(uploadRow.file_path);
    if (downloadError || !storageFile) {
      throw new Error(`Failed to open stream from storage: ${downloadError?.message ?? "Unknown error"}`);
    }
    const duplicateKeysInFile = new Set<string>();
    let processedRows = 0;
    let validRows = 0;
    let invalidRows = 0;
    let totalRows = 0;
    let validBatch: Array<Record<string, unknown>> = [];
    let errorBatch: Array<Record<string, unknown>> = [];
    let bytesRead = 0;

    const parser = parse({
      columns: (headers: string[]) => {
        const trimmed = headers.map((h) => String(h).trim());
        if (!headersExact(trimmed)) {
          const err = new Error("CSV_HEADER_MISMATCH");
          (err as Error & { diff?: unknown }).diff = headerDiff(trimmed);
          throw err;
        }
        return trimmed;
      },
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_quotes: true,
    });

    const endPromise = new Promise<void>((resolve, reject) => {
      parser.once("end", () => resolve());
      parser.once("error", (e: unknown) => reject(e));
    });

    const flushProgress = async (reason: string) => {
      const progressPercent =
        storageFile.size > 0
          ? Math.min(95, Math.max(1, Math.round((bytesRead / storageFile.size) * 95)))
          : 0;
      await updateUpload(serviceClient, uploadId, {
        status: "processing",
        total_rows: totalRows,
        processed_rows: processedRows,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        failed_rows: invalidRows,
        progress_percent: progressPercent,
      });
    };

    const flushBatches = async (reason: string) => {
      if (validBatch.length > 0) {
        const rows = validBatch.splice(0, validBatch.length);
        await flushValidRecords(serviceClient, rows, uploadRow.source_type);
      }
      if (errorBatch.length > 0) {
        const rows = errorBatch.splice(0, errorBatch.length);
        await flushValidationErrors(serviceClient, rows);
      }
      await insertJobEvent(serviceClient, uploadId, "batch_imported", `Flushed up to ${FLUSH_SIZE} rows`, {
        reason,
        processedRows,
        totalRows,
        validRows,
        invalidRows,
      });
      await flushProgress(reason);
    };

    let lineNumber = 2;
    parser.on("readable", () => {
      // no-op; consumed in loop below
    });

    const decoder = new TextDecoder();
    const reader = storageFile.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytesRead += value.byteLength;
        parser.write(decoder.decode(value, { stream: true }));
      }

      for (;;) {
        const record = parser.read() as Record<string, unknown> | null;
        if (record == null) break;
        totalRows += 1;

        const normalizedRow = normalizeRow(record);
        const rowErrors = validateNormalizedRow(
          record,
          normalizedRow,
          duplicateKeysInFile,
          uploadRow.source_type,
        );
        if (rowErrors.length > 0) {
          invalidRows += 1;
          for (const err of rowErrors) {
            errorBatch.push({
              upload_id: uploadId,
              row_number: lineNumber,
              column_name: err.field_name,
              error_code: err.error_code,
              error_message: err.error_message,
              raw_row: record,
            });
          }
        } else {
          validRows += 1;
          validBatch.push({
            upload_id: uploadId,
            source_type: uploadRow.source_type,
            validation_status: "valid",
            validation_errors_count: 0,
            raw_row: record,
            ...normalizedRow,
          });
        }
        processedRows += 1;
        lineNumber += 1;

        if (validBatch.length >= FLUSH_SIZE || errorBatch.length >= FLUSH_SIZE) {
          await flushBatches("threshold");
        }
      }
    }

    parser.end(decoder.decode());
    await endPromise;

    for (;;) {
      const record = parser.read() as Record<string, unknown> | null;
      if (record == null) break;
      totalRows += 1;
      const normalizedRow = normalizeRow(record);
      const rowErrors = validateNormalizedRow(
        record,
        normalizedRow,
        duplicateKeysInFile,
        uploadRow.source_type,
      );
      if (rowErrors.length > 0) {
        invalidRows += 1;
        for (const err of rowErrors) {
          errorBatch.push({
            upload_id: uploadId,
            row_number: lineNumber,
            column_name: err.field_name,
            error_code: err.error_code,
            error_message: err.error_message,
            raw_row: record,
          });
        }
      } else {
        validRows += 1;
        validBatch.push({
          upload_id: uploadId,
          source_type: uploadRow.source_type,
          validation_status: "valid",
          validation_errors_count: 0,
          raw_row: record,
          ...normalizedRow,
        });
      }
      processedRows += 1;
      lineNumber += 1;
      if (validBatch.length >= FLUSH_SIZE || errorBatch.length >= FLUSH_SIZE) {
        await flushBatches("post-end-threshold");
      }
    }

    if (validBatch.length > 0 || errorBatch.length > 0) {
      await flushBatches("final");
    }

    let finalStatus: "completed" | "completed_with_errors" | "failed" = "completed";
    let finalMessage = "CDM upload processed successfully.";
    let errorSummary: string | null = null;
    if (validRows === 0) {
      finalStatus = "failed";
      finalMessage = "CDM upload processing failed. No valid rows were found.";
      errorSummary = "No valid rows were found in the uploaded file.";
    } else if (invalidRows > 0) {
      finalStatus = "completed_with_errors";
      finalMessage = "CDM upload processed with some validation errors.";
      errorSummary = `${invalidRows} row(s) contained validation errors.`;
    }

    await updateUpload(serviceClient, uploadId, {
      status: finalStatus,
      finished_at: nowIso(),
      progress_percent: 100,
      total_rows: totalRows,
      processed_rows: processedRows,
      valid_rows: validRows,
      invalid_rows: invalidRows,
      failed_rows: invalidRows,
      error_summary: errorSummary,
    });
    await insertJobEvent(serviceClient, uploadId, finalStatus, finalMessage, {
      totalRows,
      processedRows,
      validRows,
      invalidRows,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown streaming import error";
    console.error("runStreamingImport failed:", msg);
    try {
      await updateUpload(serviceClient, uploadId, {
        status: "failed",
        finished_at: nowIso(),
        progress_percent: 100,
        error_summary: error instanceof Error ? error.message : "Unknown streaming import error",
      });
      await insertJobEvent(serviceClient, uploadId, "failed", "CDM upload processing failed.", {
        error: error instanceof Error ? error.message : "Unknown streaming import error",
      });
    } catch (innerError) {
      const innerMsg =
        innerError instanceof Error ? innerError.message : "Unknown error";
      console.error("runStreamingImport failed to persist failure state:", innerMsg);
    }
  }
}