import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  ANALYSIS_ACTUAL_STEPS,
  ANALYSIS_PREDICTED_STEPS,
  ANALYSIS_SIMULATED_CAP,
  analysisStepIndexFromProgress,
} from "../../constants/analysisProgress.js";
import "../../pages/CdmUpload.css";
import "../dashboard/DashboardComponents.css";
import "./AnalysisProgressModal.css";

/**
 * @param {object} props
 * @param {'running' | 'success' | 'error'} props.phase
 * @param {'actual' | 'predicted'} props.variant
 * @param {string} props.eventId
 * @param {string | null} props.assessmentDisplayCode Human-readable id (e.g. RA16)
 * @param {string | null} props.assessmentRouteId DB uuid for details route
 * @param {string | null} props.errorMessage
 * @param {number} props.simulatedPercent 0–100; while running creeps toward ~92; 100 on success
 * @param {() => void} props.onClose
 * @param {() => void} props.onRetry
 */
export default function AnalysisProgressModal({
  phase,
  variant,
  eventId,
  assessmentDisplayCode,
  assessmentRouteId,
  errorMessage,
  simulatedPercent,
  onClose,
  onRetry,
}) {
  const steps = variant === "predicted" ? ANALYSIS_PREDICTED_STEPS : ANALYSIS_ACTUAL_STEPS;
  const analysisKindLabel =
    variant === "predicted" ? "Predicted analysis" : "Actual analysis";

  const safePct =
    typeof simulatedPercent === "number" && Number.isFinite(simulatedPercent)
      ? Math.max(0, Math.min(100, simulatedPercent))
      : 0;

  const stepIdx =
    phase === "running"
      ? analysisStepIndexFromProgress(safePct, steps.length)
      : Math.max(0, steps.length - 1);
  const step = steps[stepIdx] ?? steps[0];

  const barPercent =
    phase === "success"
      ? 100
      : phase === "error"
        ? Math.max(3, Math.min(ANALYSIS_SIMULATED_CAP, safePct))
        : Math.max(3, Math.min(ANALYSIS_SIMULATED_CAP, safePct));

  const mainTitle =
    phase === "success"
      ? "Analysis completed successfully"
      : phase === "error"
        ? "Analysis failed"
        : analysisKindLabel;

  const statusLine =
    phase === "running"
      ? step.label
      : phase === "success"
        ? analysisKindLabel
        : "Something went wrong. You can retry or close this dialog.";

  const metaLine =
    phase === "running"
      ? `${(safePct < ANALYSIS_SIMULATED_CAP ? safePct : ANALYSIS_SIMULATED_CAP).toFixed(1)}%${eventId ? ` · Event ${eventId}` : ""}`
      : phase === "success"
        ? `100%${eventId ? ` · Event ${eventId}` : ""}`
        : `${safePct.toFixed(1)}%${eventId ? ` · Event ${eventId}` : ""}`;

  const canDismiss = phase !== "running";

  return (
    <div
      className="dash-modal-backdrop analysis-progress-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-progress-title"
      aria-busy={phase === "running"}
      onClick={(e) => {
        if (e.target === e.currentTarget && canDismiss) onClose();
      }}
    >
      <div
        className="dash-modal analysis-progress-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="analysis-progress-modal__hero">
          {phase === "running" ? (
            <Loader2
              className="analysis-progress-spinner"
              size={28}
              strokeWidth={2}
              aria-hidden="true"
            />
          ) : phase === "success" ? (
            <CheckCircle2
              className="analysis-progress-icon analysis-progress-icon--success"
              size={28}
              strokeWidth={2}
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="analysis-progress-icon analysis-progress-icon--error"
              size={28}
              strokeWidth={2}
              aria-hidden="true"
            />
          )}

          <div className="cdm-upload-progress-wrap analysis-progress-modal__progress">
            <p className="cdm-upload-progress-title" id="analysis-progress-title">
              {mainTitle}
            </p>
            <p className="cdm-upload-progress-status">{statusLine}</p>
            {phase === "running" ? (
              <p className="analysis-progress-step-msg">{step.message}</p>
            ) : null}

            <div
              className="cdm-upload-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(barPercent)}
            >
              <span
                className="cdm-upload-progress-fill"
                style={{
                  width: `${Math.max(3, barPercent)}%`,
                  transition: "width 0.35s ease",
                }}
              />
            </div>

            <p className="cdm-upload-progress-meta">{metaLine}</p>
          </div>
        </div>

        {phase === "success" ? (
          <div className="analysis-progress-modal__footer analysis-progress-modal__footer--success">
            <p className="analysis-progress-detail">
              {assessmentDisplayCode ? (
                <>
                  Assessment ID:{" "}
                  <span className="analysis-progress-assessment-id">
                    {assessmentDisplayCode}
                  </span>
                </>
              ) : (
                "Assessment saved."
              )}
            </p>
            <div className="analysis-progress-actions">
              {assessmentRouteId ? (
                <Link
                  className="dash-btn dash-btn--primary"
                  to={`/analysis/${encodeURIComponent(assessmentRouteId)}`}
                  onClick={onClose}
                >
                  View Assessment Details
                </Link>
              ) : null}
              <button type="button" className="dash-btn dash-btn--ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="analysis-progress-modal__footer analysis-progress-modal__footer--error">
            <p className="analysis-progress-error" role="alert">
              {errorMessage ?? "Analysis failed."}
            </p>
            <div className="analysis-progress-actions">
              <button type="button" className="dash-btn dash-btn--primary" onClick={onRetry}>
                Retry
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {phase === "running" ? (
          <p className="analysis-progress-hint">
            Waiting for the analysis service — progress advances automatically until the run finishes.
          </p>
        ) : null}
      </div>
    </div>
  );
}
