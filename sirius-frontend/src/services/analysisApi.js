/**
 * FastAPI analysis service. Base URL from Vite env — never hardcode.
 * @see import.meta.env.VITE_AI_API_BASE_URL
 */
import {
  analysisHttpErrorMessage,
  analysisNetworkErrorMessage,
  checkAnalysisServiceReachable,
  getAnalysisServiceUrl,
} from "../utils/analysisErrors.js";

export { checkAnalysisServiceReachable };

/**
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<unknown>}
 */
export async function runActualAnalysis(eventId, userId) {
  if (!userId) {
    throw new Error("Missing user id for analysis request.");
  }
  const base = getAnalysisServiceUrl();
  const url = `${base}/analyze/actual/${encodeURIComponent(eventId)}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-user-id": userId,
      },
    });
  } catch (err) {
    throw new Error(analysisNetworkErrorMessage(err, "actual"));
  }
  if (!res.ok) {
    throw new Error(await analysisHttpErrorMessage(res, "actual"));
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
  const base = getAnalysisServiceUrl();
  const url = `${base}/analyze/predicted/${encodeURIComponent(eventId)}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-user-id": userId,
      },
    });
  } catch (err) {
    throw new Error(analysisNetworkErrorMessage(err, "predicted"));
  }
  if (!res.ok) {
    throw new Error(await analysisHttpErrorMessage(res, "predicted"));
  }
  return res.json();
}

/**
 * On-demand SHAP for an assessment (FastAPI UUID primary key).
 * @param {string} assessmentUuid
 * @param {string} userId
 * @returns {Promise<{ shap_output?: unknown }>}
 */
export async function generateAssessmentShap(assessmentUuid, userId) {
  if (!userId) {
    throw new Error("Missing user id for SHAP request.");
  }
  const id = String(assessmentUuid ?? "").trim();
  if (!id) {
    throw new Error("Missing assessment id for SHAP request.");
  }
  const base = getAnalysisServiceUrl();
  const url = `${base}/assessments/${encodeURIComponent(id)}/generate-shap`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-user-id": userId,
      },
    });
  } catch (err) {
    throw new Error(analysisNetworkErrorMessage(err));
  }
  if (!res.ok) {
    throw new Error(await analysisHttpErrorMessage(res));
  }
  return res.json();
}
