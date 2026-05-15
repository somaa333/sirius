/**
 * User-facing messages for Analysis / FastAPI failures.
 */

/**
 * @returns {string}
 */
export function getAnalysisServiceUrl() {
  const raw = import.meta.env.VITE_AI_API_BASE_URL;
  if (raw == null || String(raw).trim() === "") {
    throw new Error(
      "Analysis service is not configured. Add VITE_AI_API_BASE_URL to sirius-frontend/.env (e.g. http://127.0.0.1:8000).",
    );
  }
  return String(raw).replace(/\/$/, "");
}

/**
 * @param {string} body
 * @returns {string}
 */
function extractFastApiDetail(body) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String(/** @type {{ msg?: unknown }} */ (item).msg ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
    }
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    /* use raw text */
  }
  return trimmed;
}

/**
 * @param {string} detail
 * @param {number} status
 * @param {'actual' | 'predicted'} [variant]
 */
function friendlyAnalysisDetail(detail, status, variant) {
  const lower = detail.toLowerCase();

  if (status === 404 && lower.includes("no actual cdms")) {
    return "No CDM records were found for this event. Upload CDM data for the event first.";
  }
  if (status === 400 && lower.includes("not enough cdms for predicted")) {
    return "Predicted analysis needs at least 3 CDMs in the event.";
  }
  if (status === 400 && lower.includes("not enough cdms for actual")) {
    return "Actual analysis needs at least 1 CDM in the event.";
  }
  if (lower.includes("classification failed")) {
    return "Risk classification failed. Check that the analysis service has its model files installed.";
  }
  if (lower.includes("prediction model failed") || lower.includes("prediction")) {
    return "CDM prediction failed. Check that the analysis service has its forecasting model files installed.";
  }
  if (status === 400 && lower.includes("missing x-user-id")) {
    return "Your session could not be verified for analysis. Sign in again and retry.";
  }

  if (detail) return detail;

  if (status === 404) return "The analysis service could not find data for this request.";
  if (status >= 500) {
    return variant === "predicted"
      ? "Predicted analysis failed on the server. Try again or contact support."
      : "Actual analysis failed on the server. Try again or contact support.";
  }
  return variant === "predicted"
    ? "Predicted analysis could not be completed."
    : "Actual analysis could not be completed.";
}

/**
 * @param {Response} res
 * @param {'actual' | 'predicted'} [variant]
 * @returns {Promise<string>}
 */
export async function analysisHttpErrorMessage(res, variant) {
  const text = await res.text();
  const detail = extractFastApiDetail(text);
  return friendlyAnalysisDetail(detail, res.status, variant);
}

/**
 * @param {unknown} err
 * @param {'actual' | 'predicted'} [variant]
 * @returns {string}
 */
export function analysisNetworkErrorMessage(err, variant) {
  if (err instanceof Error) {
    if (err.message.includes("VITE_AI_API_BASE_URL")) return err.message;
    if (
      err.name === "TypeError" &&
      /failed to fetch|networkerror|load failed/i.test(err.message)
    ) {
      let base = "the analysis service";
      try {
        base = getAnalysisServiceUrl();
      } catch {
        /* keep generic */
      }
      return `Cannot reach the analysis service at ${base}. Start the FastAPI server (ai-service) and confirm VITE_AI_API_BASE_URL in .env.`;
    }
  }
  return variant === "predicted"
    ? "Predicted analysis failed unexpectedly."
    : "Actual analysis failed unexpectedly.";
}

/**
 * Quick check before starting a long-running analysis.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function checkAnalysisServiceReachable() {
  let base;
  try {
    base = getAnalysisServiceUrl();
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Analysis service is not configured.",
    };
  }

  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `Analysis service returned HTTP ${res.status}. Is it running at ${base}?`,
      };
    }
    const data = await res.json().catch(() => ({}));
    if (data?.classification_ready === false) {
      return {
        ok: false,
        message:
          "Analysis service is running but classification model files are missing in ai-service/classification_artifacts.",
      };
    }
    if (data?.prediction_ready === false) {
      return {
        ok: false,
        message:
          "Analysis service is running but prediction model files are missing in ai-service/forecasting_artifacts.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: `Cannot reach the analysis service at ${base}. Start it with: cd ai-service && pip install -r requirements.txt && python -m uvicorn main:app --reload --port 8000`,
    };
  }
}
