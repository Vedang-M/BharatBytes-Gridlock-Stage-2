"""
PredictionService – wraps the trained ML model for the backend.
"""
import os
import json
import sys
from dotenv import load_dotenv

load_dotenv()

MODEL_DIR = os.getenv(
    "MODEL_DIR",
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "model", "saved_models")
    ),
)

# Add model/src to path so we can import the predictor
sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "model", "src")
    ),
)


class PredictionService:
    """Thin facade over the trained HotspotPredictor."""

    def __init__(self):
        self.predictor = None
        self.metrics: dict | None = None
        self._load()

    def _load(self):
        try:
            from predict import HotspotPredictor
            self.predictor = HotspotPredictor(model_dir=MODEL_DIR)
            metrics_path = os.path.join(MODEL_DIR, "model_metrics.json")
            if os.path.exists(metrics_path):
                with open(metrics_path) as f:
                    self.metrics = json.load(f)
            print("[PredictionService] Model loaded successfully")
        except Exception as e:
            print(f"[PredictionService] Model not available: {e}")
            print("  -> Run  cd model/src && python train.py  first")

    def predict(self, features: dict) -> dict | None:
        if self.predictor is None:
            return None
        return self.predictor.predict(features)

    def get_metrics(self) -> dict | None:
        return self.metrics

    def is_ready(self) -> bool:
        return self.predictor is not None
