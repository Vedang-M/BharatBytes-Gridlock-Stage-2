"""
ParkIQ – Backend API Server  (port 8000)
FastAPI application with CORS, lifespan events, and mounted routers.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# FIXED: added `insights` to this import line.
from app.routes import hotspots, predictions, analytics, assistant, insights  # noqa: E402
from app.services.hotspot_service import HotspotService  # noqa: E402
from app.services.prediction_service import PredictionService  # noqa: E402
from app.services.analytics_service import AnalyticsService  # noqa: E402


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Load heavy resources once at startup."""
    print("Starting ParkIQ Backend ...")
    hs = HotspotService()
    application.state.hotspot_service = hs
    application.state.prediction_service = PredictionService()
    application.state.analytics_service = AnalyticsService(hs.df_clust)
    print("All services ready")
    yield
    print("Shutting down")


app = FastAPI(
    title="ParkIQ Backend API",
    version="1.0.0",
    description="Parking-Induced Congestion Intelligence – Bengaluru Traffic Police",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hotspots.router, prefix="/api/hotspots", tags=["Hotspots"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["Predictions"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["Assistant"])

# FIXED: this line was completely missing, which is why every call to
# /api/insights/generate returned 404 and the frontend silently fell
# back to "AI commentary unavailable" text.
app.include_router(insights.router, prefix="/api/insights", tags=["Insights"])


@app.get("/")
def root():
    return {
        "app": "ParkIQ Backend",
        "version": "1.0.0",
        "docs": "/docs",
    }


# ── Direct run: python -m app.main ─────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )