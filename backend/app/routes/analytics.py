"""Analytics API routes."""
from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/temporal")
def temporal(request: Request):
    svc = request.app.state.analytics_service
    return {
        "hourly": svc.get_hourly(),
        "daily": svc.get_daily(),
        "monthly": svc.get_monthly(),
    }


@router.get("/heatmap")
def temporal_heatmap(request: Request):
    return request.app.state.analytics_service.get_heatmap_data()


@router.get("/trend")
def daily_trend(request: Request):
    return request.app.state.analytics_service.get_daily_trend()


@router.get("/violations")
def violation_types(request: Request):
    return request.app.state.analytics_service.get_violation_types()


@router.get("/vehicles")
def vehicle_types(request: Request):
    return request.app.state.analytics_service.get_vehicle_types()


@router.get("/roi")
def roi_calc(
    request: Request,
    vot: int = Query(95),
    vph: int = Query(900),
    delay: float = Query(2.5),
    fuel: float = Query(4.5),
    sessions: int = Query(2),
    session_hr: int = Query(2),
    top_n: int = Query(20),
):
    hs = request.app.state.hotspot_service
    svc = request.app.state.analytics_service
    return svc.compute_roi(
        hs.clusters,
        vot=vot, vph=vph, delay=delay, fuel=fuel,
        sessions=sessions, session_hr=session_hr, top_n=top_n,
    )


@router.get("/what-if")
def what_if_simulation(
    request: Request,
    lat_min: float = Query(..., description="Bounding box south latitude"),
    lat_max: float = Query(..., description="Bounding box north latitude"),
    lon_min: float = Query(..., description="Bounding box west longitude"),
    lon_max: float = Query(..., description="Bounding box east longitude"),
    clearance_pct: float = Query(100.0, ge=0.0, le=100.0, description="% of violations to clear (0–100)"),
):
    """
    Simulate the congestion impact if illegal parking is cleared
    inside the user-drawn bounding box.

    Query params:
      lat_min, lat_max, lon_min, lon_max  – bounding box corners
      clearance_pct                        – how much of the parking to clear (default 100%)

    Returns before/after CCS, traffic flow improvement %,
    savings in INR, violation breakdown, and affected clusters.
    """
    svc = request.app.state.analytics_service
    hs  = request.app.state.hotspot_service

    result = svc.simulate_whatif(
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max,
        clearance_pct=clearance_pct,
        clusters=hs.clusters,
    )
    return result
