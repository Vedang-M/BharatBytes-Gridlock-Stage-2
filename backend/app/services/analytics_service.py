"""
AnalyticsService – temporal aggregations, forecasting, and What-If simulation.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.preprocessing import MinMaxScaler
from app.utils.ccs_helper import get_ccs_category


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

    # ── What-If Zone Simulation ────────────────────────────
    def simulate_whatif(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        clearance_pct: float = 100.0,
        clusters: pd.DataFrame = None,
    ) -> dict:
        """
        Simulate the traffic impact if illegal parking is cleared
        in the selected bounding box area.

        Parameters
        ----------
        lat_min, lat_max, lon_min, lon_max : bounding box of drawn polygon
        clearance_pct : % of violations assumed to be cleared (0-100)
        clusters : hotspot clusters DataFrame from HotspotService

        Returns
        -------
        dict with before/after metrics and impact summary
        """
        factor = clearance_pct / 100.0

        # ── 1. Filter violations inside the bounding box ──
        mask = (
            self.df["latitude"].between(lat_min, lat_max)
            & self.df["longitude"].between(lon_min, lon_max)
        )
        zone_df = self.df[mask].copy()
        total_in_zone = len(zone_df)

        if total_in_zone == 0:
            return {
                "error": "No violations found in the selected area. Try a larger zone.",
                "total_violations_in_zone": 0,
            }

        # ── 2. Before metrics ──────────────────────────────
        before_violations = total_in_zone
        before_peak_pct   = round(float(zone_df["is_peak"].mean() * 100), 1)
        before_avg_sev    = round(float(zone_df["severity_score"].mean()), 2)
        before_avg_veh_wt = round(float(zone_df["veh_weight"].mean()), 2)
        before_main_road  = round(float(zone_df["is_main_road"].mean() * 100), 1)
        before_at_junc    = round(float(zone_df["at_junction"].mean() * 100), 1)

        # ── 3. Estimate CCS for the zone (mini-cluster) ───
        # We compute a single CCS score for the entire selected zone
        # using the same formula as HotspotService
        all_violations = max(len(self.df), 1)
        dn_before = before_violations / all_violations  # normalised density
        sn = (before_avg_sev - 1) / 5
        wn = (before_avg_veh_wt - 1) / 4
        pn = before_peak_pct / 100
        jn = before_at_junc / 100
        mn = before_main_road / 100

        ccs_before = round(
            (0.30 * dn_before + 0.20 * sn + 0.15 * wn
             + 0.15 * pn + 0.10 * jn + 0.10 * mn) * 10, 2
        )
        ccs_before = min(ccs_before, 10.0)

        # ── 4. After metrics (violations cleared by factor) ─
        after_violations  = round(before_violations * (1 - factor))
        dn_after          = after_violations / all_violations

        # Peak % improves proportionally (cleared vehicles were peak-heavy)
        # We assume a slight improvement in peak distribution
        after_peak_pct    = round(before_peak_pct * (1 - factor * 0.4), 1)
        pn_after          = after_peak_pct / 100

        ccs_after = round(
            (0.30 * dn_after + 0.20 * sn + 0.15 * wn
             + 0.15 * pn_after + 0.10 * jn + 0.10 * mn) * 10, 2
        )
        ccs_after = min(ccs_after, 10.0)

        ccs_reduction      = round(ccs_before - ccs_after, 2)
        ccs_reduction_pct  = round((ccs_reduction / ccs_before * 100) if ccs_before > 0 else 0, 1)

        # ── 5. Traffic flow improvement estimate ──────────
        # Each % CCS reduction → ~0.35% flow improvement (empirical proxy)
        flow_improvement_pct = round(ccs_reduction_pct * 0.35, 1)

        # ── 6. Delay / fuel savings ────────────────────────
        AVG_VEHICLES_PER_HOUR = 900
        AVG_DELAY_MINUTES     = 2.5
        VALUE_OF_TIME_INR     = 95
        FUEL_COST_PER_VEH_MIN = 4.5
        SESSION_HRS           = 2

        delay_saved_min   = round(AVG_DELAY_MINUTES * factor, 2)
        vehicles_affected = AVG_VEHICLES_PER_HOUR * SESSION_HRS
        roi_vot_saved     = round(vehicles_affected * delay_saved_min / 60 * VALUE_OF_TIME_INR)
        roi_fuel_saved    = round(vehicles_affected * delay_saved_min * FUEL_COST_PER_VEH_MIN)
        total_savings_inr = roi_vot_saved + roi_fuel_saved

        # ── 7. Violations cleared by type ─────────────────
        violations_cleared = round(before_violations * factor)
        top_types = (
            zone_df.explode("vtype_list")["vtype_list"]
            .value_counts()
            .head(5)
            .reset_index()
        )
        top_types.columns = ["type", "count"]
        top_types["cleared"] = (top_types["count"] * factor).round(0).astype(int)
        cleared_breakdown = top_types.to_dict(orient="records")

        # ── 8. Category label ──────────────────────────────

        # ── 9. Nearby hotspot clusters affected ───────────
        affected_clusters = []
        if clusters is not None and len(clusters) > 0:
            nearby = clusters[
                clusters["lat"].between(lat_min - 0.005, lat_max + 0.005)
                & clusters["lon"].between(lon_min - 0.005, lon_max + 0.005)
            ]
            for _, row in nearby.head(5).iterrows():
                affected_clusters.append({
                    "name":     str(row["top_junction"]),
                    "ccs":      float(row["CCS"]),
                    "category": str(row["CCS_category"]),
                    "violations": int(row["violations"]),
                })

        # ── 10. Peak hour breakdown for zone ──────────────
        peak_hours_dist = (
            zone_df.groupby("hour_ist")
            .size()
            .reset_index(name="count")
            .sort_values("count", ascending=False)
            .head(5)
            .to_dict(orient="records")
        )

        # ── 11. Vehicle mix in zone ────────────────────────
        vehicle_mix = (
            zone_df["vehicle_type"]
            .value_counts()
            .head(5)
            .reset_index()
        )
        vehicle_mix.columns = ["vehicle", "count"]
        vehicle_mix_list = vehicle_mix.to_dict(orient="records")

        return {
            # Zone info
            "zone_bounds": {
                "lat_min": lat_min, "lat_max": lat_max,
                "lon_min": lon_min, "lon_max": lon_max,
            },
            "clearance_pct": clearance_pct,

            # Before
            "before": {
                "violations":      before_violations,
                "peak_pct":        before_peak_pct,
                "avg_severity":    before_avg_sev,
                "main_road_pct":   before_main_road,
                "at_junction_pct": before_at_junc,
                "ccs":             ccs_before,
                "ccs_category":    get_ccs_category(ccs_before),
            },

            # After
            "after": {
                "violations":   after_violations,
                "peak_pct":     after_peak_pct,
                "ccs":          ccs_after,
                "ccs_category": get_ccs_category(ccs_after),
            },

            # Impact
            "impact": {
                "violations_cleared":    violations_cleared,
                "ccs_reduction":         ccs_reduction,
                "ccs_reduction_pct":     ccs_reduction_pct,
                "flow_improvement_pct":  flow_improvement_pct,
                "delay_saved_min":       delay_saved_min,
                "total_savings_inr":     total_savings_inr,
                "roi_vot_saved":         roi_vot_saved,
                "roi_fuel_saved":        roi_fuel_saved,
            },

            # Breakdown
            "cleared_by_type":    cleared_breakdown,
            "peak_hours":         peak_hours_dist,
            "vehicle_mix":        vehicle_mix_list,
            "affected_clusters":  affected_clusters,
        }
