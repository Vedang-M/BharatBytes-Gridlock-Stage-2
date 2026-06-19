"""
HotspotService – DBSCAN clustering + CCS scoring.
Mirrors the logic from app.py but decoupled from Streamlit.
"""
import os
import json
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import MinMaxScaler
from dotenv import load_dotenv
from app.utils.ccs_helper import get_ccs_category

load_dotenv()

# ── Domain constants (same as app.py) ──────────────────────────
VIOLATION_SEVERITY = {
    "WRONG PARKING": 2, "NO PARKING": 3, "PARKING IN A MAIN ROAD": 5,
    "PARKING ON FOOTPATH": 4, "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 6,
    "DOUBLE PARKING": 5, "PARKING ON CYCLE TRACK": 4,
}
VEHICLE_WIDTH_SCORE = {
    "HGV": 5.0, "LORRY/GOODS VEHICLE": 5.0, "TANKER": 5.0,
    "PRIVATE BUS": 4.5, "BUS (BMTC/KSRTC)": 4.5,
    "TOURIST BUS": 4.5, "FACTORY BUS": 4.5, "SCHOOL VEHICLE": 4.0,
    "LGV": 3.5, "MINI LORRY": 3.5, "TEMPO": 3.5,
    "MAXI-CAB": 3.0, "VAN": 3.0, "TRACTOR": 3.5,
    "CAR": 2.5, "JEEP": 2.5,
    "PASSENGER AUTO": 2.0, "GOODS AUTO": 2.0,
    "SCOOTER": 1.0, "MOTOR CYCLE": 1.0, "MOPED": 1.0,
    "OTHERS": 2.0,
}
MORNING_PEAK = (7, 11)
EVENING_PEAK = (17, 21)
VALUE_OF_TIME_INR = 95
AVG_VEHICLES_PER_HOUR = 900
AVG_DELAY_MINUTES = 2.5
FUEL_COST_PER_VEH_MIN = 4.5


class HotspotService:
    """Loads data, runs DBSCAN, computes CCS – cached after first call."""

    def __init__(self):
        csv_path = os.getenv(
            "CSV_PATH",
            os.path.join(
                os.path.dirname(__file__), "..", "..", "..",
                "jan to may police violation_anonymized791b166.csv",
            ),
        )
        csv_path = os.path.abspath(csv_path)
        print(f"[HotspotService] Loading CSV: {csv_path}")
        self.df = self._load(csv_path)
        cache_path = os.path.join(os.path.dirname(__file__), "hotspot_cache.pkl")
        if os.path.exists(cache_path):
            print(f"[HotspotService] Loading cached clusters from {cache_path}")
            import pickle
            with open(cache_path, "rb") as f:
                self.df_clust, self.clusters = pickle.load(f)
        else:
            print("[HotspotService] Running DBSCAN...")
            self.df_clust, self.clusters = self._cluster(self.df)
            print(f"[HotspotService] Saving cache to {cache_path}")
            import pickle
            with open(cache_path, "wb") as f:
                pickle.dump((self.df_clust, self.clusters), f)

    # ── Load & preprocess ──────────────────────────────────
    def _load(self, path: str) -> pd.DataFrame:
        df = pd.read_csv(path, low_memory=False)
        df["created_datetime"] = pd.to_datetime(
            df["created_datetime"], errors="coerce", utc=True
        )
        df = df.dropna(subset=["created_datetime"]).copy()
        df["created_datetime_ist"] = df["created_datetime"].dt.tz_convert(
            "Asia/Kolkata"
        )
        df["hour_ist"] = df["created_datetime_ist"].dt.hour
        df["dow_ist"] = df["created_datetime_ist"].dt.day_name()
        df["month_ist"] = df["created_datetime_ist"].dt.month
        df["month_name"] = df["created_datetime_ist"].dt.strftime("%b")
        df["date_ist"] = df["created_datetime_ist"].dt.date
        df["week_ist"] = (
            df["created_datetime_ist"].dt.isocalendar().week.astype("int64")
        )
        df["is_peak"] = (
            df["hour_ist"].between(*MORNING_PEAK)
            | df["hour_ist"].between(*EVENING_PEAK)
        ).astype(int)

        def _parse(v):
            try:
                lst = json.loads(str(v).replace("'", '"'))
                return lst if isinstance(lst, list) else [str(v)]
            except Exception:
                return [str(v)]

        df["vtype_list"] = df["violation_type"].apply(_parse)
        df["primary_violation"] = df["vtype_list"].apply(
            lambda x: x[0] if x else "UNKNOWN"
        )
        df["n_violations"] = df["vtype_list"].apply(len)
        df["severity_score"] = df["vtype_list"].apply(
            lambda vl: max((VIOLATION_SEVERITY.get(v, 2) for v in vl), default=2)
        )
        df["is_main_road"] = df["vtype_list"].apply(
            lambda x: int(any("MAIN ROAD" in v for v in x))
        )
        df["veh_weight"] = df["vehicle_type"].map(VEHICLE_WIDTH_SCORE).fillna(2.0)
        df["at_junction"] = (
            df["junction_name"].notna()
            & (df["junction_name"].str.upper() != "NO JUNCTION")
            & (df["junction_name"] != "")
        ).astype(int)
        df = df[
            df["latitude"].between(12.70, 13.20)
            & df["longitude"].between(77.40, 77.80)
        ].copy()
        print(f"  Loaded {len(df):,} violations")
        return df

    # ── DBSCAN + CCS ──────────────────────────────────────
    def _cluster(
        self, df: pd.DataFrame, eps_m: int = 150, min_samples: int = 30
    ):
        coords = df[["latitude", "longitude"]].values
        eps_rad = eps_m / 6_371_000
        labels = DBSCAN(
            eps=eps_rad,
            min_samples=min_samples,
            algorithm="ball_tree",
            metric="haversine",
            n_jobs=1,
        ).fit_predict(np.radians(coords))

        df = df.copy()
        df["cluster"] = labels
        valid = df[df["cluster"] >= 0]

        agg = (
            valid.groupby("cluster")
            .agg(
                lat=("latitude", "mean"),
                lon=("longitude", "mean"),
                violations=("latitude", "count"),
                peak_viol=("is_peak", "sum"),
                avg_severity=("severity_score", "mean"),
                avg_veh_wt=("veh_weight", "mean"),
                main_road=("is_main_road", "mean"),
                at_junc=("at_junction", "mean"),
                top_police=(
                    "police_station",
                    lambda x: str(x.mode().iloc[0]).title() if len(x) else "Unknown",
                ),
                top_junction=(
                    "junction_name",
                    lambda x: (
                        x[~x.astype(str).str.upper().str.contains("NO JUNCTION|NONE", na=True)].mode().iloc[0]
                        if len(x[~x.astype(str).str.upper().str.contains("NO JUNCTION|NONE", na=True)]) > 0
                        else ""
                    )
                ),
            )
            .reset_index()
        )
        top_vtype = (
            valid.groupby("cluster")["primary_violation"]
            .agg(lambda x: x.mode().iloc[0] if len(x) else "")
            .rename("top_vtype")
        )
        agg = agg.merge(top_vtype, on="cluster", how="left")

        # Fallback empty top_junction to police station name
        def _get_junction_name(row):
            jn = str(row["top_junction"]).strip()
            if not jn or jn.upper() in ["", "NO JUNCTION", "NONE"]:
                police = str(row["top_police"]).strip()
                if police and police.upper() != "UNKNOWN":
                    return f"{police} Area"
                return "Unknown Zone"
            return jn.title()
        agg["top_junction"] = agg.apply(_get_junction_name, axis=1)

        agg["peak_pct"] = (agg["peak_viol"] / agg["violations"] * 100).round(1)

        scaler = MinMaxScaler()
        agg["dn"] = scaler.fit_transform(agg[["violations"]]).flatten()
        agg["sn"] = (agg["avg_severity"] - 1) / 5
        agg["wn"] = (agg["avg_veh_wt"] - 1) / 4
        agg["pn"] = agg["peak_pct"] / 100
        agg["jn"] = agg["at_junc"]
        agg["mn"] = agg["main_road"]

        agg["CCS"] = (
            0.30 * agg["dn"]
            + 0.20 * agg["sn"]
            + 0.15 * agg["wn"]
            + 0.15 * agg["pn"]
            + 0.10 * agg["jn"]
            + 0.10 * agg["mn"]
        ).mul(10).round(2)

        agg["CCS_category"] = agg["CCS"].apply(get_ccs_category)

        def _arch(row):
            jn = str(row["top_junction"]).upper()
            if "METRO" in jn:
                return "Metro Station Spillover"
            if row["main_road"] > 0.4:
                return "Main Road Obstruction"
            if row["at_junc"] > 0.5:
                return "Junction Chokepoint"
            if "MARKET" in jn or "KR" in jn:
                return "Commercial/Market Overflow"
            if row["peak_pct"] > 50:
                return "Peak-Hour Hotspot"
            return "Chronic Parking Zone"

        agg["archetype"] = agg.apply(_arch, axis=1)

        SESSION_HRS = 2
        roi_vot = round(
            AVG_VEHICLES_PER_HOUR * SESSION_HRS * AVG_DELAY_MINUTES / 60 * VALUE_OF_TIME_INR
        )
        roi_fuel = round(
            AVG_VEHICLES_PER_HOUR * SESSION_HRS * AVG_DELAY_MINUTES * FUEL_COST_PER_VEH_MIN
        )
        agg["total_roi_inr"] = roi_vot + roi_fuel

        agg = agg.sort_values("CCS", ascending=False).reset_index(drop=True)
        print(f"  Found {len(agg)} clusters")
        return df, agg

    # ── Public API ─────────────────────────────────────────
    def get_hotspots(self, top_n: int = 50) -> list[dict]:
        return self.clusters.head(top_n).to_dict(orient="records")

    def get_heatmap(self, sample_n: int = 30000) -> list[dict]:
        sample = self.df.sample(min(sample_n, len(self.df)), random_state=42)
        return sample[["latitude", "longitude"]].rename(
            columns={"latitude": "lat", "longitude": "lon"}
        ).to_dict(orient="records")

    def get_schedule(self, n_zones: int = 8) -> list[dict]:
        top = self.clusters.head(n_zones).copy()

        def _window(row):
            nearby = self.df_clust[
                (self.df_clust["latitude"].between(row["lat"] - 0.005, row["lat"] + 0.005))
                & (self.df_clust["longitude"].between(row["lon"] - 0.005, row["lon"] + 0.005))
            ]
            if len(nearby) == 0:
                return "08:00-10:00"
            h = int(nearby.groupby("hour_ist").size().idxmax())
            return f"{h:02d}:00-{(h + 2) % 24:02d}:00"

        top["deploy_window"] = top.apply(_window, axis=1)
        top["rank"] = range(1, len(top) + 1)
        top["priority"] = top["CCS"].apply(
            lambda x: "IMMEDIATE" if x >= 4.5 else "HIGH" if x >= 3.0 else "MODERATE"
        )
        cols = [
            "rank", "top_junction", "archetype", "CCS", "CCS_category",
            "priority", "deploy_window", "violations", "peak_pct",
            "total_roi_inr", "top_police",
        ]
        return top[cols].to_dict(orient="records")

    def get_summary(self) -> dict:
        c = self.clusters
        return {
            "total_violations": int(len(self.df)),
            "total_clusters": int(len(c)),
            "critical_zones": int((c["CCS_category"] == "CRITICAL").sum()),
            "high_zones": int((c["CCS_category"] == "HIGH").sum()),
            "peak_pct": round(float(self.df["is_peak"].mean() * 100), 1),
            "top10_roi": int(c.head(10)["total_roi_inr"].sum()),
        }
