"""
ParkIQ – Standalone Model API  (port 8001)
Thin FastAPI wrapper around the trained predictor.
"""
import os
import sys
import json
import importlib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Resolve paths ──────────────────────────────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SRC_DIR = os.path.normpath(os.path.join(_THIS_DIR, "..", "src"))
PROJECT_ROOT = os.path.normpath(os.path.join(_THIS_DIR, "..", ".."))
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

# ── Dynamic import (avoids IDE red-line on bare `from predict`) ─
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)
_predict_mod = importlib.import_module("predict")
HotspotPredictor = _predict_mod.HotspotPredictor

app = FastAPI(title="ParkIQ Model API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = None
model_metrics = None


@app.on_event("startup")
def _load():
    global predictor, model_metrics
    try:
        predictor = HotspotPredictor()
        metrics_path = os.path.join(MODEL_DIR, "model_metrics.json")
        if os.path.exists(metrics_path):
            with open(metrics_path) as f:
                model_metrics = json.load(f)
        print("Model API ready on :8001")
    except Exception as e:
        print(f"Model not loaded: {e}. Run model training first.")


# ── Request schema ─────────────────────────────────────────────
class PredictionRequest(BaseModel):
    violation_count: float = 10
    peak_pct: float = 0.5
    avg_severity: float = 3.0
    max_severity: float = 5.0
    avg_veh_weight: float = 2.5
    main_road_pct: float = 0.3
    junction_pct: float = 0.4
    weekend_pct: float = 0.3
    unique_hours: float = 8
    n_violations_avg: float = 1.5
    unique_vehicle_types: float = 5
    temporal_entropy: float = 3.0


@app.post("/predict")
def predict(req: PredictionRequest):
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not trained yet")
    return predictor.predict(req.model_dump())


@app.get("/metrics")
def get_metrics():
    return model_metrics or {}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": predictor is not None}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
