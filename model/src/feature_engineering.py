"""
ParkIQ – Spatial Grid Feature Engineering
Divides Bengaluru into ~500 m grid cells and computes per-cell ML features.
"""
import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "model", "data", "processed")

# ── Grid parameters ────────────────────────────────────────────
LAT_MIN, LAT_MAX = 12.70, 13.20
LON_MIN, LON_MAX = 77.40, 77.80
CELL_SIZE = 0.005  # ≈ 500 m at this latitude

# ── Feature columns used by the ML model ───────────────────────
FEATURE_COLS = [
    "violation_count",
    "peak_pct",
    "avg_severity",
    "max_severity",
    "avg_veh_weight",
    "main_road_pct",
    "junction_pct",
    "weekend_pct",
    "unique_hours",
    "n_violations_avg",
    "unique_vehicle_types",
    "temporal_entropy",
]


def _entropy(series: pd.Series) -> float:
    """Shannon entropy of a categorical series (bits)."""
    probs = series.value_counts(normalize=True)
    return float(-np.sum(probs * np.log2(probs + 1e-10)))


def create_grid_features(df: pd.DataFrame = None):
    """
    Build spatial grid cells and compute per-cell features + CCS label.

    Returns
    -------
    cells : pd.DataFrame   – one row per grid cell
    feature_cols : list     – column names usable as ML features
    """
    if df is None:
        csv_path = os.path.join(PROCESSED_DIR, "processed_violations.csv")
        print(f"[feature_eng] Loading: {csv_path}")
        df = pd.read_csv(csv_path, low_memory=False)

    print(f"  Input rows: {len(df):,}")

    # ── Assign violations to grid cells ─────────────────────
    df = df.copy()
    df["lat_bin"] = ((df["latitude"] - LAT_MIN) / CELL_SIZE).astype(int)
    df["lon_bin"] = ((df["longitude"] - LON_MIN) / CELL_SIZE).astype(int)
    df["cell_id"] = df["lat_bin"].astype(str) + "_" + df["lon_bin"].astype(str)

    # ── Per-cell aggregation ────────────────────────────────
    cells = (
        df.groupby("cell_id")
        .agg(
            lat_bin=("lat_bin", "first"),
            lon_bin=("lon_bin", "first"),
            lat_center=("latitude", "mean"),
            lon_center=("longitude", "mean"),
            violation_count=("latitude", "count"),
            peak_pct=("is_peak", "mean"),
            avg_severity=("severity_score", "mean"),
            max_severity=("severity_score", "max"),
            avg_veh_weight=("veh_weight", "mean"),
            main_road_pct=("is_main_road", "mean"),
            junction_pct=("at_junction", "mean"),
            weekend_pct=("is_weekend", "mean"),
            unique_hours=("hour_ist", "nunique"),
            n_violations_avg=("n_violations", "mean"),
            unique_vehicle_types=("vehicle_type", "nunique"),
        )
        .reset_index()
    )

    # Temporal entropy (how spread violations are across hours)
    hour_ent = (
        df.groupby("cell_id")["hour_ist"]
        .apply(_entropy)
        .rename("temporal_entropy")
    )
    cells = cells.merge(hour_ent, on="cell_id", how="left")
    cells["temporal_entropy"] = cells["temporal_entropy"].fillna(0)

    # Drop cells with too few violations for statistical reliability
    MIN_VIOLATIONS = 5
    cells = cells[cells["violation_count"] >= MIN_VIOLATIONS].copy()
    print(f"  Grid cells (≥{MIN_VIOLATIONS} violations): {len(cells):,}")

    # ── Compute CCS target using the same weighted formula ──
    scaler = MinMaxScaler()
    cells["dn"] = scaler.fit_transform(cells[["violation_count"]]).flatten()
    cells["sn"] = (cells["avg_severity"] - 1) / 5
    cells["wn"] = (cells["avg_veh_weight"] - 1) / 4
    cells["pn"] = cells["peak_pct"]
    cells["jn"] = cells["junction_pct"]
    cells["mn"] = cells["main_road_pct"]

    cells["CCS"] = (
        0.30 * cells["dn"]
        + 0.20 * cells["sn"]
        + 0.15 * cells["wn"]
        + 0.15 * cells["pn"]
        + 0.10 * cells["jn"]
        + 0.10 * cells["mn"]
    ).mul(10).round(2)

    def _ccs_cat(s):
        if s >= 4.5:
            return "CRITICAL"
        if s >= 3.0:
            return "HIGH"
        if s >= 1.5:
            return "MODERATE"
        return "LOW"

    cells["CCS_category"] = cells["CCS"].apply(_ccs_cat)

    print(f"  CCS distribution: {cells['CCS_category'].value_counts().to_dict()}")
    return cells, FEATURE_COLS


def save_grid_features(
    cells: pd.DataFrame, output_dir: str = PROCESSED_DIR
) -> str:
    """Persist grid feature matrix to CSV."""
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "grid_features.csv")
    cells.to_csv(out_path, index=False)
    print(f"  Saved → {out_path}")
    return out_path


# ── CLI entry ──────────────────────────────────────────────────
if __name__ == "__main__":
    cells, feat_cols = create_grid_features()
    save_grid_features(cells)
    print(
        f"\n✅ Feature engineering complete – "
        f"{len(cells)} cells × {len(feat_cols)} features"
    )
