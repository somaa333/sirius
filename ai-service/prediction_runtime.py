"""
SIRIUS prediction runtime.

This module loads the trained Transformer Encoder forecasting artifacts and predicts the
next unseen CDM (P6) from an actual event sequence (CDM1..CDM5). It also provides an
optional helper for Path 3: append the predicted CDM to the actual sequence and classify
that predicted last CDM using classification_runtime.

Expected artifacts folder:
    forecasting_artifacts/
        forecasting_model.pth
        forecasting_scaler.pkl
        forecasting_metadata.json
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Callable

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

DEFAULT_MC_PASSES = 50
DEFAULT_PREDICTED_CREATION_OFFSET_DAYS = 1.0

# Features that should not be negative in a physical CDM context.
# This is a post-processing safety correction only; the raw model output is also returned.
NON_NEGATIVE_FEATURES = {
    "miss_distance",
    "relative_speed",
    "time_to_tca",
    "object1_hbr",
    "object2_hbr",
    "object1_cr_r",
    "object1_ct_t",
    "object1_cn_n",
    "object2_cr_r",
    "object2_ct_t",
    "object2_cn_n",
}


class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 50):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float32).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.pe[:, : x.size(1), :]


class MultiHeadSelfAttention(nn.Module):
    def __init__(self, d_model: int, nhead: int, dropout: float = 0.2):
        super().__init__()
        if d_model % nhead != 0:
            raise ValueError("d_model must be divisible by nhead.")
        self.nhead = nhead
        self.head_dim = d_model // nhead
        self.qkv_proj = nn.Linear(d_model, 3 * d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        x: torch.Tensor,
        causal_mask: torch.Tensor | None = None,
        padding_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        batch_size, seq_len, dim = x.shape
        qkv = self.qkv_proj(x).reshape(batch_size, seq_len, 3, self.nhead, self.head_dim)
        qkv = qkv.permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]

        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.head_dim)
        neg_inf = torch.finfo(scores.dtype).min

        if causal_mask is not None:
            scores = scores.masked_fill(causal_mask[None, None, :, :], neg_inf)
        if padding_mask is not None:
            scores = scores.masked_fill(padding_mask[:, None, None, :], neg_inf)

        attn = torch.softmax(scores, dim=-1)
        attn = self.dropout(attn)
        out = attn @ v
        out = out.transpose(1, 2).reshape(batch_size, seq_len, dim)
        return self.out_proj(out)


class FeedForward(nn.Module):
    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, 4 * d_model),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(4 * d_model, d_model),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class CustomEncoderLayer(nn.Module):
    def __init__(self, d_model: int, nhead: int, dropout: float = 0.2):
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.mha = MultiHeadSelfAttention(d_model, nhead, dropout)
        self.ffn = FeedForward(d_model, dropout)
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        x: torch.Tensor,
        causal_mask: torch.Tensor | None = None,
        padding_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        x_norm = self.norm1(x)
        x = x + self.dropout(self.mha(x_norm, causal_mask, padding_mask))
        x_norm = self.norm2(x)
        x = x + self.dropout(self.ffn(x_norm))
        return x


class CustomTransformerEncoder(nn.Module):
    def __init__(self, num_layers: int, d_model: int, nhead: int, dropout: float = 0.2):
        super().__init__()
        self.layers = nn.ModuleList(
            [CustomEncoderLayer(d_model, nhead, dropout) for _ in range(num_layers)]
        )

    def forward(
        self,
        x: torch.Tensor,
        causal_mask: torch.Tensor | None = None,
        padding_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        for layer in self.layers:
            x = layer(x, causal_mask=causal_mask, padding_mask=padding_mask)
        return x


class CDMTransformerCustom(nn.Module):
    def __init__(
        self,
        feature_size: int,
        d_model: int = 128,
        nhead: int = 4,
        num_layers: int = 2,
        dropout: float = 0.2,
        max_seq_len: int = 8,
    ):
        super().__init__()
        self.d_model = d_model
        self.input_fc = nn.Linear(feature_size, d_model)
        self.pos_encoder = PositionalEncoding(d_model, max_seq_len)
        self.dropout = nn.Dropout(dropout)
        self.encoder = CustomTransformerEncoder(num_layers, d_model, nhead, dropout)
        self.output_fc = nn.Linear(d_model, feature_size)

    def forward(self, src: torch.Tensor, padding_mask: torch.Tensor | None = None) -> torch.Tensor:
        _, seq_len, _ = src.shape
        causal_mask = torch.triu(
            torch.ones(seq_len, seq_len, dtype=torch.bool, device=src.device), diagonal=1
        )
        x = self.input_fc(src) * math.sqrt(self.d_model)
        x = self.pos_encoder(x)
        x = self.dropout(x)
        x = self.encoder(x, causal_mask=causal_mask, padding_mask=padding_mask)
        return self.output_fc(x)


def _default_artifacts_dir() -> Path:
    return Path(__file__).resolve().parent / "forecasting_artifacts"


def load_prediction_model(artifacts_dir: str | Path | None = None):
    artifacts_dir = Path(artifacts_dir) if artifacts_dir else _default_artifacts_dir()

    metadata = json.loads((artifacts_dir / "forecasting_metadata.json").read_text())
    scaler = joblib.load(artifacts_dir / "forecasting_scaler.pkl")

    feature_cols = list(metadata["feature_cols"])
    params = metadata["model_params"]

    model = CDMTransformerCustom(
        feature_size=len(feature_cols),
        d_model=int(params.get("d_model", 128)),
        nhead=int(params.get("nhead", 4)),
        num_layers=int(params.get("num_layers", 2)),
        dropout=float(params.get("dropout", 0.2)),
        max_seq_len=int(metadata.get("max_seq_len", 8)),
    )
    state_dict = torch.load(artifacts_dir / "forecasting_model.pth", map_location="cpu")
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


def _json_safe(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if pd.isna(value):
        return None
    return value


def preprocess_event_for_prediction(df_event: pd.DataFrame, metadata: dict) -> pd.DataFrame:
    df = df_event.copy()
    feature_cols = list(metadata["feature_cols"])

    required_base = ["creation_date", "tca"]
    required_all = required_base + [c for c in feature_cols if c != "time_to_tca"]
    missing = [c for c in required_all if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns for prediction: {missing}")

    original_rows = len(df)
    df["creation_date"] = pd.to_datetime(df["creation_date"], errors="coerce", utc=True)
    df["tca"] = pd.to_datetime(df["tca"], errors="coerce", utc=True)

    numeric_cols = set(feature_cols)
    numeric_cols.discard("time_to_tca")
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=["creation_date", "tca"])
    df["time_to_tca"] = (df["tca"] - df["creation_date"]).dt.total_seconds() / 86400.0
    df = df.sort_values("creation_date").reset_index(drop=True)
    df = df.dropna(subset=feature_cols).reset_index(drop=True)

    min_input_cdms = int(metadata.get("min_input_cdms", 1))
    if len(df) < min_input_cdms:
        raise ValueError(
            f"The event must contain at least {min_input_cdms} valid CDM(s) for prediction. "
            f"Valid rows after preprocessing: {len(df)} / original rows: {original_rows}."
        )

    return df


def _build_prediction_input(
    df_seq: pd.DataFrame,
    feature_cols: list[str],
    scaler,
    max_seq_len: int,
):
    seq = df_seq[feature_cols].values.astype(np.float32)
    mask = np.zeros(max_seq_len, dtype=bool)

    if len(seq) > max_seq_len:
        seq = seq[-max_seq_len:]
    else:
        pad_len = max_seq_len - len(seq)
        seq = np.vstack([np.zeros((pad_len, len(feature_cols)), dtype=np.float32), seq])
        mask[:pad_len] = True

    seq_scaled = seq.copy()
    if np.any(~mask):
        seq_scaled[~mask] = scaler.transform(seq[~mask])

    x = torch.tensor(seq_scaled, dtype=torch.float32).unsqueeze(0)
    m = torch.tensor(mask, dtype=torch.bool).unsqueeze(0)
    return x, m, mask


def _postprocess_predicted_features(predicted_features: dict[str, float]) -> dict[str, float]:
    fixed = dict(predicted_features)
    for col in NON_NEGATIVE_FEATURES:
        if col in fixed and fixed[col] is not None:
            fixed[col] = max(0.0, float(fixed[col]))
    return fixed


def _build_predicted_row(
    mean_features: dict[str, float],
    df_seq: pd.DataFrame,
    creation_offset_days: float = DEFAULT_PREDICTED_CREATION_OFFSET_DAYS,
) -> dict[str, Any]:
    predicted_row = _postprocess_predicted_features(mean_features)

    last_creation = df_seq["creation_date"].iloc[-1]
    predicted_creation = last_creation + pd.Timedelta(days=float(creation_offset_days))

    time_to_tca = float(predicted_row.get("time_to_tca", 0.0) or 0.0)
    predicted_tca = predicted_creation + pd.to_timedelta(time_to_tca, unit="D")

    predicted_row["creation_date"] = predicted_creation
    predicted_row["tca"] = predicted_tca
    return predicted_row


def predict_next_cdm(
    event_data: Any,
    artifacts_dir: str | Path | None = None,
    mc_passes: int = DEFAULT_MC_PASSES,
    creation_offset_days: float = DEFAULT_PREDICTED_CREATION_OFFSET_DAYS,
    include_raw_samples: bool = False,
) -> dict[str, Any]:
    """
    Path 2: predict the next unseen CDM from the actual event sequence.

    Input:
        actual event sequence only, e.g. [CDM1, CDM2, CDM3, CDM4, CDM5]

    Output:
        predicted_row = P6, plus uncertainty metadata.
    """
    model, scaler, metadata = load_prediction_model(artifacts_dir)
    feature_cols = list(metadata["feature_cols"])
    max_seq_len = int(metadata.get("max_seq_len", 8))

    df_seq = preprocess_event_for_prediction(_to_dataframe(event_data), metadata)
    x, m, mask = _build_prediction_input(df_seq, feature_cols, scaler, max_seq_len)
    last_real_idx = int(np.where(~mask)[0][-1])

    model.train()  # MC Dropout ON
    preds = []
    with torch.no_grad():
        for _ in range(int(mc_passes)):
            pred_scaled = model(x, padding_mask=m)[0]
            pred_next_scaled = pred_scaled[last_real_idx].cpu().numpy().reshape(1, -1)
            pred_next = scaler.inverse_transform(pred_next_scaled)[0]
            preds.append(pred_next)

    preds_arr = np.array(preds, dtype=np.float32)
    mean_pred = preds_arr.mean(axis=0)
    std_pred = preds_arr.std(axis=0)
    var_pred = preds_arr.var(axis=0)

    raw_mean_features = {col: float(val) for col, val in zip(feature_cols, mean_pred)}
    predicted_row = _build_predicted_row(raw_mean_features, df_seq, creation_offset_days)

    feature_uncertainty_std = {col: float(val) for col, val in zip(feature_cols, std_pred)}
    feature_uncertainty_variance = {col: float(val) for col, val in zip(feature_cols, var_pred)}

    source_last_id = None
    if "id" in df_seq.columns and pd.notna(df_seq.iloc[-1].get("id")):
        source_last_id = str(df_seq.iloc[-1]["id"])

    result: dict[str, Any] = {
        "predicted_row": {k: _json_safe(v) for k, v in predicted_row.items()},
        "raw_predicted_features_before_postprocessing": raw_mean_features,
        "feature_uncertainty_std": feature_uncertainty_std,
        "feature_uncertainty_variance": feature_uncertainty_variance,
        "overall_uncertainty": float(std_pred.mean()),
        "input_cdm_count": int(len(df_seq)),
        "source_actual_event_last_cdm_id": source_last_id,
        "first_input_creation_date": _json_safe(df_seq["creation_date"].iloc[0]),
        "last_input_creation_date": _json_safe(df_seq["creation_date"].iloc[-1]),
        "mc_passes": int(mc_passes),
        "model_version": metadata.get("model_version", "forecasting-v1"),
        "feature_cols": feature_cols,
        "max_seq_len": max_seq_len,
        "preprocessing_summary": {
            "valid_input_rows": int(len(df_seq)),
            "used_rows_after_truncation": int(min(len(df_seq), max_seq_len)),
            "padded_rows": int(mask.sum()),
        },
    }

    if include_raw_samples:
        result["raw_mc_samples"] = preds_arr.tolist()

    return result


def build_predicted_classification_sequence(
    actual_event_data: Any,
    predicted_row: dict[str, Any],
) -> pd.DataFrame:
    """
    Path 3 preparation: append P6 to the actual CDM history so the classifier
    classifies the last row, which is the predicted CDM.
    """
    df_actual = _to_dataframe(actual_event_data)
    df_pred = pd.DataFrame([{**predicted_row, "source_type": "predicted"}])

    # Keep all original columns plus any forecast feature columns.
    combined = pd.concat([df_actual, df_pred], ignore_index=True, sort=False)
    combined["creation_date"] = pd.to_datetime(combined["creation_date"], errors="coerce", utc=True)
    combined = combined.sort_values("creation_date").reset_index(drop=True)
    return combined


def predict_then_classify_future_event(
    actual_event_data: Any,
    classify_fn: Callable[..., dict[str, Any]],
    prediction_artifacts_dir: str | Path | None = None,
    classification_artifacts_dir: str | Path | None = None,
    prediction_mc_passes: int = DEFAULT_MC_PASSES,
    classification_mc_passes: int = DEFAULT_MC_PASSES,
) -> dict[str, Any]:
    """
    Full Path 2 + Path 3 helper.

    `classify_fn` should be classification_runtime.classify_predicted_event or
    classification_runtime.classify_event, depending on your integration.
    """
    prediction_result = predict_next_cdm(
        actual_event_data,
        artifacts_dir=prediction_artifacts_dir,
        mc_passes=prediction_mc_passes,
    )
    sequence_with_prediction = build_predicted_classification_sequence(
        actual_event_data,
        prediction_result["predicted_row"],
    )

    classification_result = classify_fn(
        sequence_with_prediction,
        artifacts_dir=classification_artifacts_dir,
        mc_passes=classification_mc_passes,
    )

    return {
        "prediction": prediction_result,
        "classification": classification_result,
        "sequence_with_prediction_count": int(len(sequence_with_prediction)),
    }
