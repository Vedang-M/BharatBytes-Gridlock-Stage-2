"""Pydantic schemas for prediction endpoints."""
from pydantic import BaseModel
from typing import Dict, Optional


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


class PredictionResponse(BaseModel):
    category: str
    probabilities: Dict[str, float]
    confidence: float


class ForecastDay(BaseModel):
    date: str
    day: str
    risk: str
    peak_hours: str
    top_zone: str
    CCS: float


class ModelMetrics(BaseModel):
    model_name: str
    accuracy: float
    precision_weighted: float
    recall_weighted: float
    f1_weighted: float
    cohen_kappa: float
    cv_f1_score: float
    confusion_matrix: list
    categories: list
    per_class_metrics: dict
    feature_importance: dict
    train_size: int
    test_size: int
    n_features: int
    feature_names: list
