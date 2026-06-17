"""
ParkIQ – Prediction Module
Loads trained model artefacts and exposes a predict() interface.
"""
import os
import numpy as np
import joblib

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

FEATURE_COLS = [
    "violation_count", "peak_pct", "avg_severity", "max_severity",
    "avg_veh_weight", "main_road_pct", "junction_pct", "weekend_pct",
    "unique_hours", "n_violations_avg", "unique_vehicle_types",
    "temporal_entropy",
]


class HotspotPredictor:
    """Wraps the trained model + scaler + encoder for inference."""

    def __init__(self, model_dir: str = MODEL_DIR):
        self.model  = joblib.load(os.path.join(model_dir, "hotspot_model.pkl"))
        self.scaler = joblib.load(os.path.join(model_dir, "scaler.pkl"))
        self.le     = joblib.load(os.path.join(model_dir, "label_encoder.pkl"))
        self.feature_cols = FEATURE_COLS

    def predict(self, features: dict) -> dict:
        """
        Predict CCS category + class probabilities.

        Parameters
        ----------
        features : dict
            Keys must be a subset of FEATURE_COLS.  Missing keys default to 0.

        Returns
        -------
        dict with keys: category, probabilities, confidence
        """
        X = np.array([[features.get(col, 0) for col in self.feature_cols]])
        X_scaled = self.scaler.transform(X)

        pred_enc = self.model.predict(X_scaled)[0]
        probas   = self.model.predict_proba(X_scaled)[0]

        category = self.le.inverse_transform([pred_enc])[0]
        
        prob_dict = {
            self.le.inverse_transform([cls])[0]: round(float(p), 4)
            for cls, p in zip(self.model.classes_, probas)
        }
        for cat in self.le.classes_:
            if cat not in prob_dict:
                prob_dict[cat] = 0.0

        return {
            "category": category,
            "probabilities": prob_dict,
            "confidence": round(float(probas.max()), 4),
        }

    def predict_batch(self, rows: list[dict]) -> list[dict]:
        """Vectorised prediction for a list of feature dicts."""
        return [self.predict(r) for r in rows]


# ── CLI smoke test ─────────────────────────────────────────────
if __name__ == "__main__":
    predictor = HotspotPredictor()
    sample = {
        "violation_count": 50,
        "peak_pct": 0.6,
        "avg_severity": 4.0,
        "max_severity": 6.0,
        "avg_veh_weight": 3.0,
        "main_road_pct": 0.4,
        "junction_pct": 0.5,
        "weekend_pct": 0.3,
        "unique_hours": 12,
        "n_violations_avg": 2.0,
        "unique_vehicle_types": 6,
        "temporal_entropy": 3.2,
    }
    result = predictor.predict(sample)
    print("Sample prediction:", result)
