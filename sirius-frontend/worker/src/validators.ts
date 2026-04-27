/**
 * Row-level CDM validation (required fields + types + enums + ordering rules).
 */

export type RowValidationIssue = {
  column_name: string;
  error_code: string;
  error_message: string;
};

const OBJECT_TYPES = new Set(["PAYLOAD", "DEBRIS", "ROCKET BODY", "UNKNOWN"]);
const MANEUVERABLE = new Set(["YES", "NO", "UNKNOWN"]);

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function parseIntStrict(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function upper(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Validate one data row; returns all issues (may be empty if valid).
 */
export function validateCdmDataRow(
  row: Record<string, string>,
  rowNumber: number,
): RowValidationIssue[] {
  const issues: RowValidationIssue[] = [];

  const req = [
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
  for (const k of req) {
    if (row[k] == null || String(row[k]).trim() === "") {
      issues.push({
        column_name: k,
        error_code: "REQUIRED",
        error_message: "Required field is empty",
      });
    }
  }
  if (issues.length) return issues;

  const conjunctionId = parseIntStrict(row.conjunction_id);
  if (conjunctionId == null) {
    issues.push({
      column_name: "conjunction_id",
      error_code: "TYPE_CONJUNCTION_ID",
      error_message: "Must be an integer",
    });
  }

  const ccsds = parseNum(row.ccsds_cdm_vers);
  if (ccsds == null) {
    issues.push({
      column_name: "ccsds_cdm_vers",
      error_code: "TYPE_CCSDS",
      error_message: "Must be numeric",
    });
  }

  const creation = parseDate(row.creation_date);
  if (!creation) {
    issues.push({
      column_name: "creation_date",
      error_code: "BAD_TIMESTAMP",
      error_message: "Invalid creation_date",
    });
  }

  const eventId = parseIntStrict(row.event_id);
  if (eventId == null) {
    issues.push({
      column_name: "event_id",
      error_code: "TYPE_EVENT_ID",
      error_message: "Must be an integer",
    });
  }

  const tca = parseDate(row.tca);
  if (!tca) {
    issues.push({
      column_name: "tca",
      error_code: "BAD_TIMESTAMP",
      error_message: "Invalid tca",
    });
  }

  if (creation && tca && tca < creation) {
    issues.push({
      column_name: "tca",
      error_code: "TCA_ORDER",
      error_message: "tca must be >= creation_date",
    });
  }

  const md = parseNum(row.miss_distance);
  if (md == null || md < 0) {
    issues.push({
      column_name: "miss_distance",
      error_code: "RANGE_MISS",
      error_message: "Must be numeric and >= 0",
    });
  }

  const rs = parseNum(row.relative_speed);
  if (rs == null || rs < 0) {
    issues.push({
      column_name: "relative_speed",
      error_code: "RANGE_RS",
      error_message: "Must be numeric and >= 0",
    });
  }

  const pc = parseNum(row.collision_probability);
  if (pc == null || pc < 0 || pc > 1) {
    issues.push({
      column_name: "collision_probability",
      error_code: "RANGE_PC",
      error_message: "Must be between 0 and 1",
    });
  }

  if (row.collision_max_probability != null && row.collision_max_probability !== "") {
    const cmp = parseNum(row.collision_max_probability);
    if (cmp == null || cmp < 0 || cmp > 1) {
      issues.push({
        column_name: "collision_max_probability",
        error_code: "RANGE_CMP",
        error_message: "Must be between 0 and 1 if present",
      });
    }
  }

  if (row.screen_volume_radius != null && row.screen_volume_radius !== "") {
    const svr = parseNum(row.screen_volume_radius);
    if (svr == null || svr <= 0) {
      issues.push({
        column_name: "screen_volume_radius",
        error_code: "RANGE_SVR",
        error_message: "Must be > 0 if present",
      });
    }
  }

  const ssp = row.start_screen_period ? parseDate(row.start_screen_period) : null;
  const stp = row.stop_screen_period ? parseDate(row.stop_screen_period) : null;
  if (ssp && stp && ssp > stp) {
    issues.push({
      column_name: "start_screen_period",
      error_code: "SCREEN_PERIOD_ORDER",
      error_message: "start_screen_period must be <= stop_screen_period",
    });
  }

  const set = row.screen_entry_time ? parseDate(row.screen_entry_time) : null;
  const sxt = row.screen_exit_time ? parseDate(row.screen_exit_time) : null;
  if (set && sxt && set > sxt) {
    issues.push({
      column_name: "screen_entry_time",
      error_code: "SCREEN_TIME_ORDER",
      error_message: "screen_entry_time must be <= screen_exit_time",
    });
  }

  for (const key of ["object1_object_type", "object2_object_type"] as const) {
    if (row[key] != null && row[key] !== "") {
      const v = upper(row[key]);
      if (!OBJECT_TYPES.has(v)) {
        issues.push({
          column_name: key,
          error_code: "ENUM_OBJECT_TYPE",
          error_message: "Invalid object_type",
        });
      }
    }
  }

  for (const key of ["object1_maneuverable", "object2_maneuverable"] as const) {
    if (row[key] != null && row[key] !== "") {
      const v = upper(row[key]);
      if (!MANEUVERABLE.has(v)) {
        issues.push({
          column_name: key,
          error_code: "ENUM_MANEUVERABLE",
          error_message: "Invalid maneuverable",
        });
      }
    }
  }

  for (const key of ["object1_orbit_center", "object2_orbit_center"] as const) {
    if (row[key] != null && row[key] !== "" && upper(row[key]) !== "EARTH") {
      issues.push({
        column_name: key,
        error_code: "REF_ORBIT",
        error_message: "Must be EARTH if present",
      });
    }
  }

  for (const key of ["object1_ref_frame", "object2_ref_frame"] as const) {
    if (row[key] != null && row[key] !== "" && upper(row[key]) !== "TEMEOFDATE") {
      issues.push({
        column_name: key,
        error_code: "REF_FRAME",
        error_message: "Must be TEMEOFDATE if present",
      });
    }
  }

  for (const key of ["object1_cov_type", "object2_cov_type"] as const) {
    if (row[key] != null && row[key] !== "" && upper(row[key]) !== "RTN") {
      issues.push({
        column_name: key,
        error_code: "COV_TYPE",
        error_message: "Must be RTN if present",
      });
    }
  }

  return issues;
}
