"""Pydantic schemas for prediction and what-if endpoints."""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any


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


# ── What-If Schemas ────────────────────────────────────────────

class WhatIfRequest(BaseModel):
    """
    Bounding box of the user-drawn zone on the map.
    clearance_pct: how much of the parking violations to simulate clearing (0–100%).
    """
    lat_min: float = Field(..., description="South boundary latitude")
    lat_max: float = Field(..., description="North boundary latitude")
    lon_min: float = Field(..., description="West boundary longitude")
    lon_max: float = Field(..., description="East boundary longitude")
    clearance_pct: float = Field(
        100.0, ge=0.0, le=100.0,
        description="Percentage of violations assumed cleared (0–100)"
    )


class BeforeAfterMetrics(BaseModel):
    violations: int
    peak_pct: float
    ccs: float
    ccs_category: str


class WhatIfImpact(BaseModel):
    violations_cleared: int
    ccs_reduction: float
    ccs_reduction_pct: float
    flow_improvement_pct: float
    delay_saved_min: float
    total_savings_inr: int
    roi_vot_saved: int
    roi_fuel_saved: int


class ClearedViolationType(BaseModel):
    type: str
    count: int
    cleared: int


class AffectedCluster(BaseModel):
    name: str
    ccs: float
    category: str
    violations: int


class WhatIfResponse(BaseModel):
    zone_bounds: Dict[str, float]
    clearance_pct: float
    before: Dict[str, Any]
    after: Dict[str, Any]
    impact: WhatIfImpact
    cleared_by_type: List[ClearedViolationType]
    peak_hours: List[Dict[str, Any]]
    vehicle_mix: List[Dict[str, Any]]
    affected_clusters: List[AffectedCluster]
