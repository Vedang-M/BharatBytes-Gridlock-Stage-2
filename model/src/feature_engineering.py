"""
ParkIQ – Spatial Grid Feature Engineering
Divides Bengaluru into ~500 m grid cells and computes per-cell ML features.
"""
import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.cluster import KMeans

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "model", "data", "processed")

# ── Grid parameters ────────────────────────────────────────────
LAT_MIN, LAT_MAX = 12.70, 13.20
LON_MIN, LON_MAX = 77.40, 77.80
CELL_SIZE = 0.0025  # ≈ 250 m at this latitude

# ── Feature columns used by the ML model ───────────────────────
FEATURE_COLS = [
    "violation_count",
    "avg_severity",
    "avg_veh_weight",
    "peak_pct",
    "main_road_pct",
    "junction_pct",
    "weekend_pct",
    "unique_hours",
    "n_violations_avg",
    "unique_vehicle_types",
    "temporal_entropy",
    "lag_violation_count"
]


def _entropy(series: pd.Series) -> float:
    """Shannon entropy of a categorical series (bits)."""
    probs = series.value_counts(normalize=True)
    return float(-np.sum(probs * np.log2(probs + 1e-10)))

def _q25(x: pd.Series) -> float:
    return float(x.quantile(0.25))

def _q75(x: pd.Series) -> float:
    return float(x.quantile(0.75))


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
            std_severity=("severity_score", "std"),
            sev_25=("severity_score", _q25),
            sev_75=("severity_score", _q75),
            avg_veh_weight=("veh_weight", "mean"),
            std_veh_weight=("veh_weight", "std"),
            veh_25=("veh_weight", _q25),
            veh_75=("veh_weight", _q75),
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
    MIN_VIOLATIONS = 1
    cells = cells[cells["violation_count"] >= MIN_VIOLATIONS].copy()
    
    # Fill NaN stds (occurs if only 1 item)
    cells["std_severity"] = cells["std_severity"].fillna(0)
    cells["std_veh_weight"] = cells["std_veh_weight"].fillna(0)
    
    # Temporal Context (Weekend Ratio)
    cells["weekend_ratio"] = cells["weekend_pct"] / (1.0 - cells["weekend_pct"] + 1e-5)
    
    print(f"  Grid cells (>={MIN_VIOLATIONS} violations): {len(cells):,}")

    # ── K-Means Spatial Clustering ────────────────────────────
    kmeans = KMeans(n_clusters=15, random_state=42, n_init="auto")
    cells["zone_cluster_id"] = kmeans.fit_predict(cells[["lat_center", "lon_center"]])

    # ── Interaction Features ────────────────────────────────
    cells["traffic_density_index"] = cells["main_road_pct"] * cells["junction_pct"]
    cells["peak_severity_risk"] = cells["peak_pct"] * cells["n_violations_avg"]

    # ── Compute CCS target using domain constants ───────────
    MAX_EXPECTED_VIOLATIONS = 200.0
    cells["dn"] = np.clip(np.log1p(cells["violation_count"]) / np.log1p(MAX_EXPECTED_VIOLATIONS), 0, 1)
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

    q1 = cells["CCS"].quantile(0.25)
    q2 = cells["CCS"].quantile(0.50)
    q3 = cells["CCS"].quantile(0.75)
    
    # Ensure bin edges are strictly unique if quantiles overlap
    bins = sorted(list(set([-np.inf, q1, q2, q3, np.inf])))
    labels = ["LOW", "MODERATE", "HIGH", "CRITICAL"]
    if len(bins) - 1 < len(labels):
        labels = labels[-(len(bins)-1):]

    cells["CCS_category"] = pd.cut(
        cells["CCS"],
        bins=bins,
        labels=labels,
        include_lowest=True
    )

    print(f"  CCS distribution: {cells['CCS_category'].value_counts().to_dict()}")
    return cells, FEATURE_COLS


def save_grid_features(
    cells: pd.DataFrame, output_dir: str = PROCESSED_DIR
) -> str:
    """Persist grid feature matrix to CSV."""
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "grid_features.csv")
    cells.to_csv(out_path, index=False)
    print(f"  Saved -> {out_path}")
    return out_path


# ── CLI entry ──────────────────────────────────────────────────
if __name__ == "__main__":
    cells, feat_cols = create_grid_features()
    save_grid_features(cells)
    print(
        f"\n✅ Feature engineering complete – "
        f"{len(cells)} cells × {len(feat_cols)} features"
    )
