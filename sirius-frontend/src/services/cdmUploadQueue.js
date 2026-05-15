/**
 * CDM upload / queue flow — uses only the app singleton Supabase client from
 * `../supabaseClient` (no secondary `createClient` here).
 */
import { supabase } from "../supabaseClient";
import {
  MAX_CDM_FILE_SIZE_BYTES,
  MAX_CDM_FILE_SIZE_LABEL,
} from "../constants/cdmUploadLimits.js";
import {
  ensureSessionForEdgeFunctionInvoke,
  SESSION_INVALID_MSG,
} from "./supabaseEdgeSession.js";

const BUCKET = "cdm-uploads";
/** Queue / register upload (storage + metadata). */
const EDGE_FN = "validate-and-import-cdm";
/** Triggers processing after queue success. */
const PROCESS_EDGE_FN = "process-cdm-upload";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Client-side checks before any upload or processing starts.
 * @param {File | null | undefined} file
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function validateCsvFile(file) {
  if (!file) {
    return { ok: false, error: "No file selected." };
  }

  if (file.size === 0) {
    return { ok: false, error: "The file is empty. Choose a CSV with data." };
  }

  if (file.size > MAX_CDM_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `File is too large. Maximum allowed size is ${MAX_CDM_FILE_SIZE_LABEL}.`,
    };
  }

  const lower = file.name.toLowerCase();
  const looksCsv =
    lower.endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/csv" ||
    file.type === "application/vnd.ms-excel";

  if (!looksCsv) {
    return { ok: false, error: "Please upload a CSV file (.csv)." };
  }

  // Catch whitespace-only files (e.g. blank lines) before upload.
  if (file.size <= 1024 * 1024) {
    try {
      const text = await file.text();
      if (!text.trim()) {
        return { ok: false, error: "The file is empty. Choose a CSV with data." };
      }
    } catch {
      return { ok: false, error: "Could not read the file. Try again." };
    }
  }

  return { ok: true };
}

/**
 * POST /storage/v1/object/{bucket}/{path} — same contract as supabase-js Storage,
 * with XMLHttpRequest so we get upload progress (not available on the default client upload).
 *
 * @param {object} p
 * @param {string} p.bucket
 * @param {string} p.pathInBucket path inside bucket, e.g. userId/uploadId/name.csv
 * @param {File} p.file
 * @param {string} p.accessToken
 * @param {(loaded: number, total: number) => void} [p.onUploadProgress]
 */
function uploadObjectWithProgress({
  bucket,
  pathInBucket,
  file,
  accessToken,
  onUploadProgress,
}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(
      new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY."),
    );
  }

  const base = String(SUPABASE_URL).replace(/\/$/, "");
  const segments = [bucket, ...pathInBucket.split("/").filter(Boolean)];
  const url = `${base}/storage/v1/object/${segments.map(encodeURIComponent).join("/")}`;

  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onUploadProgress) {
        onUploadProgress(ev.loaded, ev.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch {
          resolve({});
        }
        return;
      }
      let msg = `Storage upload failed (${xhr.status}).`;
      try {
        const err = JSON.parse(xhr.responseText || "{}");
        msg =
          err.message ||
          err.error ||
          err.msg ||
          (typeof err === "string" ? err : msg);
      } catch {
        // keep default
      }
      reject(new Error(msg));
    };

    xhr.onerror = () =>
      reject(new Error("Network error while uploading to storage."));
    xhr.send(body);
  });
}

async function markUploadRowFailed(uploadId, errorSummary) {
  const { error } = await supabase
    .from("cdm_uploads")
    .update({
      status: "failed",
      error_summary: errorSummary,
    })
    .eq("id", uploadId);
  if (error) {
    console.warn("[cdmUpload] could not mark upload failed:", error.message);
  }
}

/** User-facing copy when the Edge Function HTTP gateway returns 401 (not necessarily a logged-out browser). */
const EDGE_FN_HTTP_401_MSG =
  "The server rejected the background import request (HTTP 401). Your browser session may still be valid—the Edge Function gateway or function auth settings may need adjustment (e.g. JWT verification / verify_jwt in Supabase config). Ask an administrator to review validate-and-import-cdm auth and deployment.";

/**
 * User-facing message for supabase.functions.invoke failures.
 * @param {unknown} fnError
 */
/**
 * @param {unknown} fnError
 * @param {string} [fallbackMessage]
 */
function edgeInvokeErrorMessage(
  fnError,
  fallbackMessage = "Could not complete the Edge Function request.",
) {
  if (fnError == null) {
    return fallbackMessage;
  }
  const err = /** @type {{ message?: string; context?: { status?: number } }} */ (
    fnError
  );
  const status =
    typeof err.context?.status === "number" ? err.context.status : undefined;
  if (status === 401) {
    return EDGE_FN_HTTP_401_MSG;
  }
  if (typeof err.message === "string" && err.message.trim().length > 0) {
    return err.message;
  }
  return fallbackMessage;
}

/**
 * Parse Edge Function response for queue-only contract (no final import totals).
 * @param {unknown} data
 * @returns {{
 *   success: boolean,
 *   message?: string,
 *   uploadId?: string,
 *   filePath?: string,
 *   sourceType?: string,
 *   status?: string,
 * }}
 */
export function parseQueueResponse(data) {
  if (data == null || typeof data !== "object") {
    return { success: false };
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const inner =
    raw.data != null && typeof raw.data === "object"
      ? /** @type {Record<string, unknown>} */ (raw.data)
      : raw;

  const str = (a, b) =>
    (typeof inner[a] === "string" ? inner[a] : null) ??
    (typeof inner[b] === "string" ? inner[b] : undefined);

  const success =
    inner.success !== false && inner.error == null && raw.error == null;

  return {
    success,
    message:
      typeof inner.message === "string"
        ? inner.message
        : typeof raw.message === "string"
          ? raw.message
          : undefined,
    uploadId: str("uploadId", "upload_id"),
    filePath: str("filePath", "file_path"),
    sourceType: str("sourceType", "source_type"),
    status: str("status", "status") ?? "queued",
  };
}

/**
 * 1) Insert `cdm_uploads` as `pending` before any storage upload.
 * 2) Stream-equivalent: XHR upload with progress (no full-file extra buffering).
 * 3) Set `uploaded` + `upload_completed_at`.
 * 4) Invoke queue Edge Function `validate-and-import-cdm`.
 * 5) Invoke `process-cdm-upload` with `{ uploadId }`.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {(phase: 'creating_record' | 'uploading' | 'queueing' | 'starting_process') => void} [options.onPhase]
 * @param {(percent0to100: number) => void} [options.onUploadProgress]
 * @returns {Promise<{ uploadId: string, filePath: string, queue: ReturnType<typeof parseQueueResponse>, process: ReturnType<typeof parseQueueResponse> }>}
 */
export async function uploadAndQueueCdm(file, options = {}) {
  const { onPhase, onUploadProgress } = options;

  const v = await validateCsvFile(file);
  if (!v.ok) {
    throw new Error(v.error);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be signed in to upload.");
  }

  const uploadId = crypto.randomUUID();
  const storagePath = `${user.id}/${uploadId}/${file.name}`;

  onPhase?.("creating_record");
  const { error: insertError } = await supabase.from("cdm_uploads").insert({
    id: uploadId,
    uploaded_by: user.id,
    file_name: file.name,
    file_path: storagePath,
    file_size_bytes: file.size,
    source_type: "actual",
    file_format: "csv",
    status: "pending",
  });

  if (insertError) {
    console.error("[cdmUpload] insert failed:", insertError.message);
    throw new Error(
      insertError.message || "Failed to create upload record.",
    );
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      await markUploadRowFailed(uploadId, "Session expired before upload.");
      throw new Error("Session expired. Sign in again.");
    }

    onPhase?.("uploading");
    onUploadProgress?.(0);

    await uploadObjectWithProgress({
      bucket: BUCKET,
      pathInBucket: storagePath,
      file,
      accessToken: session.access_token,
      onUploadProgress: (loaded, total) => {
        if (total > 0) {
          const pct = Math.min(100, Math.round((loaded / total) * 100));
          onUploadProgress?.(pct);
        }
      },
    });
    onUploadProgress?.(100);
  } catch (uploadErr) {
    const msg =
      uploadErr instanceof Error
        ? uploadErr.message
        : "Could not upload file to storage.";
    console.error("[cdmUpload] storage upload failed:", msg);
    await markUploadRowFailed(uploadId, msg);
    throw new Error(msg);
  }

  const { error: updateError } = await supabase
    .from("cdm_uploads")
    .update({
      status: "uploaded",
      upload_completed_at: new Date().toISOString(),
    })
    .eq("id", uploadId);

  if (updateError) {
    console.error("[cdmUpload] post-upload DB update failed:", updateError.message);
    await markUploadRowFailed(
      uploadId,
      updateError.message || "Failed to mark upload complete.",
    );
    throw new Error(
      updateError.message || "Failed to update upload after storage.",
    );
  }
  onPhase?.("queueing");

  let sessionForEdge;
  try {
    sessionForEdge = await ensureSessionForEdgeFunctionInvoke();
  } catch (e) {
    const msg = e instanceof Error ? e.message : SESSION_INVALID_MSG;
    await markUploadRowFailed(uploadId, msg);
    throw new Error(msg);
  }

  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    EDGE_FN,
    {
      body: {
        uploadId,
        filePath: storagePath,
        sourceType: "actual",
      },
      headers: {
        Authorization: `Bearer ${sessionForEdge.access_token}`,
      },
    },
  );

  if (fnError) {
    console.error(
      "[cdmUpload] edge function failed:",
      edgeInvokeErrorMessage(fnError, "Could not queue background processing."),
    );
    const userMessage = edgeInvokeErrorMessage(
      fnError,
      "Could not queue background processing.",
    );
    await markUploadRowFailed(uploadId, userMessage);
    throw new Error(userMessage);
  }

  const queue = parseQueueResponse(fnData);

  if (!queue.success) {
    const msg =
      queue.message ||
      (fnData != null &&
      typeof fnData === "object" &&
      "error" in fnData &&
      typeof /** @type {{ error?: unknown }} */ (fnData).error === "string"
        ? /** @type {{ error: string }} */ (fnData).error
        : "Queue request was rejected.");
    console.error("[cdmUpload] queue rejected:", msg);
    await markUploadRowFailed(uploadId, msg);
    throw new Error(msg);
  }

  if (queue.uploadId && queue.uploadId !== uploadId) {
    // tolerate server echoing id
  }

  onPhase?.("starting_process");

  let sessionForProcess;
  try {
    sessionForProcess = await ensureSessionForEdgeFunctionInvoke();
  } catch (e) {
    const msg = e instanceof Error ? e.message : SESSION_INVALID_MSG;
    await markUploadRowFailed(uploadId, msg);
    throw new Error(msg);
  }

  const { data: processData, error: processError } =
    await supabase.functions.invoke(PROCESS_EDGE_FN, {
      body: { uploadId },
      headers: {
        Authorization: `Bearer ${sessionForProcess.access_token}`,
      },
    });

  if (processError) {
    console.error(
      "[cdmUpload] process edge function failed:",
      edgeInvokeErrorMessage(
        processError,
        "Could not start CDM import processing.",
      ),
    );
    const userMessage = edgeInvokeErrorMessage(
      processError,
      "Could not start CDM import processing.",
    );
    await markUploadRowFailed(uploadId, userMessage);
    throw new Error(userMessage);
  }

  const processResult = parseQueueResponse(processData);
  if (!processResult.success) {
    const msg =
      processResult.message ||
      (processData != null &&
      typeof processData === "object" &&
      "error" in processData &&
      typeof /** @type {{ error?: unknown }} */ (processData).error === "string"
        ? /** @type {{ error: string }} */ (processData).error
        : "Processing request was rejected.");
    console.error("[cdmUpload] process Edge Function rejected:", msg);
    await markUploadRowFailed(uploadId, msg);
    throw new Error(msg);
  }

  return {
    uploadId,
    filePath: storagePath,
    queue,
    process: processResult,
  };
}
