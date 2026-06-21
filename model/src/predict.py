"""
ParkIQ – Prediction Module
Loads trained model artefacts and exposes a predict() interface.
"""
import os
import json
import numpy as np
import pandas as pd
import joblib

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

from feature_engineering import FEATURE_COLS


class HotspotPredictor:
    """Wraps the trained model + scaler + encoder for inference."""

    def __init__(self, model_dir: str = MODEL_DIR):
        self.model  = joblib.load(os.path.join(model_dir, "hotspot_model.pkl"))
        
        scaler_path = os.path.join(model_dir, "scaler.pkl")
        self.scaler = joblib.load(scaler_path) if os.path.exists(scaler_path) else None
        
        self.le     = joblib.load(os.path.join(model_dir, "label_encoder.pkl"))
        
        with open(os.path.join(model_dir, "model_metrics.json"), "r") as f:
            self.metrics = json.load(f)
            
        self.feature_cols = self.metrics.get("feature_names", FEATURE_COLS)
            
        self.is_regressor = "Regressor" in self.metrics["model_name"]
        self.bins = self.metrics.get("bins", [])

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
        X_scaled = self.scaler.transform(X) if self.scaler else X

        if self.is_regressor:
            score = self.model.predict(X_scaled)[0]
            # Categorize using the saved bins
            categories = ["LOW", "MODERATE", "HIGH", "CRITICAL"]
            actual_categories = categories[-len(self.bins)+1:] if len(self.bins) - 1 < len(categories) else categories
            cat = pd.cut([score], bins=self.bins, labels=actual_categories, include_lowest=True)[0]
            if pd.isna(cat):
                cat = "LOW" # fallback
            
            # Simulated probabilities for regressor
            prob_dict = {c: 0.0 for c in categories}
            prob_dict[cat] = 1.0
            
            return {
                "category": str(cat),
                "probabilities": prob_dict,
                "confidence": 1.0,
                "ccs_score": round(float(score), 2)
            }
        else:
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

    def predict_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """Vectorised prediction for a DataFrame."""
        X_df = df.reindex(columns=self.feature_cols, fill_value=0)
        X_scaled = self.scaler.transform(X_df.values) if self.scaler else X_df.values

        if self.is_regressor:
            scores = self.model.predict(X_scaled)
            categories = ["LOW", "MODERATE", "HIGH", "CRITICAL"]
            actual_categories = categories[-len(self.bins)+1:] if len(self.bins) - 1 < len(categories) else categories
            cats = pd.cut(scores, bins=self.bins, labels=actual_categories, include_lowest=True)
            if isinstance(cats, pd.Series):
                cats = cats.fillna("LOW")
            else:
                cats = [c if pd.notna(c) else "LOW" for c in cats]
            
            return pd.DataFrame({
                "category": cats,
                "confidence": 1.0,
                "ccs_score": np.round(scores, 2)
            })
        else:
            pred_enc = self.model.predict(X_scaled)
            probas = self.model.predict_proba(X_scaled)
            categories = self.le.inverse_transform(pred_enc)
            confidences = probas.max(axis=1)

            return pd.DataFrame({
                "category": categories,
                "confidence": np.round(confidences, 4)
            })


# ── CLI smoke test ─────────────────────────────────────────────
if __name__ == "__main__":
    predictor = HotspotPredictor()
    sample = {
        "weekend_pct": 0.3,
        "unique_hours": 12,
        "n_violations_avg": 2.0,
        "unique_vehicle_types": 6,
        "temporal_entropy": 3.2,
        "lat_center": 12.95,
        "lon_center": 77.59
    }
    result = predictor.predict(sample)
    print("Sample prediction:", result)
