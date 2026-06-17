"""
AnalyticsService – temporal aggregations and forecasting.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


class AnalyticsService:
    """Computes temporal analytics from the violation DataFrame."""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        print(f"[AnalyticsService] Initialised with {len(df):,} rows")

    # ── Temporal breakdowns ────────────────────────────────
    def get_hourly(self) -> list[dict]:
        return (
            self.df.groupby("hour_ist")
            .size()
            .reset_index(name="violations")
            .to_dict(orient="records")
        )

    def get_daily(self) -> list[dict]:
        dow_order = [
            "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday",
        ]
        d = self.df.groupby("dow_ist").size().reset_index(name="violations")
        d["dow_ist"] = pd.Categorical(d["dow_ist"], categories=dow_order, ordered=True)
        return d.sort_values("dow_ist").to_dict(orient="records")

    def get_monthly(self) -> list[dict]:
        m = (
            self.df.groupby(["month_ist", "month_name"])
            .size()
            .reset_index(name="violations")
            .sort_values("month_ist")
        )
        return m.to_dict(orient="records")

    def get_heatmap_data(self) -> list[dict]:
        """Hour × Day-of-week violation counts for heatmap."""
        dow_order = [
            "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday",
        ]
        hm = (
            self.df.groupby(["dow_ist", "hour_ist"])
            .size()
            .reset_index(name="violations")
        )
        hm["dow_ist"] = pd.Categorical(
            hm["dow_ist"], categories=dow_order, ordered=True
        )
        return hm.sort_values(["dow_ist", "hour_ist"]).to_dict(orient="records")

    def get_daily_trend(self) -> list[dict]:
        """Daily violation counts + 7-day rolling average."""
        ts = self.df.groupby("date_ist").size().reset_index(name="violations")
        ts["date_ist"] = pd.to_datetime(ts["date_ist"])
        ts = ts.sort_values("date_ist")
        ts["rolling_7d"] = ts["violations"].rolling(7, min_periods=1).mean().round(1)
        ts["date_ist"] = ts["date_ist"].dt.strftime("%Y-%m-%d")
        return ts.to_dict(orient="records")

    # ── Violation / Vehicle breakdowns ─────────────────────
    def get_violation_types(self) -> list[dict]:
        vt = (
            self.df.explode("vtype_list")
            .groupby("vtype_list")
            .size()
            .reset_index(name="count")
            .sort_values("count", ascending=False)
            .head(12)
        )
        return vt.to_dict(orient="records")

    def get_vehicle_types(self) -> list[dict]:
        veh = (
            self.df["vehicle_type"]
            .value_counts()
            .head(10)
            .reset_index()
        )
        veh.columns = ["vehicle", "count"]
        return veh.to_dict(orient="records")

    # ── 7-day forecast ─────────────────────────────────────
    def get_forecast(self, clusters: pd.DataFrame, n_days: int = 7) -> list[dict]:
        dow_order = [
            "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday",
        ]
        df_c = self.df[self.df.get("cluster", pd.Series(dtype=int)) >= 0] if "cluster" in self.df.columns else self.df
        dow_hour = (
            df_c.groupby(["dow_ist", "hour_ist"])
            .size()
            .reset_index(name="count")
        )
        dow_hour["dow_ist"] = pd.Categorical(
            dow_hour["dow_ist"], categories=dow_order, ordered=True
        )

        # Get violation density per day of week to find dynamic daily peak zones
        day_cluster_counts = (
            df_c.groupby(["dow_ist", "cluster"])
            .size()
            .reset_index(name="viol_count")
        )

        forecast = []
        today = datetime.now()

        for i in range(n_days):
            day = today + timedelta(days=i + 1)
            dow = day.strftime("%A")
            row = dow_hour[dow_hour["dow_ist"] == dow]
            if row.empty:
                continue
            peak_hours = row.nlargest(3, "count")["hour_ist"].tolist()
            risk = "HIGH" if dow in ["Friday", "Saturday", "Sunday"] else "MEDIUM"
            
            # Find the top cluster for this specific day of the week
            day_clusters = day_cluster_counts[day_cluster_counts["dow_ist"] == dow]
            top_cluster = None
            if not day_clusters.empty:
                top_cluster_id = day_clusters.nlargest(1, "viol_count")["cluster"].iloc[0]
                matched_rows = clusters[clusters["cluster"] == top_cluster_id]
                if not matched_rows.empty:
                    top_cluster = matched_rows.iloc[0]
            
            if top_cluster is None and len(clusters) > 0:
                top_cluster = clusters.iloc[0]

            forecast.append({
                "date": day.strftime("%a %d %b"),
                "day": dow,
                "risk": risk,
                "peak_hours": ", ".join(f"{int(h):02d}:00" for h in peak_hours),
                "top_zone": (
                    str(top_cluster["top_junction"]) if top_cluster is not None else "—"
                ),
                "CCS": float(top_cluster["CCS"]) if top_cluster is not None else 0,
            })
        return forecast

    # ── ROI computation ────────────────────────────────────
    def compute_roi(
        self, clusters: pd.DataFrame,
        vot: int = 95, vph: int = 900,
        delay: float = 2.5, fuel: float = 4.5,
        sessions: int = 2, session_hr: int = 2,
        top_n: int = 20,
    ) -> dict:
        roi_vot = round(vph * session_hr * delay / 60 * vot)
        roi_fuel = round(vph * session_hr * delay * fuel)
        per_session = roi_vot + roi_fuel
        total_daily = per_session * sessions * min(top_n, len(clusters))
        return {
            "roi_vot_per_session": roi_vot,
            "roi_fuel_per_session": roi_fuel,
            "total_per_session": per_session,
            "total_daily": total_daily,
            "sessions": sessions,
            "zones": min(top_n, len(clusters)),
        }
