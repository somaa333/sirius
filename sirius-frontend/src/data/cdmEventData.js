import { supabase } from "../supabaseClient";

const MAX_EVENT_FETCH = 5000;

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function toNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
 * @param {Record<string, unknown>} record
 * @returns {string | null}
 */
function getCreationDate(record) {
  return (
    toIso(record.creation_date) ??
    toIso(record.created_at) ??
    toIso(record.inserted_at)
  );
}

/**
 * @param {Record<string, unknown>} latest
 * @returns {{ label: string, value: string, key: string }[]}
 */
export function getEventDisplayFields(latest) {
  const candidates = [
    {
      key: "tca",
      label: "TCA",
      value: toIso(latest.tca),
      format: (v) => formatUtc(v),
    },
    {
      key: "miss_distance",
      label: "Miss distance",
      value: toNumber(latest.miss_distance),
      format: (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} km`,
    },
    {
      key: "collision_probability",
      label: "Collision probability",
      value: toNumber(latest.collision_probability),
      format: (v) => formatProbability(v),
    },
    {
      key: "relative_speed",
      label: "Relative speed",
      value: toNumber(latest.relative_speed),
      format: (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} km/s`,
    },
  ];

  return candidates
    .filter((item) => item.value != null)
    .slice(0, 2)
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: item.format(item.value),
    }));
}

/**
 * @param {Record<string, unknown>} record
 * @returns {'high' | 'low'}
 */
function inferRiskLevel(record) {
  const explicit = String(record.risk_level ?? "").trim().toLowerCase();
  if (explicit === "high") return "high";
  if (explicit === "low") return "low";
  const pc = toNumber(record.collision_probability);
  if (pc != null && pc >= 1e-4) return "high";
  return "low";
}

/**
 * @param {Record<string, unknown>} record
 * @returns {number}
 */
function inferConfidence(record) {
  const pc = toNumber(record.collision_probability);
  if (pc == null) return 0;
  if (pc <= 0) return 0;
  // Convert tiny probabilities into a readable confidence proxy while keeping 0..1 bounds.
  const scaled = Math.min(1, Math.max(0, Math.log10(pc + 1e-9) / -9));
  return Number((1 - scaled).toFixed(4));
}

/**
 * @param {Record<string, unknown>[]} records
 * @returns {Map<string, Record<string, unknown>[]>}
 */
export function groupCdmsByEvent(records) {
  /** @type {Map<string, Record<string, unknown>[]>} */
  const grouped = new Map();
  let skippedMissingEventId = 0;
  let validRecordsCount = 0;
  for (const record of records) {
    const rawEventId = record.event_id;
    const eventId = rawEventId == null ? "" : String(rawEventId).trim();
    if (!eventId) {
      skippedMissingEventId += 1;
      continue;
    }
    validRecordsCount += 1;
    if (!grouped.has(eventId)) grouped.set(eventId, []);
    grouped.get(eventId)?.push(record);
  }
  for (const [, list] of grouped) {
    list.sort((a, b) => {
      const da = getCreationDate(a) ?? "";
      const db = getCreationDate(b) ?? "";
      return da.localeCompare(db);
    });
  }
  return { grouped, validRecordsCount, skippedMissingEventId };
}

/**
 * @param {Map<string, Record<string, unknown>[]>} grouped
 * @returns {Array<{
 *   id: string,
 *   eventId: string,
 *   timestamp: string,
 *   firstCreationDate: string | null,
 *   latestCreationDate: string | null,
 *   cdmCount: number,
 *   avgCollisionProbability: number | null,
 *   latestCdm: Record<string, unknown>,
 *   riskLevel: 'high' | 'low',
 *   confidence: number,
 *   decision: string,
 *   status: string,
 *   sourceType: 'actual',
 *   displayFields: { key: string, label: string, value: string }[],
 * }>}
 */
export function buildEventSummaries(grouped) {
  const rows = [];
  for (const [eventId, cdms] of grouped.entries()) {
    if (!cdms.length) continue;
    const first = cdms[0];
    const latest = cdms[cdms.length - 1];
    const latestCreationDate = getCreationDate(latest);
    const collisionProbabilities = cdms
      .map((cdm) => toNumber(cdm.collision_probability))
      .filter((value) => value != null);
    const avgCollisionProbability =
      collisionProbabilities.length > 0
        ? collisionProbabilities.reduce((sum, value) => sum + value, 0) /
          collisionProbabilities.length
        : null;
    rows.push({
      id: eventId,
      eventId,
      timestamp: latestCreationDate ?? new Date(0).toISOString(),
      firstCreationDate: getCreationDate(first),
      latestCreationDate,
      cdmCount: cdms.length,
      avgCollisionProbability,
      latestCdm: latest,
      riskLevel: inferRiskLevel(latest),
      confidence: inferConfidence(latest),
      decision: inferRiskLevel(latest) === "high" ? "Maneuver" : "Monitor",
      status: String(latest.status ?? "imported"),
      sourceType: "actual",
      displayFields: getEventDisplayFields(latest),
    });
  }
  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return rows;
}

/**
 * @param {string} [userId]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchAllCdmRecords(userId) {
  const query = supabase
    .from("cdm_records")
    .select("*, upload:cdm_uploads(uploaded_by)")
    .eq("source_type", "actual")
    .order("creation_date", { ascending: false })
    .limit(MAX_EVENT_FETCH);
  const { data, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(data)
    ? /** @type {Array<Record<string, unknown>>} */ (data)
    : [];
  if (!userId) return rows;
  return rows.filter((r) => {
    const createdBy = r.created_by == null ? "" : String(r.created_by);
    const uploadedBy =
      r.upload && typeof r.upload === "object" && "uploaded_by" in r.upload
        ? String(/** @type {{ uploaded_by?: unknown }} */ (r.upload).uploaded_by ?? "")
        : "";
    return createdBy === userId || uploadedBy === userId;
  });
}

/**
 * Whether the user can see at least one `source_type: actual` CDM row
 * (same ownership rules as {@link fetchAllCdmRecords}).
 * @param {string} [userId]
 * @returns {Promise<boolean>}
 */
export async function userHasAnyVisibleCdmRecords(userId) {
  if (!userId) return false;

  const { data: ownRows, error: errOwn } = await supabase
    .from("cdm_records")
    .select("id")
    .eq("source_type", "actual")
    .eq("created_by", userId)
    .limit(1);
  if (errOwn) throw errOwn;
  if (Array.isArray(ownRows) && ownRows.length > 0) return true;

  const { data: uploads, error: errUploads } = await supabase
    .from("cdm_uploads")
    .select("id")
    .eq("uploaded_by", userId);
  if (errUploads) throw errUploads;
  const uploadIds = (uploads ?? [])
    .map((u) => /** @type {{ id?: unknown }} */ (u).id)
    .filter((id) => id != null);
  if (!uploadIds.length) return false;

  const chunkSize = 500;
  for (let i = 0; i < uploadIds.length; i += chunkSize) {
    const chunk = uploadIds.slice(i, i + chunkSize);
    const { data: linked, error: errLinked } = await supabase
      .from("cdm_records")
      .select("id")
      .eq("source_type", "actual")
      .in("upload_id", chunk)
      .limit(1);
    if (errLinked) throw errLinked;
    if (Array.isArray(linked) && linked.length > 0) return true;
  }
  return false;
}

/**
 * @param {string} [userId]
 * @returns {Promise<ReturnType<typeof buildEventSummaries>>}
 */
export async function fetchEventSummariesFromCdmRecords(userId) {
  const records = await fetchAllCdmRecords(userId);
  const { grouped, validRecordsCount, skippedMissingEventId } =
    groupCdmsByEvent(records);
  const summaries = buildEventSummaries(grouped);
  const diagnostics = {
    rawFetchedCount: records.length,
    validRecordsCount,
    skippedMissingEventId,
    groupedEventCount: grouped.size,
    eventSummariesCount: summaries.length,
  };
  return { summaries, diagnostics };
}

/**
 * @param {string} eventId
 * @param {string} [userId]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function fetchCdmsForEvent(eventId, userId) {
  const query = supabase
    .from("cdm_records")
    .select("*, upload:cdm_uploads(uploaded_by)")
    .eq("event_id", eventId)
    .eq("source_type", "actual")
    .order("creation_date", { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(data)
    ? /** @type {Array<Record<string, unknown>>} */ (data)
    : [];
  if (!userId) return rows;
  return rows.filter((r) => {
    const createdBy = r.created_by == null ? "" : String(r.created_by);
    const uploadedBy =
      r.upload && typeof r.upload === "object" && "uploaded_by" in r.upload
        ? String(/** @type {{ uploaded_by?: unknown }} */ (r.upload).uploaded_by ?? "")
        : "";
    return createdBy === userId || uploadedBy === userId;
  });
}

/**
 * Coerce `event_id` for Postgres `bigint` RPC parameters.
 * Uses number when safe; otherwise string (PostgREST accepts both for bigint).
 * @param {string | number} eventId
 * @returns {number | string}
 */
export function coerceEventIdForRpc(eventId) {
  const s = String(eventId).trim();
  if (!/^-?\d+$/.test(s)) {
    throw new Error("Invalid event ID.");
  }
  const n = Number(s);
  if (Number.isSafeInteger(n)) return n;
  return s;
}

/**
 * Hard-delete all CDM rows for one event (owner enforced in DB).
 * @param {string | number} eventId
 * @returns {Promise<unknown>}
 */
export async function deleteCdmEvent(eventId) {
  const p_event_id = coerceEventIdForRpc(eventId);
  const { data, error } = await supabase.rpc("delete_cdm_event", {
    p_event_id,
  });
  if (error) throw error;
  return data;
}

/**
 * Hard-delete all CDM rows for multiple events (owner enforced in DB).
 * @param {(string | number)[]} eventIds
 * @returns {Promise<unknown>}
 */
export async function deleteCdmEvents(eventIds) {
  if (!eventIds.length) return null;
  const p_event_ids = eventIds.map(coerceEventIdForRpc);
  const { data, error } = await supabase.rpc("delete_cdm_events", {
    p_event_ids,
  });
  if (error) throw error;
  return data;
}

/**
 * Formats an ISO / parseable instant for display in the **user's local timezone**
 * (browser locale calendar and offset). Stored values remain UTC in the API/DB.
 *
 * @param {string | null | undefined} iso
 */
export function formatUtc(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * @param {number | null} pc
 */
export function formatProbability(pc) {
  if (pc == null || Number.isNaN(pc)) return "—";
  if (pc < 0.001) return pc.toExponential(2);
  return pc.toFixed(6);
}

/**
 * Download event summary rows as CSV (same columns as the dashboard event export).
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} [downloadFilename] e.g. `selected-cdm-events.csv`
 */
/** Prefer these columns first in CDM row exports (remaining keys are sorted A–Z). */
const CDM_CSV_COLUMN_PRIORITY = [
  "event_id",
  "cdm_code",
  "creation_date",
  "tca",
  "collision_probability",
  "miss_distance",
  "relative_speed",
];

/** Omitted from dashboard CDM exports (noise / internal identifiers). */
const CDM_CSV_EXCLUDED_KEYS = new Set([
  "id",
  "upload_id",
  "uploaded_by",
  "validation_errors_count",
  "validation_status",
]);

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function flattenCdmRecordForCsv(row) {
  if (!row || typeof row !== "object") return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "upload") continue;
    if (CDM_CSV_EXCLUDED_KEYS.has(k)) continue;
    out[k] = v;
  }
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (v != null && typeof v === "object") {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

/**
 * @param {string[]} keys
 */
function sortCdmCsvHeaders(keys) {
  const set = new Set(keys);
  const ordered = [];
  for (const p of CDM_CSV_COLUMN_PRIORITY) {
    if (set.has(p)) ordered.push(p);
  }
  const rest = [...set].filter((k) => !ordered.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
}

/**
 * Fetch all CDM rows for the given events (same visibility rules as the dashboard) and download CSV.
 * @param {string[]} eventIds
 * @param {string} userId
 * @param {string} [downloadFilename]
 * @returns {Promise<{ rowCount: number, eventCount: number }>}
 */
export async function exportSelectedEventsCdmsToCsv(eventIds, userId, downloadFilename) {
  const ids = [...new Set(eventIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return { rowCount: 0, eventCount: 0 };

  const batches = await Promise.all(ids.map((id) => fetchCdmsForEvent(id, userId)));
  /** @type {Record<string, unknown>[]} */
  const flatRows = [];
  for (const batch of batches) {
    for (const row of batch) {
      flatRows.push(flattenCdmRecordForCsv(row));
    }
  }

  if (!flatRows.length) {
    throw new Error("No CDM rows found for the selected events.");
  }

  /** @type {Set<string>} */
  const keySet = new Set();
  for (const r of flatRows) {
    Object.keys(r).forEach((k) => keySet.add(k));
  }
  const header = sortCdmCsvHeaders([...keySet]);

  const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map((h) => escapeCell(h)).join(",")];
  for (const r of flatRows) {
    lines.push(header.map((h) => escapeCell(r[h])).join(","));
  }

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const defaultName = `sirius-cdm-rows-${new Date().toISOString().slice(0, 10)}.csv`;
  a.download = downloadFilename?.trim() || defaultName;
  a.click();
  URL.revokeObjectURL(url);

  return { rowCount: flatRows.length, eventCount: ids.length };
}

export function exportEventSummariesToCsv(rows, downloadFilename) {
  const header = [
    "event_id",
    "latest_creation_date_utc",
    "cdm_count",
    "latest_tca_utc",
    "latest_miss_distance",
    "latest_collision_probability",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const displayFields = Array.isArray(r.displayFields) ? r.displayFields : [];
    const tca = displayFields.find((f) => f.key === "tca")?.value ?? "";
    const missDistance =
      displayFields.find((f) => f.key === "miss_distance")?.value ?? "";
    const pcRaw =
      r.latestCdm && typeof r.latestCdm === "object"
        ? Number(
            /** @type {{ collision_probability?: unknown }} */ (r.latestCdm)
              .collision_probability,
          )
        : NaN;
    lines.push(
      [
        r.id,
        r.timestamp,
        r.cdmCount ?? "",
        tca,
        missDistance,
        Number.isFinite(pcRaw) ? formatProbability(pcRaw) : "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const defaultName = `sirius-cdm-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.download = downloadFilename?.trim() || defaultName;
  a.click();
  URL.revokeObjectURL(url);
}
