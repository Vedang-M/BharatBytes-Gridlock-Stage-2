"""
routers/insights.py

Exposes:
    POST /api/insights/generate

Takes the same analytics payload your frontend already assembles for the
PDF report (summary, hotspots, forecast, violations, vehicles, schedule)
and returns plain-English, decision-maker-friendly explanations of each
section, written by Gemini.

Design choices:
    - ONE Gemini call per report generation (not 5+), to keep latency and
      cost down. We ask Gemini to return a single JSON object containing
      all the narrative blocks we need.
    - The prompt explicitly asks for "common man" language: no jargon,
      no statistics-speak, just what it means and what to do about it.
    - If Gemini or the API key is unavailable, we return graceful
      fallback text per-section instead of failing the whole request,
      so the PDF can still be generated (just without AI commentary).
"""

import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.routes.geminiClient import generate_json

logger = logging.getLogger("parkiq.routers.insights")

router = APIRouter()


# ── Request schema ───────────────────────────────────────────────────
# Kept intentionally loose (Dict[str, Any] / List[Dict[str, Any]]) because
# the frontend already has these objects shaped a particular way from
# backendApi.js, and we don't want two sources of truth to keep in sync
# every time a field is added on the frontend.

class InsightsRequest(BaseModel):
    summary: Optional[Dict[str, Any]] = None
    hotspots: Optional[List[Dict[str, Any]]] = None
    schedule: Optional[List[Dict[str, Any]]] = None
    forecast: Optional[List[Dict[str, Any]]] = None
    violations: Optional[List[Dict[str, Any]]] = None
    vehicles: Optional[List[Dict[str, Any]]] = None


class InsightsResponse(BaseModel):
    executive_summary: str
    metrics_insight: str
    hotspot_insight: str
    schedule_insight: str
    forecast_insight: str
    violation_insight: str
    vehicle_insight: str
    source: str  # "gemini" or "fallback"


# ── Fallback text (used if Gemini call fails for any reason) ───────────

FALLBACK = {
    "executive_summary": "AI-generated summary is currently unavailable. The data tables below reflect the latest enforcement analytics.",
    "metrics_insight": "AI commentary unavailable for this section.",
    "hotspot_insight": "AI commentary unavailable for this section.",
    "schedule_insight": "AI commentary unavailable for this section.",
    "forecast_insight": "AI commentary unavailable for this section.",
    "violation_insight": "AI commentary unavailable for this section.",
    "vehicle_insight": "AI commentary unavailable for this section.",
}


def _trim(items: Optional[List[Dict[str, Any]]], n: int) -> List[Dict[str, Any]]:
    if not items:
        return []
    return items[:n]


def _build_prompt(payload: InsightsRequest) -> str:
    """
    Builds a single prompt covering every section, asking Gemini to
    return one JSON object with all narrative blocks at once.
    """
    summary = payload.summary or {}
    hotspots = _trim(payload.hotspots, 10)
    schedule = _trim(payload.schedule, 10)
    forecast = _trim(payload.forecast, 7)
    violations = _trim(payload.violations, 15)
    vehicles = payload.vehicles or []

    return f"""
You are a traffic-enforcement data analyst writing for senior police
officials who are NOT data scientists. Explain the data in plain,
confident, common-man language. No jargon like "percentile", "cluster
density", or "model output" — describe what the numbers mean in
practice and, where relevant, what action they suggest.

Return ONLY a valid JSON object.

Keep responses concise:

- executive_summary: maximum 4 sentences
- metrics_insight: 1-2 sentences
- hotspot_insight: 1-2 sentences
- schedule_insight: 1-2 sentences
- forecast_insight: 1-2 sentences
- violation_insight: 1-2 sentences
- vehicle_insight: 1-2 sentences

Do not use markdown.
Do not wrap JSON in code fences.
Return only JSON.

- executive_summary: A top-level overview combining all sections below,
  written as if briefing a Police Commissioner in 30 seconds.
- metrics_insight: Explain what the key metrics mean overall.
- hotspot_insight: Explain what the top critical zones tell us and why
  they matter.
- schedule_insight: Explain the logic and benefit of the deployment
  schedule.
- forecast_insight: Explain what the 7-day forecast predicts and how
  to prepare.
- violation_insight: Explain what the violation type breakdown reveals
  about driver behaviour.
- vehicle_insight: Explain what the vehicle type distribution implies
  for enforcement focus.

If a data section below is empty, write a short, honest one-sentence
note saying that section had no data, instead of inventing numbers.
Never fabricate specific figures that are not present in the data.

DATA:

Key Metrics:
{summary}

Top Critical Zones (hotspots):
{hotspots}

Deployment Schedule:
{schedule}

7-Day Forecast:
{forecast}

Violation Type Breakdown:
{violations}

Vehicle Type Distribution:
{vehicles}
""".strip()


@router.post("/generate", response_model=InsightsResponse)
async def generate_insights(payload: InsightsRequest) -> InsightsResponse:
    """
    Generates plain-English insight blocks for each section of the
    ParkIQ dashboard report, using Gemini. Falls back gracefully if
    Gemini is unavailable so PDF generation is never blocked.
    """
    prompt = _build_prompt(payload)

    try:
        result = generate_json(prompt, max_output_tokens=4096)

        # Validate all expected keys are present; fill any gaps with
        # fallback text rather than failing the whole response.
        merged = {**FALLBACK, **{k: v for k, v in result.items() if v}}
        merged["source"] = "gemini"
        return InsightsResponse(**merged)

    except Exception as exc:
        logger.exception("Gemini insight generation failed, using fallback text")
        return InsightsResponse(**FALLBACK, source="fallback")