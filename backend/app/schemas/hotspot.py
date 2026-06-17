"""Pydantic schemas for hotspot-related endpoints."""
from pydantic import BaseModel
from typing import Optional


class HotspotOut(BaseModel):
    rank: int
    lat: float
    lon: float
    violations: int
    peak_pct: float
    avg_severity: float
    CCS: float
    CCS_category: str
    archetype: str
    top_junction: str
    top_police: str
    top_vtype: str
    main_road: float
    at_junc: float
    total_roi_inr: int
    deploy_window: Optional[str] = None


class HeatmapPoint(BaseModel):
    lat: float
    lon: float
    weight: float = 1.0


class ScheduleRow(BaseModel):
    rank: int
    top_junction: str
    archetype: str
    CCS: float
    CCS_category: str
    priority: str
    deploy_window: str
    violations: int
    peak_pct: float
    total_roi_inr: int
    top_police: str
