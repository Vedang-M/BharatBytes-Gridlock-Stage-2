"""Question-answering API routes using model data."""
import difflib
import re
from datetime import datetime, date as dt_date
from typing import List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class QARequest(BaseModel):
    location: str
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    date: Optional[str] = None  # YYYY-MM-DD


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", str(value or "").strip().lower())


def parse_hour(value: str) -> int:
    if not value or not isinstance(value, str):
        raise ValueError("Invalid time")
    parts = re.split(r"[:.\s]+", value.strip())
    if not parts or not parts[0].isdigit():
        raise ValueError("Invalid time")
    hour = int(parts[0])
    if hour < 0 or hour > 23:
        raise ValueError("Invalid hour")
    return hour


def parse_date(value: Optional[str]) -> Optional[dt_date]:
    if value is None:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def similarity_score(a: str, b: str) -> float:
    a = normalize_text(a)
    b = normalize_text(b)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def best_cluster_matches(query: str, clusters):
    query_norm = normalize_text(query)
    if not query_norm:
        return clusters.iloc[0:0], ""

    exact = clusters[
        clusters["top_junction"].str.contains(query, case=False, na=False)
        | clusters["top_police"].str.contains(query, case=False, na=False)
    ]
    if not exact.empty:
        return exact, query

    tokens = [t for t in query_norm.split() if len(t) > 1]
    if tokens:
        cond = False
        for token in tokens:
            cond = cond | clusters["top_junction"].str.contains(token, case=False, na=False)
            cond = cond | clusters["top_police"].str.contains(token, case=False, na=False)
        token_matches = clusters[cond]
        if not token_matches.empty:
            return token_matches, " ".join(tokens)

    candidates = []
    for field in ["top_junction", "top_police"]:
        candidates.extend(clusters[field].dropna().astype(str).unique().tolist())
    candidates = list(dict.fromkeys(candidates))

    scores = [(candidate, similarity_score(query_norm, candidate)) for candidate in candidates]
    scores = [item for item in scores if item[1] >= 0.35]
    if scores:
        best_candidate = max(scores, key=lambda item: item[1])[0]
        fuzzy_matches = clusters[
            clusters["top_junction"].str.contains(best_candidate, case=False, na=False)
            | clusters["top_police"].str.contains(best_candidate, case=False, na=False)
        ]
        return fuzzy_matches, best_candidate

    close = difflib.get_close_matches(query_norm, candidates, n=1, cutoff=0.4)
    if close:
        close_matches = clusters[
            clusters["top_junction"].str.contains(close[0], case=False, na=False)
            | clusters["top_police"].str.contains(close[0], case=False, na=False)
        ]
        return close_matches, close[0]

    return clusters.iloc[0:0], ""


def format_hours(start_hour: int, end_hour: int) -> List[int]:
    if start_hour == end_hour:
        return [start_hour]
    if start_hour < end_hour:
        return list(range(start_hour, end_hour))
    return list(range(start_hour, 24)) + list(range(0, end_hour))


def score_risk(row: dict, window_ratio: float, base_risk: str) -> Tuple[str, str, str]:
    score = 0.0
    score += min(1.0, row.get("CCS", 0) / 10)
    score += min(1.0, row.get("pct_of_cluster", 0) / 100)
    score += min(1.0, window_ratio * 2)
    score = score / 3

    if row.get("CCS_category") in ("CRITICAL",):
        return "HIGH", "Not recommended to park — this zone is historically very high risk.", "High"
    if score >= 0.65:
        return "HIGH", "Not recommended to park — the historical data shows significant violations during this period.", "Medium"
    if score >= 0.4:
        return "MEDIUM", "Caution advised — moderate historical violations were recorded for this zone and time.", "Low"
    return "LOW", "Likely safe to park based on historical model data, but continue to check local conditions.", "Low"


@router.post("/ask")
def ask(request: Request, body: QARequest):
    hs = request.app.state.hotspot_service
    ans = request.app.state.analytics_service

    loc = body.location.strip()
    if not loc:
        raise HTTPException(400, "Location is required")

    date_value = None
    day_name = None
    if body.date:
        try:
            date_value = parse_date(body.date)
            day_name = date_value.strftime("%A")
        except ValueError:
            raise HTTPException(400, "Date must be YYYY-MM-DD")

    try:
        start_hour = parse_hour(body.start_time)
        end_hour = parse_hour(body.end_time)
    except ValueError:
        raise HTTPException(400, "Start time and end time must be valid hours in HH:MM format")

    hours = format_hours(start_hour, end_hour)
    clusters = hs.clusters
    matches, matched_name = best_cluster_matches(loc, clusters)

    if matches.empty:
        return {
            "location_matched": False,
            "message": "No exact or fuzzy match found for location. Try a nearby junction or police station name.",
            "suggestions": clusters["top_junction"].dropna().astype(str).head(10).tolist(),
            "top_zones": clusters.head(10).to_dict(orient="records"),
        }

    df = hs.df_clust
    selected = df[df["cluster"].isin(matches["cluster"]) & df["hour_ist"].isin(hours)]
    if day_name:
        selected = selected[selected["dow_ist"] == day_name]

    total_in_window = len(selected)
    cluster_totals = df[df["cluster"].isin(matches["cluster"])].groupby("cluster").size().to_dict()

    details = []
    for _, row in matches.iterrows():
        cid = int(row["cluster"])
        tot = int(cluster_totals.get(cid, 0))
        cluster_window = selected[selected["cluster"] == cid]
        window_count = len(cluster_window)
        pct = round((window_count / tot * 100) if tot else 0, 1)
        hour_ratio = min(1.0, window_count / max(1, len(hours) * 5))
        risk, recommendation, confidence = score_risk(
            {
                "CCS": float(row.get("CCS", 0)),
                "CCS_category": row.get("CCS_category", ""),
                "pct_of_cluster": pct,
            },
            hour_ratio,
            row.get("CCS_category", "LOW"),
        )
        details.append({
            "cluster": cid,
            "top_junction": row["top_junction"],
            "top_police": row.get("top_police", ""),
            "CCS": float(row.get("CCS", 0)),
            "CCS_category": row.get("CCS_category", ""),
            "violations_in_window": window_count,
            "pct_of_cluster": pct,
            "hour_ratio": round(hour_ratio, 2),
            "risk": risk,
            "recommendation": recommendation,
            "confidence": confidence,
        })

    worst = max(details, key=lambda x: (x["risk"] == "HIGH", x["hour_ratio"], x["CCS"]))
    forecast = ans.get_forecast(clusters, n_days=7)
    forecast_detail = None
    if day_name:
        forecast_detail = next((item for item in forecast if item["day"] == day_name), None)

    explanation = (
        f"Based on historical parking violation data for '{loc}', the matched zone is '{matched_name}'. "
        f"Between {start_hour:02d}:00 and {end_hour:02d}:00 "
        f"the matched cluster recorded {total_in_window} violations{(' on ' + day_name) if day_name else ''}. "
        f"The selected zone has CCS {worst['CCS']} ({worst['CCS_category']}), "
        f"and the time window represents {worst['pct_of_cluster']}% of that zone's historical volume. "
        f"Risk is classified as {worst['risk']}. {worst['recommendation']}"
    )
    if forecast_detail:
        explanation += (
            f" General forecast for {forecast_detail['day']} is {forecast_detail['risk']}, "
            f"with peak hours around {forecast_detail['peak_hours']}."
        )

    return {
        "location_matched": True,
        "matched_name": matched_name,
        "matched": details,
        "window_violations": total_in_window,
        "risk": worst["risk"],
        "recommendation": worst["recommendation"],
        "confidence": worst["confidence"],
        "forecast": forecast_detail,
        "explanation": explanation,
        "sarvam_text": explanation,
    }
