"""Prediction API routes."""
from fastapi import APIRouter, Request, HTTPException
from app.schemas.prediction import PredictionRequest

router = APIRouter()


@router.post("/predict")
def predict(request: Request, body: PredictionRequest):
    svc = request.app.state.prediction_service
    if not svc.is_ready():
        raise HTTPException(503, "Model not trained yet. Run: cd model/src && python train.py")
    result = svc.predict(body.model_dump())
    return result


@router.get("/model-metrics")
def model_metrics(request: Request):
    svc = request.app.state.prediction_service
    metrics = svc.get_metrics()
    if metrics is None:
        raise HTTPException(503, "Model metrics not available")
    return metrics


@router.get("/forecast")
def forecast(request: Request):
    hs = request.app.state.hotspot_service
    ans = request.app.state.analytics_service
    return ans.get_forecast(hs.clusters)


@router.post("/reload")
def reload_model(request: Request):
    """Reload the trained model from disk after retraining."""
    svc = request.app.state.prediction_service
    svc.reload()
    return {"status": "reloaded", "ready": svc.is_ready()}
