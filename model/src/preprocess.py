"""
ParkIQ – Data Preprocessing Pipeline
Loads raw CSV, cleans datetimes, engineers per-record features.
"""
import os
import sys
import json
import numpy as np
import pandas as pd

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW_CSV = os.path.join(
    PROJECT_ROOT, "jan to may police violation_anonymized791b166.csv"
)
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "model", "data", "processed")

# ── Domain Constants ───────────────────────────────────────────
VIOLATION_SEVERITY = {
    "WRONG PARKING": 2,
    "NO PARKING": 3,
    "PARKING IN A MAIN ROAD": 5,
    "PARKING ON FOOTPATH": 4,
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 6,
    "DOUBLE PARKING": 5,
    "PARKING ON CYCLE TRACK": 4,
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


def preprocess(csv_path: str = RAW_CSV) -> pd.DataFrame:
    """Load raw CSV, clean, and engineer per-record features."""
    print(f"[preprocess] Loading: {csv_path}")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  Raw rows: {len(df):,}")

    # ── Datetime: UTC → IST ─────────────────────────────────
    df["created_datetime"] = pd.to_datetime(
        df["created_datetime"], errors="coerce", utc=True
    )
    df = df.dropna(subset=["created_datetime"]).copy()
    df["created_datetime_ist"] = df["created_datetime"].dt.tz_convert("Asia/Kolkata")
    df["hour_ist"] = df["created_datetime_ist"].dt.hour
    df["dow_ist"] = df["created_datetime_ist"].dt.day_name()
    df["dow_num"] = df["created_datetime_ist"].dt.dayofweek  # 0=Mon … 6=Sun
    df["month_ist"] = df["created_datetime_ist"].dt.month
    df["date_ist"] = df["created_datetime_ist"].dt.date
    df["week_ist"] = (
        df["created_datetime_ist"].dt.isocalendar().week.astype("int64")
    )
    df["is_weekend"] = (df["dow_num"] >= 5).astype(int)

    # ── Peak-hour flag ──────────────────────────────────────
    df["is_peak"] = (
        df["hour_ist"].between(*MORNING_PEAK)
        | df["hour_ist"].between(*EVENING_PEAK)
    ).astype(int)

    # ── Parse violation_type JSON string ─────────────────────
    def _parse_vtype(v):
        try:
            lst = json.loads(str(v).replace("'", '"'))
            return lst if isinstance(lst, list) else [str(v)]
        except Exception:
            return [str(v)]

    df["vtype_list"] = df["violation_type"].apply(_parse_vtype)
    df["primary_violation"] = df["vtype_list"].apply(
        lambda x: x[0] if x else "UNKNOWN"
    )
    df["n_violations"] = df["vtype_list"].apply(len)

    # ── Severity score ──────────────────────────────────────
    def _severity(vlist):
        scores = [VIOLATION_SEVERITY.get(v, 2) for v in vlist]
        return max(scores) if scores else 2

    df["severity_score"] = df["vtype_list"].apply(_severity)

    # ── Main-road flag ──────────────────────────────────────
    df["is_main_road"] = df["vtype_list"].apply(
        lambda x: int(any("MAIN ROAD" in v for v in x))
    )

    # ── Vehicle obstruction weight ──────────────────────────
    df["veh_weight"] = df["vehicle_type"].map(VEHICLE_WIDTH_SCORE).fillna(2.0)

    # ── Junction flag ───────────────────────────────────────
    df["at_junction"] = (
        df["junction_name"].notna()
        & (df["junction_name"].str.upper() != "NO JUNCTION")
        & (df["junction_name"] != "")
    ).astype(int)

    # ── Filter valid lat/lon (Bengaluru bounding box) ───────
    df = df[
        df["latitude"].between(12.70, 13.20) & df["longitude"].between(77.40, 77.80)
    ].copy()

    print(f"  Clean rows: {len(df):,}")
    return df


def save_processed(df: pd.DataFrame, output_dir: str = PROCESSED_DIR) -> str:
    """Persist processed DataFrame to CSV."""
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "processed_violations.csv")
    cols = [
        "id", "latitude", "longitude", "vehicle_type", "primary_violation",
        "police_station", "junction_name",
        "hour_ist", "dow_ist", "dow_num", "month_ist", "date_ist", "week_ist",
        "is_weekend", "is_peak", "n_violations", "severity_score",
        "is_main_road", "veh_weight", "at_junction",
    ]
    keep = [c for c in cols if c in df.columns]
    df[keep].to_csv(out_path, index=False)
    print(f"  Saved → {out_path}")
    return out_path


# ── CLI entry ──────────────────────────────────────────────────
if __name__ == "__main__":
    df = preprocess()
    save_processed(df)
    print("\n✅ Preprocessing complete!")
