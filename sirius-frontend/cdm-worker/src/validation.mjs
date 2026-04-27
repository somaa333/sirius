/**
 * CDM CSV validation (aligned with SIRIUS rules).
 * Keep in sync with DB constraints and uniqueness on (source_type, message_id).
 */

export const REQUIRED_HEADERS = [
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
];

const OBJECT_TYPES = new Set(["PAYLOAD", "DEBRIS", "ROCKET BODY", "UNKNOWN"]);
const MANEUVERABLE = new Set(["YES", "NO", "UNKNOWN"]);

function parseNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function parseIntStrict(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v) {
  if (v == null || v === "") return null;
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateHeaders(columns) {
  const set = new Set((columns ?? []).map((c) => String(c).trim()));
  const missing = REQUIRED_HEADERS.filter((h) => !set.has(h));
  if (missing.length) {
    return {
      ok: false,
      code: "MISSING_HEADERS",
      message: `Missing required columns: ${missing.join(", ")}`,
    };
  }
  return { ok: true };
}

/**
 * @param {Record<string, string>} row
 * @param {number} rowNumber 1-based data row index (excluding header)
 */
export function validateDataRow(row, rowNumber) {
  const conjunctionId = parseIntStrict(row.conjunction_id);
  if (conjunctionId == null) {
    return {
      ok: false,
      rowNumber,
      columnName: "conjunction_id",
      errorCode: "TYPE_CONJUNCTION_ID",
      errorMessage: "conjunction_id must be an integer.",
    };
  }

  const eventId = parseIntStrict(row.event_id);
  if (eventId == null) {
    return {
      ok: false,
      rowNumber,
      columnName: "event_id",
      errorCode: "TYPE_EVENT_ID",
      errorMessage: "event_id must be an integer.",
    };
  }

  const ccsds = parseNum(row.ccsds_cdm_vers);
  if (ccsds == null) {
    return {
      ok: false,
      rowNumber,
      columnName: "ccsds_cdm_vers",
      errorCode: "TYPE_CCSDS",
      errorMessage: "ccsds_cdm_vers must be numeric.",
    };
  }

  const creation = parseDate(row.creation_date);
  const tca = parseDate(row.tca);
  if (!creation || !tca) {
    return {
      ok: false,
      rowNumber,
      columnName: "tca",
      errorCode: "BAD_TIMESTAMP",
      errorMessage: "creation_date and tca must be valid timestamps.",
    };
  }
  if (tca < creation) {
    return {
      ok: false,
      rowNumber,
      columnName: "tca",
      errorCode: "TCA_ORDER",
      errorMessage: "tca must be >= creation_date.",
    };
  }

  const md = parseNum(row.miss_distance);
  if (md == null || md < 0) {
    return {
      ok: false,
      rowNumber,
      columnName: "miss_distance",
      errorCode: "RANGE_MISS_DISTANCE",
      errorMessage: "miss_distance must be >= 0.",
    };
  }

  const rs = parseNum(row.relative_speed);
  if (rs == null || rs < 0) {
    return {
      ok: false,
      rowNumber,
      columnName: "relative_speed",
      errorCode: "RANGE_REL_SPEED",
      errorMessage: "relative_speed must be >= 0.",
    };
  }

  const pc = parseNum(row.collision_probability);
  if (pc == null || pc < 0 || pc > 1) {
    return {
      ok: false,
      rowNumber,
      columnName: "collision_probability",
      errorCode: "RANGE_PC",
      errorMessage: "collision_probability must be between 0 and 1.",
    };
  }

  if (row.collision_max_probability != null && row.collision_max_probability !== "") {
    const cmp = parseNum(row.collision_max_probability);
    if (cmp == null || cmp < 0 || cmp > 1) {
      return {
        ok: false,
        rowNumber,
        columnName: "collision_max_probability",
        errorCode: "RANGE_CMP",
        errorMessage: "collision_max_probability must be between 0 and 1 if present.",
      };
    }
  }

  if (row.screen_volume_radius != null && row.screen_volume_radius !== "") {
    const svr = parseNum(row.screen_volume_radius);
    if (svr == null || svr <= 0) {
      return {
        ok: false,
        rowNumber,
        columnName: "screen_volume_radius",
        errorCode: "RANGE_SVR",
        errorMessage: "screen_volume_radius must be > 0 if present.",
      };
    }
  }

  for (const key of ["object1_object_type", "object2_object_type"]) {
    if (row[key] != null && row[key] !== "") {
      const v = String(row[key]).trim().toUpperCase();
      if (!OBJECT_TYPES.has(v)) {
        return {
          ok: false,
          rowNumber,
          columnName: key,
          errorCode: "ENUM_OBJECT_TYPE",
          errorMessage: `Invalid ${key}.`,
        };
      }
    }
  }

  for (const key of ["object1_maneuverable", "object2_maneuverable"]) {
    if (row[key] != null && row[key] !== "") {
      const v = String(row[key]).trim().toUpperCase();
      if (!MANEUVERABLE.has(v)) {
        return {
          ok: false,
          rowNumber,
          columnName: key,
          errorCode: "ENUM_MANEUVERABLE",
          errorMessage: `Invalid ${key}.`,
        };
      }
    }
  }

  for (const key of ["object1_orbit_center", "object2_orbit_center"]) {
    if (row[key] != null && row[key] !== "") {
      if (String(row[key]).trim().toUpperCase() !== "EARTH") {
        return {
          ok: false,
          rowNumber,
          columnName: key,
          errorCode: "REF_ORBIT_CENTER",
          errorMessage: `${key} should be EARTH if present.`,
        };
      }
    }
  }

  for (const key of ["object1_ref_frame", "object2_ref_frame"]) {
    if (row[key] != null && row[key] !== "") {
      if (String(row[key]).trim().toUpperCase() !== "TEMEOFDATE") {
        return {
          ok: false,
          rowNumber,
          columnName: key,
          errorCode: "REF_FRAME",
          errorMessage: `${key} should be TEMEOFDATE if present.`,
        };
      }
    }
  }

  for (const key of ["object1_cov_type", "object2_cov_type"]) {
    if (row[key] != null && row[key] !== "") {
      if (String(row[key]).trim().toUpperCase() !== "RTN") {
        return {
          ok: false,
          rowNumber,
          columnName: key,
          errorCode: "COV_TYPE",
          errorMessage: `${key} should be RTN if present.`,
        };
      }
    }
  }

  return { ok: true };
}
