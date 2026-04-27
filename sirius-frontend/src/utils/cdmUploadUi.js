/**
 * Compact operator-facing line for the CDM upload status banner.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string}
 */
export function formatCdmUploadStatusDetails(row) {
  if (!row) return "";
  const st = String(row.status ?? "—");
  const pct =
    row.progress_percent != null
      ? `${Number(row.progress_percent).toFixed(0)}%`
      : "—";
  const tr = row.total_rows ?? "—";
  const pr = row.processed_rows ?? "—";
  const v = row.valid_rows ?? "—";
  const inv = row.invalid_rows ?? "—";
  const summ = row.error_summary ? String(row.error_summary) : null;
  const parts = [
    `Status: ${st}`,
    `Progress: ${pct}`,
    `Total rows: ${tr}`,
    `Processed: ${pr}`,
    `Valid: ${v}`,
    `Invalid: ${inv}`,
  ];
  if (summ) {
    parts.push(`Summary: ${summ}`);
  }
  return parts.join(" · ");
}

/**
 * @param {boolean} busy
 * @param {string} phase
 * @param {Record<string, unknown> | null} pollRow
 * @param {number | null} [uploadFilePercent] 0–100 while uploading to storage
 */
export function getUploadButtonLabel(busy, phase, pollRow, uploadFilePercent = null) {
  if (!busy) return "Upload CDM";
  if (phase === "creating_record") return "Creating record…";
  if (phase === "uploading") {
    if (uploadFilePercent != null && uploadFilePercent >= 0) {
      return `Uploading ${uploadFilePercent}%…`;
    }
    return "Uploading file…";
  }
  if (phase === "queueing") return "Queueing background processing…";
  if (phase === "starting_process") return "Starting import…";
  if (phase === "polling") {
    const st = String(pollRow?.status ?? "").toLowerCase();
    if (st === "processing") return "Processing…";
    if (st === "queued" || st === "pending" || st === "uploaded") {
      return "Waiting…";
    }
    if (
      st === "completed" ||
      st === "completed_with_errors" ||
      st === "validated" ||
      st === "failed"
    ) {
      return "Working…";
    }
    return "Working…";
  }
  return "Working…";
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {{ type: 'ok' | 'warning' | 'error', text: string } | null}
 */
export function bannerFromUploadRow(row) {
  if (!row) return null;
  const s = String(row.status ?? "").toLowerCase();
  const pct =
    row.progress_percent != null
      ? ` ${Number(row.progress_percent).toFixed(0)}%`
      : "";
  const detailLine = formatCdmUploadStatusDetails(row);

  switch (s) {
    case "uploaded":
      return {
        type: "ok",
        text: "File in storage. Queueing background processing…",
      };
    case "pending":
      return {
        type: "ok",
        text: "Upload record created. Waiting for file transfer or worker…",
      };
    case "queued":
      return {
        type: "ok",
        text: "Upload queued successfully. Background processing will start shortly.",
      };
    case "processing":
      return {
        type: "ok",
        text: `Processing CDM data…${pct}. ${detailLine}`.trim(),
      };
    case "completed": {
      return {
        type: "ok",
        text: `Import completed. ${detailLine}`,
      };
    }
    case "completed_with_errors": {
      return {
        type: "warning",
        text: `Import finished with row-level issues. ${detailLine}`,
      };
    }
    case "failed":
      return {
        type: "error",
        text: `Import failed. ${row.error_summary ? String(row.error_summary) : detailLine || "Review validation errors for details."}`,
      };
    case "validated":
      return {
        type: "ok",
        text: `Status: validated. Waiting for final completion status update. ${detailLine}`,
      };
    default:
      return {
        type: "ok",
        text: detailLine || `Status: ${String(row.status ?? "unknown")}`,
      };
  }
}
