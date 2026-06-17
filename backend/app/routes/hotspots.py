"""Hotspot API routes."""
from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("")
def list_hotspots(request: Request, top_n: int = Query(50, ge=1, le=200)):
    return request.app.state.hotspot_service.get_hotspots(top_n)


@router.get("/heatmap")
def heatmap_data(request: Request, sample_n: int = Query(30000, ge=1000)):
    return request.app.state.hotspot_service.get_heatmap(sample_n)


@router.get("/schedule")
def enforcement_schedule(request: Request, n_zones: int = Query(8, ge=1, le=30)):
    return request.app.state.hotspot_service.get_schedule(n_zones)


@router.get("/summary")
def summary(request: Request):
    return request.app.state.hotspot_service.get_summary()
