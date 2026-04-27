/**
 * FastAPI analysis service. Base URL from Vite env — never hardcode.
 * @see import.meta.env.VITE_AI_API_BASE_URL
 */

/**
 * @returns {string}
 */
function getAiApiBaseUrl() {
  const raw = import.meta.env.VITE_AI_API_BASE_URL;
  if (raw == null || String(raw).trim() === "") {
    throw new Error(
      "VITE_AI_API_BASE_URL is not set. Add it to your .env (e.g. VITE_AI_API_BASE_URL=http://127.0.0.1:8000).",
    );
  }
  return String(raw).replace(/\/$/, "");
}

/**
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<unknown>}
 */
export async function runActualAnalysis(eventId, userId) {
  if (!userId) {
    throw new Error("Missing user id for analysis request.");
  }
  const base = getAiApiBaseUrl();
  const url = `${base}/analyze/actual/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "x-user-id": userId,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.trim()
        ? `Actual analysis failed (${res.status}): ${text}`
        : `Actual analysis failed (${res.status} ${res.statusText})`,
    );
  }
  return res.json();
}

/**
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<unknown>}
 */
export async function runPredictedAnalysis(eventId, userId) {
  if (!userId) {
    throw new Error("Missing user id for analysis request.");
  }
  const base = getAiApiBaseUrl();
  const url = `${base}/analyze/predicted/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "x-user-id": userId,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.trim()
        ? `Predicted analysis failed (${res.status}): ${text}`
        : `Predicted analysis failed (${res.status} ${res.statusText})`,
    );
  }
  return res.json();
}
