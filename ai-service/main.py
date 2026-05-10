from datetime import datetime, timezone
import logging
import math
import re
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from supabase_client import supabase
from classification_runtime import (
    classify_actual_event,
    explain_with_shap,
    load_classification_model_cached,
    prepare_single_event_for_classification,
    _scale_sequence,
)
from prediction_runtime import predict_next_cdm

CLASSIFICATION_ARTIFACTS_DIR = Path(__file__).resolve().parent / "classification_artifacts"

logger = logging.getLogger(__name__)


app = FastAPI(title="SIRIUS AI Service")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://sirius-ecru.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def to_python_types(obj):
    if isinstance(obj, dict):
        return {k: to_python_types(v) for k, v in obj.items()}

    if isinstance(obj, list):
        return [to_python_types(v) for v in obj]

    if isinstance(obj, np.generic):
        obj = obj.item()

    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()

    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj

    return obj


def normalize_iso_datetime(value):
    if value is None:
        return None

    try:
        return pd.to_datetime(value, utc=True).isoformat()
    except Exception:
        return None


def unix_seconds_to_iso(value):
    if value is None:
        return None

    try:
        return pd.to_datetime(float(value), unit="s", utc=True).isoformat()
    except Exception:
        return None


def clamp_probability(value):
    if value is None:
        return None

    try:
        value = float(value)
    except Exception:
        return None

    if math.isnan(value) or math.isinf(value):
        return None

    return max(0.0, min(1.0, value))


def _normalize_shap_report(report):
    if isinstance(report, dict):
        top = report.get("top_features")
        if isinstance(top, list):
            for item in top:
                if not isinstance(item, dict):
                    continue
                mar = item.get("mean_abs_shap")
                if mar is not None and item.get("abs_mean_shap") is None:
                    item["abs_mean_shap"] = mar
    return report


def generate_shap_explanation(df_event):
    """
    SHAP interpretability only; failures return None.
    Uses cached model weights and fast SHAP settings for on-demand generation.
    """
    bg_path = CLASSIFICATION_ARTIFACTS_DIR / "classification_shap_background.npy"
    if not bg_path.exists():
        logger.warning(
            "SHAP: classification_shap_background.npy not found under classification_artifacts; "
            "explain_with_shap will use the built-in fallback background."
        )

    try:
        model, scaler, metadata = load_classification_model_cached(CLASSIFICATION_ARTIFACTS_DIR)
        seq, mask, _processed_df, _target_row = prepare_single_event_for_classification(
            df_event,
            metadata,
        )
        seq_scaled = _scale_sequence(seq, mask, scaler)

        shap_report = explain_with_shap(
            model=model,
            seq_scaled=seq_scaled,
            metadata=metadata,
            artifacts_dir=CLASSIFICATION_ARTIFACTS_DIR,
            max_display=10,
            fast_mode=True,
            max_background_rows=48,
        )
        report = to_python_types(shap_report)
        return _normalize_shap_report(report)
    except Exception as e:
        logger.exception("SHAP explanation failed: %s", e)
        return None


def _sort_cdms_by_creation_date(rows: list[dict]) -> list[dict]:
    def sort_key(row: dict):
        v = (row or {}).get("creation_date") or (row or {}).get("created_at")
        if v is None:
            return pd.Timestamp(0, tz="UTC")
        try:
            return pd.to_datetime(v, utc=True)
        except Exception:
            return pd.Timestamp(0, tz="UTC")

    return sorted(rows or [], key=sort_key)


def _fetch_cdm_records_by_ids(ids: list[str]) -> dict[str, dict]:
    """Fetch cdm_records rows keyed by string id."""
    ids = [i for i in {str(i).strip() for i in ids if i is not None and str(i).strip()}]
    if not ids:
        return {}
    response = supabase.table("cdm_records").select("*").in_("id", ids).execute()
    out: dict[str, dict] = {}
    for row in response.data or []:
        if isinstance(row, dict) and row.get("id") is not None:
            out[str(row["id"])] = row
    return out


def _build_actual_event_dataframe_for_shap(assessment_uuid: str) -> pd.DataFrame:
    lr = (
        supabase.table("assessment_cdm_links")
        .select("*")
        .eq("assessment_id", assessment_uuid)
        .execute()
    )
    links = lr.data or []
    wanted_roles = {"input_history", "actual_target"}
    link_rows = [l for l in links if isinstance(l, dict) and str(l.get("role") or "") in wanted_roles]
    cdm_ids: list[str] = []
    for link in link_rows:
        cid = link.get("cdm_record_id") or link.get("cdm_id")
        if cid is not None and str(cid).strip():
            cdm_ids.append(str(cid).strip())

    by_id = _fetch_cdm_records_by_ids(cdm_ids)
    ordered: list[dict] = []
    seen = set()
    for lid in cdm_ids:
        if lid in seen:
            continue
        seen.add(lid)
        row = by_id.get(lid)
        if row:
            ordered.append(dict(row))

    ordered = _sort_cdms_by_creation_date(ordered)
    if not ordered:
        raise ValueError("No CDM rows found for this assessment links")
    return pd.DataFrame(ordered)


def _build_predicted_full_event_dataframe_for_shap(
    assessment_uuid: str,
    assessment: dict,
    user_id: str,
) -> pd.DataFrame:
    lr = (
        supabase.table("assessment_cdm_links")
        .select("*")
        .eq("assessment_id", assessment_uuid)
        .execute()
    )
    links = lr.data or []
    link_rows = [
        l for l in links if isinstance(l, dict) and str(l.get("role") or "") == "input_history"
    ]
    cdm_ids: list[str] = []
    for link in link_rows:
        cid = link.get("cdm_record_id") or link.get("cdm_id")
        if cid is not None and str(cid).strip():
            cdm_ids.append(str(cid).strip())

    by_id = _fetch_cdm_records_by_ids(cdm_ids)
    ordered: list[dict] = []
    seen = set()
    for lid in cdm_ids:
        if lid in seen:
            continue
        seen.add(lid)
        row = by_id.get(lid)
        if row:
            ordered.append(dict(row))

    sorted_actuals = _sort_cdms_by_creation_date(ordered)
    if not sorted_actuals:
        raise ValueError("No input_history CDMs found for predicted assessment")

    pred_id = assessment.get("predicted_cdm_record_id") or assessment.get("predictedCdmRecordId")
    if not pred_id:
        raise ValueError("Assessment has no predicted_cdm_record_id")

    pred_resp = (
        supabase.table("predicted_cdm_records")
        .select("*")
        .eq("id", str(pred_id))
        .eq("created_by", user_id)
        .execute()
    )
    pred_rows = pred_resp.data or []
    if not pred_rows:
        raise ValueError("Predicted CDM record not found or access denied")

    predicted = dict(pred_rows[0])
    last_actual = dict(sorted_actuals[-1])
    merged = {**last_actual, **predicted}
    merged["id"] = predicted.get("id")

    full_rows = sorted_actuals + [merged]
    return pd.DataFrame(full_rows)


def require_user_id(x_user_id):
    user_id = (x_user_id or "").strip()

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Missing x-user-id header",
        )

    return user_id


def fetch_actual_cdms_for_event_user(event_id: str, user_id: str) -> list[dict]:
    """
    Actual CDMs for this event that the user may use for analysis.
    Matches the frontend / Dashboard: row is visible if created_by OR
    the parent cdm_uploads.uploaded_by equals user_id.
    """
    response = (
        supabase.table("cdm_records")
        .select("*, upload:cdm_uploads(uploaded_by)")
        .eq("event_id", event_id)
        .eq("source_type", "actual")
        .order("creation_date")
        .execute()
    )

    rows = response.data or []
    out: list[dict] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        created_by = str(row.get("created_by") or "").strip()

        upload = row.get("upload")
        uploaded_by = ""
        if isinstance(upload, dict):
            uploaded_by = str(upload.get("uploaded_by") or "").strip()

        if created_by != user_id and uploaded_by != user_id:
            continue

        clean = dict(row)
        clean.pop("upload", None)
        out.append(clean)

    return out


def get_next_assessment_code():
    try:
        response = (
            supabase.table("risk_assessments")
            .select("assessment_id")
            .execute()
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate assessment_id: {str(e)}",
        )

    max_n = 0

    for row in response.data or []:
        raw = str((row or {}).get("assessment_id") or "").strip().upper()
        match = re.match(r"^RA(\d+)$", raw)

        if not match:
            continue

        n = int(match.group(1))
        max_n = max(max_n, n)

    return f"RA{max_n + 1}"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/assessments/{assessment_uuid}/generate-shap")
def generate_assessment_shap(
    assessment_uuid: str,
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
):
    """
    On-demand SHAP for an existing assessment (does not block main analyze flows).
    """
    user_id = require_user_id(x_user_id)
    logger.info(
        "SHAP generate-shap started assessment_uuid=%s user_id=%s",
        assessment_uuid,
        user_id,
    )
    try:
        ar = (
            supabase.table("risk_assessments")
            .select("*")
            .eq("id", assessment_uuid)
            .eq("created_by", user_id)
            .execute()
        )
        rows = ar.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Assessment not found")

        assessment = rows[0]
        analysis_type = str(assessment.get("analysis_type") or "").lower()

        if analysis_type == "actual":
            df_event = _build_actual_event_dataframe_for_shap(assessment_uuid)
        elif analysis_type == "predicted":
            df_event = _build_predicted_full_event_dataframe_for_shap(
                assessment_uuid,
                assessment,
                user_id,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported analysis_type for SHAP generation",
            )

        report = generate_shap_explanation(df_event)
        if report is None:
            logger.error(
                "SHAP generate-shap produced no report assessment_uuid=%s",
                assessment_uuid,
            )
            raise HTTPException(
                status_code=500,
                detail="SHAP explanation could not be computed for this assessment.",
            )

        supabase.table("risk_assessments").update({"shap_output": report}).eq(
            "id", assessment_uuid
        ).eq("created_by", user_id).execute()

        logger.info(
            "SHAP generate-shap finished assessment_uuid=%s",
            assessment_uuid,
        )
        return {"shap_output": report}

    except HTTPException:
        raise
    except ValueError as e:
        logger.exception(
            "SHAP generate-shap reconstruction failed assessment_uuid=%s",
            assessment_uuid,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reconstruct event data for SHAP: {str(e)}",
        ) from e
    except Exception as e:
        logger.exception(
            "SHAP generate-shap failed assessment_uuid=%s",
            assessment_uuid,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate SHAP explanation: {str(e)}",
        ) from e


@app.get("/events/{event_id}/cdms")
def get_event_cdms(
    event_id: str,
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
):
    user_id = require_user_id(x_user_id)

    try:
        cdm_rows = fetch_actual_cdms_for_event_user(event_id, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch CDMs: {str(e)}")

    if not cdm_rows:
        raise HTTPException(status_code=404, detail="No actual CDMs found for this event")

    return {
        "event_id": event_id,
        "count": len(cdm_rows),
        "cdms": cdm_rows,
    }


@app.post("/analyze/actual/{event_id}")
def analyze_actual_event(
    event_id: str,
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
):
    user_id = require_user_id(x_user_id)

    try:
        cdm_rows = fetch_actual_cdms_for_event_user(event_id, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch actual CDMs: {str(e)}")

    if not cdm_rows:
        raise HTTPException(status_code=404, detail="No actual CDMs found for this event")

    if len(cdm_rows) < 1:
        raise HTTPException(
            status_code=400,
            detail="This event does not have enough CDMs for actual analysis",
        )

    df_event = pd.DataFrame(cdm_rows)

    try:
        result = classify_actual_event(df_event)
        result = to_python_types(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")

    target_actual_cdm_id = result.get("target_actual_cdm_id")

    if not target_actual_cdm_id:
        raise HTTPException(
            status_code=500,
            detail="Classification succeeded but target actual CDM ID could not be determined",
        )

    assessment_uuid = str(uuid.uuid4())
    assessment_code = get_next_assessment_code()

    assessment_payload = to_python_types(
        {
            "id": assessment_uuid,
            "assessment_id": assessment_code,
            "event_id": event_id,
            "analysis_type": "actual",
            "status": "completed",
            "risk_level": result["risk_level"],
            "confidence_score": result["confidence_score"],
            "recommended_decision": result["recommended_decision"],
            "classification_probability": result["classification_probability"],
            "input_cdm_count": result["input_cdm_count"],
            "first_input_creation_date": cdm_rows[0]["creation_date"],
            "last_input_creation_date": cdm_rows[-1]["creation_date"],
            "target_actual_cdm_id": target_actual_cdm_id,
            "classification_model_version": "v1",
            "classification_output": result,
            "shap_output": None,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    try:
        supabase.table("risk_assessments").insert(assessment_payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save risk assessment: {str(e)}")

    assessment_links = []

    for row in cdm_rows:
        role = "actual_target" if row["id"] == target_actual_cdm_id else "input_history"
        assessment_links.append(
            {
                "assessment_id": assessment_uuid,
                "cdm_record_id": row["id"],
                "role": role,
            }
        )

    try:
        supabase.table("assessment_cdm_links").insert(assessment_links).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Assessment saved, but failed to save CDM links: {str(e)}",
        )

    return {
        "message": "Actual analysis completed successfully",
        "assessment_id": assessment_code,
        "assessment_uuid": assessment_uuid,
        "event_id": event_id,
        "result": result,
    }


@app.post("/analyze/predicted/{event_id}")
def analyze_predicted_event(
    event_id: str,
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
):
    user_id = require_user_id(x_user_id)

    try:
        cdm_rows = fetch_actual_cdms_for_event_user(event_id, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch actual CDMs: {str(e)}")

    if not cdm_rows:
        raise HTTPException(status_code=404, detail="No actual CDMs found for this event")

    if len(cdm_rows) < 3:
        raise HTTPException(
            status_code=400,
            detail="This event does not have enough CDMs for predicted analysis",
        )

    df_event = pd.DataFrame(cdm_rows)

    try:
        pred_result = predict_next_cdm(df_event)
        pred_result = to_python_types(pred_result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction model failed: {str(e)}")

    # Current prediction_runtime output uses:
    # - predicted_row
    # - raw_predicted_features_before_postprocessing
    # not predicted_features / derived_features.
    predicted_features = dict(to_python_types(pred_result.get("predicted_row", {})))
    raw_predicted_features = dict(
        to_python_types(pred_result.get("raw_predicted_features_before_postprocessing", {}))
    )

    if not predicted_features:
        raise HTTPException(
            status_code=500,
            detail="Prediction model did not return predicted_row",
        )

    predicted_creation_date = normalize_iso_datetime(
        predicted_features.get("creation_date")
    )

    predicted_tca_raw = predicted_features.get("tca")
    predicted_tca = (
        normalize_iso_datetime(predicted_tca_raw)
        or unix_seconds_to_iso(predicted_tca_raw)
    )

    if predicted_creation_date is None:
        predicted_creation_date = predicted_tca

    if predicted_creation_date is None:
        raise HTTPException(
            status_code=500,
            detail="Prediction model did not return a valid creation_date or tca for the predicted CDM",
        )

    predicted_time_to_tca = predicted_features.get("time_to_tca")

    predicted_cp = clamp_probability(predicted_features.get("collision_probability"))
    predicted_features["collision_probability"] = predicted_cp

    predicted_log_risk = None
    if predicted_cp is not None:
        predicted_log_risk = math.log10(predicted_cp + 1e-12)

    latest_actual_cdm_id = cdm_rows[-1]["id"]

    assessment_uuid = str(uuid.uuid4())
    assessment_code = get_next_assessment_code()
    predicted_cdm_uuid = str(uuid.uuid4())

    # Prevent these fixed values from being overwritten later.
    predicted_features.pop("creation_date", None)
    predicted_features.pop("tca", None)
    predicted_features.pop("collision_probability", None)
    predicted_features.pop("time_to_tca", None)

    predicted_cdm_payload = to_python_types(
        {
            "id": predicted_cdm_uuid,
            "generated_by_assessment_id": None,
            "event_id": event_id,
            "source_actual_event_last_cdm_id": latest_actual_cdm_id,
            "creation_date": predicted_creation_date,
            "tca": predicted_tca,
            "time_to_tca": predicted_time_to_tca,
            "collision_probability": predicted_cp,
            "log_risk": predicted_log_risk,
            "miss_distance": predicted_features.get("miss_distance"),
            "relative_speed": predicted_features.get("relative_speed"),
            "relative_position_r": predicted_features.get("relative_position_r"),
            "relative_position_t": predicted_features.get("relative_position_t"),
            "relative_position_n": predicted_features.get("relative_position_n"),
            "relative_velocity_r": predicted_features.get("relative_velocity_r"),
            "relative_velocity_t": predicted_features.get("relative_velocity_t"),
            "relative_velocity_n": predicted_features.get("relative_velocity_n"),
            "object1_cn_n": predicted_features.get("object1_cn_n"),
            "object1_cr_r": predicted_features.get("object1_cr_r"),
            "object1_ct_t": predicted_features.get("object1_ct_t"),
            "object1_hbr": predicted_features.get("object1_hbr"),
            "object1_x": predicted_features.get("object1_x"),
            "object1_x_dot": predicted_features.get("object1_x_dot"),
            "object1_y": predicted_features.get("object1_y"),
            "object1_y_dot": predicted_features.get("object1_y_dot"),
            "object1_z": predicted_features.get("object1_z"),
            "object1_z_dot": predicted_features.get("object1_z_dot"),
            "object2_cn_n": predicted_features.get("object2_cn_n"),
            "object2_cr_r": predicted_features.get("object2_cr_r"),
            "object2_ct_t": predicted_features.get("object2_ct_t"),
            "object2_hbr": predicted_features.get("object2_hbr"),
            "object2_x": predicted_features.get("object2_x"),
            "object2_x_dot": predicted_features.get("object2_x_dot"),
            "object2_y": predicted_features.get("object2_y"),
            "object2_y_dot": predicted_features.get("object2_y_dot"),
            "object2_z": predicted_features.get("object2_z"),
            "object2_z_dot": predicted_features.get("object2_z_dot"),
            "feature_uncertainty_variance": pred_result.get("feature_uncertainty_variance"),
            "feature_uncertainty_std": pred_result.get("feature_uncertainty_std"),
            "overall_uncertainty": pred_result.get("overall_uncertainty"),
            "raw_predicted_features": raw_predicted_features,
            "prediction_model_version": pred_result.get("model_version") or "v1",
            "prediction_output": pred_result,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    try:
        supabase.table("predicted_cdm_records").insert(predicted_cdm_payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save predicted CDM: {str(e)}")

    last_actual_row = dict(cdm_rows[-1])

    predicted_row_for_classification = dict(last_actual_row)
    predicted_row_for_classification["id"] = predicted_cdm_uuid
    predicted_row_for_classification["creation_date"] = predicted_creation_date
    predicted_row_for_classification["tca"] = predicted_tca
    predicted_row_for_classification["collision_probability"] = predicted_cp
    predicted_row_for_classification["time_to_tca"] = predicted_time_to_tca

    for key, value in predicted_features.items():
        predicted_row_for_classification[key] = value

    predicted_row_for_classification = to_python_types(predicted_row_for_classification)

    full_event_rows = cdm_rows + [predicted_row_for_classification]
    df_full_event = pd.DataFrame(full_event_rows)

    try:
        class_result = classify_actual_event(df_full_event)
        class_result = to_python_types(class_result)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Classification on predicted CDM failed: {str(e)}",
        )

    assessment_payload = to_python_types(
        {
            "id": assessment_uuid,
            "assessment_id": assessment_code,
            "event_id": event_id,
            "analysis_type": "predicted",
            "status": "completed",
            "risk_level": class_result["risk_level"],
            "confidence_score": class_result["confidence_score"],
            "recommended_decision": class_result["recommended_decision"],
            "classification_probability": class_result["classification_probability"],
            "input_cdm_count": pred_result.get("input_cdm_count", len(cdm_rows)),
            "first_input_creation_date": cdm_rows[0]["creation_date"],
            "last_input_creation_date": predicted_creation_date,
            "target_actual_cdm_id": None,
            "predicted_cdm_record_id": predicted_cdm_uuid,
            "prediction_model_version": pred_result.get("model_version") or "v1",
            "classification_model_version": "v1",
            "prediction_output": pred_result,
            "classification_output": class_result,
            "shap_output": None,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    try:
        supabase.table("risk_assessments").insert(assessment_payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save risk assessment: {str(e)}")

    try:
        supabase.table("predicted_cdm_records").update(
            {"generated_by_assessment_id": assessment_uuid}
        ).eq("id", predicted_cdm_uuid).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Assessment saved, but failed to link predicted CDM back to assessment: {str(e)}",
        )

    assessment_links = [
        {
            "assessment_id": assessment_uuid,
            "cdm_record_id": row["id"],
            "role": "input_history",
        }
        for row in cdm_rows
    ]

    try:
        supabase.table("assessment_cdm_links").insert(assessment_links).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Assessment saved, but failed to save CDM links: {str(e)}",
        )

    return {
        "message": "Predicted analysis completed successfully",
        "assessment_id": assessment_code,
        "assessment_uuid": assessment_uuid,
        "event_id": event_id,
        "prediction_result": pred_result,
        "classification_result": class_result,
        "predicted_cdm_record_id": predicted_cdm_uuid,
    }