import json
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

DEFAULT_RISK_THRESHOLD = 1e-6


class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 50):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.pe[:, : x.size(1)]


class SiriusSequentialTransformer(nn.Module):
    """
    Same architecture used in the notebook:
    sequence ending at current CDM -> classify that same last CDM.
    """

    def __init__(
        self,
        input_dim: int,
        d_model: int = 128,
        nhead: int = 8,
        num_layers: int = 3,
        dropout: float = 0.2,
        max_seq_len: int = 8,
    ):
        super().__init__()
        self.input_projection = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model, max_len=max_seq_len)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dropout=dropout,
            dim_feedforward=4 * d_model,
            batch_first=True,
            activation="gelu",
        )

        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer,
            num_layers=num_layers,
        )

        self.norm = nn.LayerNorm(d_model)
        self.classifier = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

    def forward(
        self,
        x: torch.Tensor,
        src_key_padding_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        x = self.input_projection(x)
        x = self.pos_encoder(x)
        output = self.transformer_encoder(x, src_key_padding_mask=src_key_padding_mask)

        # The model classifies the last real CDM position after left-padding.
        last_state = self.norm(output[:, -1, :])
        return self.classifier(last_state).squeeze(-1)


class SequentialWrapper(nn.Module):
    """
    SHAP wrapper. It receives already-scaled padded sequences and rebuilds
    the padding mask from all-zero rows.
    """

    def __init__(self, model: SiriusSequentialTransformer):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        pad_mask = x.abs().sum(dim=-1) == 0
        logits = self.model(x, src_key_padding_mask=pad_mask)
        return torch.sigmoid(logits).unsqueeze(-1)


def _default_artifacts_dir() -> Path:
    return Path(__file__).resolve().parent / "classification_artifacts"


def load_classification_model(artifacts_dir: str | Path | None = None):
    artifacts_dir = Path(artifacts_dir) if artifacts_dir else _default_artifacts_dir()

    metadata_path = artifacts_dir / "classification_metadata.json"
    scaler_path = artifacts_dir / "classification_scaler.pkl"
    model_path = artifacts_dir / "classification_model.pth"

    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata file: {metadata_path}")
    if not scaler_path.exists():
        raise FileNotFoundError(f"Missing scaler file: {scaler_path}")
    if not model_path.exists():
        raise FileNotFoundError(f"Missing model weights file: {model_path}")

    metadata = json.loads(metadata_path.read_text())
    scaler = joblib.load(scaler_path)

    feature_cols = list(metadata["feature_cols"])
    params = metadata.get("model_params", {})

    model = SiriusSequentialTransformer(
        input_dim=len(feature_cols),
        d_model=int(params.get("d_model", 128)),
        nhead=int(params.get("nhead", 8)),
        num_layers=int(params.get("num_layers", 3)),
        dropout=float(params.get("dropout", 0.2)),
        max_seq_len=int(metadata.get("max_seq_len", 8)),
    )

    state_dict = torch.load(model_path, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()

    return model, scaler, metadata


def _to_dataframe(event_data: Any) -> pd.DataFrame:
    if isinstance(event_data, pd.DataFrame):
        return event_data.copy()
    if isinstance(event_data, list):
        return pd.DataFrame(event_data)
    if isinstance(event_data, dict):
        return pd.DataFrame([event_data])
    raise TypeError("event_data must be a pandas DataFrame, list[dict], or dict.")


def preprocess_event_for_classification(df_event: pd.DataFrame, metadata: dict) -> pd.DataFrame:
    """
    Runtime preprocessing aligned with the notebook inference logic:
    - validate required columns
    - parse creation_date and tca
    - coerce model feature columns to numeric
    - compute time_to_tca
    - sort by creation_date
    - drop rows that cannot be used by the model

    Note: training-only operations such as train/test split, scaler fitting,
    and model training are intentionally not done here.
    """
    df = df_event.copy()

    feature_cols = list(metadata["feature_cols"])
    required_base = ["creation_date", "tca"]
    required_all = required_base + [c for c in feature_cols if c != "time_to_tca"]

    missing = [c for c in required_all if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns for classification: {missing}")

    df["creation_date"] = pd.to_datetime(df["creation_date"], errors="coerce", utc=True)
    df["tca"] = pd.to_datetime(df["tca"], errors="coerce", utc=True)

    numeric_cols = set(feature_cols)
    numeric_cols.discard("time_to_tca")
    numeric_cols.add("collision_probability")

    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.replace([np.inf, -np.inf], np.nan)
    df["time_to_tca"] = (df["tca"] - df["creation_date"]).dt.total_seconds() / 86400.0

    before_rows = len(df)
    df = df.dropna(subset=["creation_date", "tca"])
    df = df.sort_values("creation_date").reset_index(drop=True)
    df = df.dropna(subset=feature_cols).reset_index(drop=True)

    if len(df) < 1:
        raise ValueError("The event must contain at least 1 valid CDM for classification.")

    df.attrs["preprocessing_summary"] = {
        "input_rows": int(before_rows),
        "usable_rows": int(len(df)),
        "dropped_rows": int(before_rows - len(df)),
        "feature_count": int(len(feature_cols)),
        "sorted_by": "creation_date",
        "computed_features": ["time_to_tca"],
    }

    return df


def prepare_single_event_for_classification(df_event: pd.DataFrame, metadata: dict):
    feature_cols = list(metadata["feature_cols"])
    max_seq_len = int(metadata.get("max_seq_len", 8))

    df_event = preprocess_event_for_classification(df_event, metadata)

    seq = df_event[feature_cols].values.astype(np.float32)

    mask = np.zeros(max_seq_len, dtype=bool)
    if len(seq) > max_seq_len:
        seq = seq[-max_seq_len:]
    else:
        pad_width = max_seq_len - len(seq)
        seq = np.pad(seq, ((pad_width, 0), (0, 0)), mode="constant")
        mask[:pad_width] = True

    target_row = df_event.iloc[-1].copy()

    return seq, mask, df_event, target_row


def _scale_sequence(seq: np.ndarray, mask: np.ndarray, scaler) -> np.ndarray:
    seq_scaled = np.zeros_like(seq, dtype=np.float32)
    real_rows = ~mask
    if np.any(real_rows):
        seq_scaled[real_rows] = scaler.transform(seq[real_rows])
    return seq_scaled


def _mc_dropout_predict(
    model: SiriusSequentialTransformer,
    x: torch.Tensor,
    mask: torch.Tensor,
    mc_passes: int = 50,
) -> tuple[float, float, list[float]]:
    """
    MC Dropout inference:
    model.train() keeps dropout active while torch.no_grad() prevents training.
    """
    model.train()
    probs: list[float] = []

    with torch.no_grad():
        for _ in range(int(mc_passes)):
            logits = model(x, src_key_padding_mask=mask)
            probs.append(float(torch.sigmoid(logits).cpu().numpy().item()))

    return float(np.mean(probs)), float(np.std(probs)), probs


def explain_with_shap(
    model: SiriusSequentialTransformer,
    seq_scaled: np.ndarray,
    metadata: dict,
    artifacts_dir: str | Path | None = None,
    max_display: int = 20,
) -> dict:
    """
    Optional SHAP explanation for one event.

    Best practice:
    save a background file from training as:
        classification_artifacts/classification_shap_background.npy

    The background must contain scaled padded sequences with shape:
        (N, max_seq_len, num_features)

    If no background file exists, this function falls back to repeating the
    current event sequence. That fallback is usable for API stability, but less
    meaningful than a real training background.
    """
    try:
        import shap
    except ImportError as exc:
        raise ImportError(
            "SHAP is not installed. Install it in the ai-service environment: pip install shap"
        ) from exc

    artifacts_dir = Path(artifacts_dir) if artifacts_dir else _default_artifacts_dir()
    feature_cols = list(metadata["feature_cols"])

    background_path = artifacts_dir / "classification_shap_background.npy"
    if background_path.exists():
        background_np = np.load(background_path).astype(np.float32)
    else:
        background_np = np.repeat(seq_scaled[None, ...], repeats=10, axis=0).astype(np.float32)

    wrapped_model = SequentialWrapper(model).eval()

    background = torch.tensor(background_np, dtype=torch.float32)
    sample = torch.tensor(seq_scaled[None, ...], dtype=torch.float32)

    explainer = shap.GradientExplainer(wrapped_model, background)
    shap_vals = explainer.shap_values(sample)

    if isinstance(shap_vals, list):
        shap_vals = shap_vals[0]

    shap_vals = np.array(shap_vals)

    if shap_vals.ndim == 4 and shap_vals.shape[-1] == 1:
        shap_vals = shap_vals[..., 0]

    # Shape for one sample: (max_seq_len, num_features)
    event_shap = shap_vals[0]
    feature_importance = np.mean(np.abs(event_shap), axis=0)

    order = np.argsort(feature_importance)[::-1]
    top = []
    for idx in order[: int(max_display)]:
        top.append(
            {
                "feature": feature_cols[int(idx)],
                "mean_abs_shap": float(feature_importance[int(idx)]),
                "signed_mean_shap": float(np.mean(event_shap[:, int(idx)])),
            }
        )

    return {
        "method": "shap_gradient_explainer",
        "max_display": int(max_display),
        "background_source": "classification_shap_background.npy"
        if background_path.exists()
        else "current_event_fallback",
        "top_features": top,
    }


def classify_event(
    df_event: pd.DataFrame,
    artifacts_dir: str | Path | None = None,
    mc_passes: int = 50,
    include_shap: bool = False,
    shap_max_display: int = 20,
):
    model, scaler, metadata = load_classification_model(artifacts_dir)

    seq, mask, processed_df_event, target_row = prepare_single_event_for_classification(
        df_event,
        metadata,
    )

    seq_scaled = _scale_sequence(seq, mask, scaler)

    x = torch.tensor(seq_scaled[None, ...], dtype=torch.float32)
    m = torch.tensor(mask[None, ...], dtype=torch.bool)

    mean_p, std_p, mc_samples = _mc_dropout_predict(
        model=model,
        x=x,
        mask=m,
        mc_passes=mc_passes,
    )

    threshold = float(metadata.get("decision_threshold", 0.5))
    risk_level = "High" if mean_p >= threshold else "Low"
    confidence = float(max(mean_p, 1.0 - mean_p))
    recommended_decision = "Maneuver" if risk_level == "High" else "Wait"

    target_cp = target_row.get("collision_probability")
    try:
        target_cp = float(target_cp) if target_cp is not None else None
    except Exception:
        target_cp = None

    target_true_label = None
    if target_cp is not None and not math.isnan(target_cp):
        target_true_label = int(target_cp >= DEFAULT_RISK_THRESHOLD)

    target_cdm_id = None
    if "id" in target_row and pd.notna(target_row["id"]):
        target_cdm_id = str(target_row["id"])

    first_creation = processed_df_event.iloc[0].get("creation_date")
    last_creation = processed_df_event.iloc[-1].get("creation_date")

    result = {
        "risk_level": risk_level,
        "classification_probability": float(mean_p),
        "confidence_score": float(confidence),
        "uncertainty_std": float(std_p),
        "decision_threshold": float(threshold),
        "recommended_decision": recommended_decision,
        "input_cdm_count": int(len(processed_df_event)),
        "first_input_creation_date": first_creation.isoformat() if pd.notna(first_creation) else None,
        "last_input_creation_date": last_creation.isoformat() if pd.notna(last_creation) else None,
        "target_actual_cdm_id": target_cdm_id,
        "target_true_label_if_known": target_true_label,
        "mc_dropout": {
            "enabled": True,
            "passes": int(mc_passes),
            "samples": mc_samples,
        },
        "preprocessing_summary": processed_df_event.attrs.get("preprocessing_summary", {}),
        "model_metadata": {
            "max_seq_len": int(metadata.get("max_seq_len", 8)),
            "feature_cols": list(metadata["feature_cols"]),
            "feature_count": int(len(metadata["feature_cols"])),
            "decision_threshold": threshold,
        },
    }

    if include_shap:
        result["shap_output"] = explain_with_shap(
            model=model,
            seq_scaled=seq_scaled,
            metadata=metadata,
            artifacts_dir=artifacts_dir,
            max_display=shap_max_display,
        )

    return result


def classify_actual_event(
    event_data: Any,
    artifacts_dir: str | Path | None = None,
    mc_passes: int = 50,
    include_shap: bool = False,
    shap_max_display: int = 20,
):
    df_event = _to_dataframe(event_data)
    return classify_event(
        df_event=df_event,
        artifacts_dir=artifacts_dir,
        mc_passes=mc_passes,
        include_shap=include_shap,
        shap_max_display=shap_max_display,
    )


def classify_predicted_event(
    event_data_with_predicted_last_row: Any,
    artifacts_dir: str | Path | None = None,
    mc_passes: int = 50,
    include_shap: bool = False,
    shap_max_display: int = 20,
):
    """
    For Path 3:
    input should be [actual CDM history + predicted P6 as the last row].
    The model will classify the last row, which is P6.
    """
    df_event = _to_dataframe(event_data_with_predicted_last_row)
    return classify_event(
        df_event=df_event,
        artifacts_dir=artifacts_dir,
        mc_passes=mc_passes,
        include_shap=include_shap,
        shap_max_display=shap_max_display,
    )
