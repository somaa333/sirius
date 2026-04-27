import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import DashboardPageLayout from "../components/dashboard/DashboardPageLayout.jsx";
import CdmUploadHistory from "../components/dashboard/CdmUploadHistory.jsx";
import CdmValidationErrorsModal from "../components/dashboard/CdmValidationErrorsModal.jsx";
import { useToast } from "../components/toast/ToastProvider.jsx";
import { uploadAndQueueCdm, validateCsvFile } from "../services/cdmUploadQueue.js";
import { pollCdmUploadUntilTerminal } from "../services/cdmUploadPolling.js";
import { fetchRecentCdmUploadsForUser } from "../services/cdmUploadApi.js";
import { bannerFromUploadRow, getUploadButtonLabel } from "../utils/cdmUploadUi.js";
import "../components/dashboard/DashboardComponents.css";
import "./CdmUpload.css";

export default function CdmUpload() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const { pushToast } = useToast();
  const fileInputRef = useRef(null);
  const pollAbortRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [cdmUploadBusy, setCdmUploadBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState(
    /** @type {'idle' | 'uploading' | 'creating_record' | 'queueing' | 'starting_process' | 'polling'} */ ("idle"),
  );
  const [uploadFilePercent, setUploadFilePercent] = useState(
    /** @type {number | null} */ (null),
  );
  const [pollRow, setPollRow] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  );
  const [fileInputKey, setFileInputKey] = useState(0);

  const [uploadHistoryRows, setUploadHistoryRows] = useState(
    /** @type {Array<Record<string, unknown>>} */ ([]),
  );
  const [uploadHistoryError, setUploadHistoryError] = useState(
    /** @type {string | null} */ (null),
  );
  const [uploadHistoryLoading, setUploadHistoryLoading] = useState(false);
  const [selectedUploadId, setSelectedUploadId] = useState(
    /** @type {string | null} */ (null),
  );
  const [errorsModalOpen, setErrorsModalOpen] = useState(false);
  const [errorsModalUploadId, setErrorsModalUploadId] = useState(
    /** @type {string | null} */ (null),
  );
  const [errorsModalUploadCode, setErrorsModalUploadCode] = useState(
    /** @type {string | null} */ (null),
  );

  const canAccess = role === "admin" || role === "operator";

  const loadUploadHistory = useCallback(async () => {
    if (!user?.id) {
      setUploadHistoryRows([]);
      return;
    }
    setUploadHistoryError(null);
    setUploadHistoryLoading(true);
    try {
      const rows = await fetchRecentCdmUploadsForUser(user.id, 30);
      setUploadHistoryRows(rows);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String(/** @type {{ message?: string }} */ (err).message)
          : "Failed to load upload history.";
      setUploadHistoryError(msg);
      setUploadHistoryRows([]);
    } finally {
      setUploadHistoryLoading(false);
    }
  }, [user?.id]);

  const handleUploadCdm = useCallback(
    async (file) => {
      if (cdmUploadBusy) return;

      const validation = validateCsvFile(file);
      if (!validation.ok) {
        pushToast(validation.error, "error");
        setFileInputKey((k) => k + 1);
        return;
      }

      pollAbortRef.current = false;
      setCdmUploadBusy(true);
      setUploadFilePercent(null);
      setUploadPhase("creating_record");
      setPollRow(null);
      pushToast("Starting CDM upload.", "info");

      try {
        const { uploadId } = await uploadAndQueueCdm(file, {
          onPhase: (phase) => {
            if (phase === "creating_record") {
              setUploadPhase("creating_record");
              setUploadFilePercent(null);
            } else if (phase === "uploading") {
              setUploadPhase("uploading");
              setUploadFilePercent(0);
            } else if (phase === "queueing") {
              setUploadPhase("queueing");
              setUploadFilePercent(null);
            } else if (phase === "starting_process") {
              setUploadPhase("starting_process");
              setUploadFilePercent(null);
            }
          },
          onUploadProgress: (pct) => {
            setUploadFilePercent(pct);
          },
        });

        setUploadPhase("polling");
        setUploadFilePercent(null);
        pushToast("Import started. Monitoring progress...", "info");
        setSelectedUploadId(uploadId);

        const finalRow = await pollCdmUploadUntilTerminal(uploadId, {
          onUpdate: (row) => {
            setPollRow(/** @type {Record<string, unknown>} */ (row));
          },
          shouldAbort: () => pollAbortRef.current,
          intervalMs: 2000,
        });

        if (!finalRow) return;

        const doneBanner = bannerFromUploadRow(
          /** @type {Record<string, unknown>} */ (finalRow),
        );
        if (doneBanner) {
          const tone =
            doneBanner.type === "error"
              ? "error"
              : doneBanner.type === "warning"
                ? "info"
                : "success";
          pushToast(doneBanner.text, tone);
        }
        await loadUploadHistory();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Upload or queue failed.";
        pushToast(msg, "error");
      } finally {
        setCdmUploadBusy(false);
        setUploadPhase("idle");
        setUploadFilePercent(null);
        setPollRow(null);
        setFileInputKey((k) => k + 1);
      }
    },
    [cdmUploadBusy, loadUploadHistory, pushToast],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user?.id || !canAccess) return;
    loadUploadHistory();
  }, [canAccess, loadUploadHistory, user?.id]);

  useEffect(() => {
    return () => {
      pollAbortRef.current = true;
    };
  }, []);

  const uploadButtonLabel = useMemo(
    () =>
      getUploadButtonLabel(cdmUploadBusy, uploadPhase, pollRow, uploadFilePercent),
    [cdmUploadBusy, uploadPhase, pollRow, uploadFilePercent],
  );

  const uploadProgressPercent = useMemo(() => {
    if (typeof uploadFilePercent === "number" && Number.isFinite(uploadFilePercent)) {
      return Math.max(0, Math.min(100, uploadFilePercent));
    }
    const pollPct = Number(
      pollRow && typeof pollRow === "object" && "progress_percent" in pollRow
        ? /** @type {{ progress_percent?: unknown }} */ (pollRow).progress_percent
        : NaN,
    );
    if (Number.isFinite(pollPct)) return Math.max(0, Math.min(100, pollPct));
    return null;
  }, [uploadFilePercent, pollRow]);

  const uploadProgressDetail = useMemo(() => {
    if (!pollRow || typeof pollRow !== "object") return "";
    const processed = Number(
      "processed_rows" in pollRow
        ? /** @type {{ processed_rows?: unknown }} */ (pollRow).processed_rows
        : NaN,
    );
    const total = Number(
      "total_rows" in pollRow
        ? /** @type {{ total_rows?: unknown }} */ (pollRow).total_rows
        : NaN,
    );
    if (Number.isFinite(processed) && Number.isFinite(total) && total > 0) {
      return `${processed.toLocaleString()} / ${total.toLocaleString()} rows`;
    }
    return "";
  }, [pollRow]);

  if (loading || !user) return null;
  if (!canAccess) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <DashboardPageLayout title="Upload CDM">
        <section className="cdm-upload-hero" aria-label="Upload CDM files">
          <input
            key={fileInputKey}
            ref={fileInputRef}
            type="file"
            className="dash-file-input"
            accept=".csv,text/csv"
            disabled={cdmUploadBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadCdm(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={`cdm-upload-dropzone ${isDragging ? "cdm-upload-dropzone--active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!cdmUploadBusy) setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (cdmUploadBusy) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void handleUploadCdm(file);
            }}
            disabled={cdmUploadBusy}
          >
            {cdmUploadBusy ? (
              <div className="cdm-upload-progress-wrap">
                <p className="cdm-upload-progress-title">Uploading CDM file</p>
                <p className="cdm-upload-progress-status">{uploadButtonLabel}</p>
                <div
                  className="cdm-upload-progress-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgressPercent ?? undefined}
                >
                  <span
                    className={`cdm-upload-progress-fill ${uploadProgressPercent == null ? "cdm-upload-progress-fill--indeterminate" : ""}`}
                    style={
                      uploadProgressPercent == null
                        ? undefined
                        : { width: `${Math.max(3, uploadProgressPercent)}%` }
                    }
                  />
                </div>
                <p className="cdm-upload-progress-meta">
                  {uploadProgressPercent == null
                    ? "Calculating progress..."
                    : `${uploadProgressPercent.toFixed(1)}%`}
                  {uploadProgressDetail ? ` • ${uploadProgressDetail}` : ""}
                </p>
              </div>
            ) : (
              <>
                <p className="cdm-upload-title">Upload CDM files</p>
                <p className="cdm-upload-subtitle">
                  Drag and drop CSV file here, or click to browse your computer
                </p>
                <span className="dash-btn dash-btn--primary cdm-upload-cta">
                  Select file
                </span>
                <p className="cdm-upload-help">
                  Supported: CSV only. Max size: 50 MB.
                </p>
              </>
            )}
          </button>
        </section>

        <CdmUploadHistory
          rows={uploadHistoryRows}
          loading={uploadHistoryLoading}
          error={uploadHistoryError}
          selectedUploadId={selectedUploadId}
          onViewValidationErrors={(id) => {
            const row = uploadHistoryRows.find((r) => String(r.id ?? "") === id);
            setErrorsModalUploadId(id);
            setErrorsModalUploadCode(
              row?.upload_code == null ? null : String(row.upload_code),
            );
            setErrorsModalOpen(true);
          }}
        />
      </DashboardPageLayout>

      <CdmValidationErrorsModal
        open={errorsModalOpen}
        uploadId={errorsModalUploadId}
        uploadCode={errorsModalUploadCode}
        onClose={() => {
          setErrorsModalOpen(false);
          setErrorsModalUploadId(null);
          setErrorsModalUploadCode(null);
        }}
      />
    </>
  );
}
