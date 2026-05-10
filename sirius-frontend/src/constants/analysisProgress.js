/**
 * UI copy and helpers for the analysis run progress modal.
 * The FastAPI analysis call is a single long request; the UI simulates step labels from percent (see AnalysisPage).
 */

/** Simulated progress stops at this value until the API returns. */
export const ANALYSIS_SIMULATED_CAP = 92;

/** @type {ReadonlyArray<{ label: string; message: string }>} */
export const ANALYSIS_ACTUAL_STEPS = [
  { label: "Fetching event CDMs", message: "Retrieving CDM records for the selected event." },
  { label: "Preparing CDM sequence", message: "Ordering and validating the CDM time series." },
  { label: "Running classification model", message: "Computing risk from the sequence." },
  { label: "Saving assessment results", message: "Writing results to your workspace." },
  { label: "Finalizing analysis", message: "Completing the analysis run." },
];

/** @type {ReadonlyArray<{ label: string; message: string }>} */
export const ANALYSIS_PREDICTED_STEPS = [
  { label: "Fetching event CDMs", message: "Retrieving CDM records for the selected event." },
  { label: "Preparing CDM sequence", message: "Ordering and validating the CDM time series." },
  { label: "Predicting next CDM", message: "Generating the next CDM in the sequence." },
  { label: "Classifying predicted CDM", message: "Evaluating risk for the predicted CDM." },
  { label: "Saving prediction and assessment", message: "Persisting prediction outputs and assessment." },
  { label: "Finalizing analysis", message: "Completing the analysis run." },
];

/**
 * Maps simulated progress (0–{@link ANALYSIS_SIMULATED_CAP} while waiting) to a step index.
 * @param {number} pct
 * @param {number} totalSteps
 * @returns {number}
 */
export function analysisStepIndexFromProgress(pct, totalSteps) {
  if (totalSteps <= 0) return 0;
  const clamped = Math.max(0, Math.min(ANALYSIS_SIMULATED_CAP, pct));
  const idx = Math.floor((clamped / ANALYSIS_SIMULATED_CAP) * totalSteps);
  return Math.min(totalSteps - 1, Math.max(0, idx));
}
