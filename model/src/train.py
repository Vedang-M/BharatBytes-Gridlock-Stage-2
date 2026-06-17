"""
ParkIQ – Model Training Pipeline
Trains RandomForest + GradientBoosting, selects the best, saves artifacts.
"""
import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import (
    train_test_split,
    GridSearchCV,
    StratifiedKFold,
)
from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
)
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix,
    cohen_kappa_score,
)
from sklearn.preprocessing import LabelEncoder, StandardScaler

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "model", "data", "processed")
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

# ensure sibling module imports work when run as script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FEATURE_COLS = [
    "violation_count", "peak_pct", "avg_severity", "max_severity",
    "avg_veh_weight", "main_road_pct", "junction_pct", "weekend_pct",
    "unique_hours", "n_violations_avg", "unique_vehicle_types",
    "temporal_entropy",
]
TARGET_COL = "CCS_category"
CATEGORIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"]


# ═══════════════════════════════════════════════════════════════
def load_features() -> pd.DataFrame:
    csv_path = os.path.join(PROCESSED_DIR, "jan to may police violation_anonymized791b166.csv")
    df = pd.read_csv(csv_path)
    print(f"[train] Loaded {len(df):,} grid cells from {csv_path}")
    return df


def train_models(df: pd.DataFrame):
    """Train, compare, and persist the best classifier."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    X = df[FEATURE_COLS].values
    y = df[TARGET_COL].values

    # Encode labels
    le = LabelEncoder()
    le.classes_ = np.array(CATEGORIES)
    y_enc = le.transform(y)

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Stratified 80 / 20 split
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_enc, test_size=0.2, random_state=42, stratify=y_enc,
    )
    print(f"  Train: {len(X_train):,}   Test: {len(X_test):,}")
    train_dist = dict(zip(*np.unique(le.inverse_transform(y_train), return_counts=True)))
    print(f"  Train distribution: {train_dist}")

    cv = StratifiedKFold(5, shuffle=True, random_state=42)

    # ── Random Forest ──────────────────────────────────────
    print("\n🌲 Training Random Forest …")
    rf_grid = {
        "n_estimators": [100, 200],
        "max_depth": [10, 20, None],
        "min_samples_split": [2, 5],
        "class_weight": ["balanced"],
    }
    rf_cv = GridSearchCV(
        RandomForestClassifier(random_state=42, n_jobs=-1),
        rf_grid, cv=cv, scoring="f1_weighted", n_jobs=-1, verbose=0,
    )
    rf_cv.fit(X_train, y_train)
    print(f"  Best CV F1: {rf_cv.best_score_:.4f}  params={rf_cv.best_params_}")

    # ── Gradient Boosting ──────────────────────────────────
    print("\n🚀 Training Gradient Boosting …")
    gbt_grid = {
        "n_estimators": [100, 200],
        "max_depth": [3, 5, 7],
        "learning_rate": [0.05, 0.1],
        "subsample": [0.8, 1.0],
    }
    gbt_cv = GridSearchCV(
        GradientBoostingClassifier(random_state=42),
        gbt_grid, cv=cv, scoring="f1_weighted", n_jobs=-1, verbose=0,
    )
    gbt_cv.fit(X_train, y_train)
    print(f"  Best CV F1: {gbt_cv.best_score_:.4f}  params={gbt_cv.best_params_}")

    # ── Pick winner ────────────────────────────────────────
    if gbt_cv.best_score_ >= rf_cv.best_score_:
        best_model, best_name, best_cv = gbt_cv.best_estimator_, "GradientBoosting", gbt_cv.best_score_
    else:
        best_model, best_name, best_cv = rf_cv.best_estimator_, "RandomForest", rf_cv.best_score_
    print(f"\n✅ Winner: {best_name}  (CV F1 = {best_cv:.4f})")

    # ── Test-set evaluation ────────────────────────────────
    y_pred = best_model.predict(X_test)
    y_pred_labels = le.inverse_transform(y_pred)
    y_test_labels = le.inverse_transform(y_test)

    acc  = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
    rec  = recall_score(y_test, y_pred, average="weighted", zero_division=0)
    f1   = f1_score(y_test, y_pred, average="weighted", zero_division=0)
    kappa = cohen_kappa_score(y_test, y_pred)
    cm   = confusion_matrix(y_test, y_pred, labels=np.arange(len(CATEGORIES))).tolist()

    report = classification_report(
        y_test_labels, y_pred_labels, labels=CATEGORIES, target_names=CATEGORIES, output_dict=True, zero_division=0,
    )
    per_class = {}
    for cat in CATEGORIES:
        if cat in report:
            per_class[cat] = {
                "precision": round(report[cat]["precision"], 4),
                "recall":    round(report[cat]["recall"], 4),
                "f1":        round(report[cat]["f1-score"], 4),
                "support":   int(report[cat]["support"]),
            }

    importance = {}
    if hasattr(best_model, "feature_importances_"):
        importance = dict(
            zip(FEATURE_COLS, best_model.feature_importances_.round(4).tolist())
        )

    metrics = {
        "model_name":        best_name,
        "accuracy":          round(acc, 4),
        "precision_weighted": round(prec, 4),
        "recall_weighted":   round(rec, 4),
        "f1_weighted":       round(f1, 4),
        "cohen_kappa":       round(kappa, 4),
        "cv_f1_score":       round(best_cv, 4),
        "confusion_matrix":  cm,
        "categories":        CATEGORIES,
        "per_class_metrics": per_class,
        "feature_importance": importance,
        "train_size":        int(len(X_train)),
        "test_size":         int(len(X_test)),
        "n_features":        len(FEATURE_COLS),
        "feature_names":     FEATURE_COLS,
    }

    print(f"\n📊 Test-set results:")
    print(f"  Accuracy : {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall   : {rec:.4f}")
    print(f"  F1       : {f1:.4f}")
    print(f"  Kappa    : {kappa:.4f}")
    print(f"\n  Confusion matrix (rows=true, cols=pred):")
    for i, cat in enumerate(CATEGORIES):
        if i < len(cm):
            print(f"    {cat:10s} {cm[i]}")

    # ── Persist artefacts ──────────────────────────────────
    joblib.dump(best_model, os.path.join(MODEL_DIR, "hotspot_model.pkl"))
    joblib.dump(scaler,     os.path.join(MODEL_DIR, "scaler.pkl"))
    joblib.dump(le,         os.path.join(MODEL_DIR, "label_encoder.pkl"))

    with open(os.path.join(MODEL_DIR, "model_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    np.savez(
        os.path.join(MODEL_DIR, "test_data.npz"),
        X_test=X_test, y_test=y_test, y_pred=y_pred,
    )
    print(f"\n💾 Saved to: {MODEL_DIR}")
    return best_model, metrics


# ═══════════════════════════════════════════════════════════════
# CLI – runs the full 3-step pipeline
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    from preprocess import preprocess, save_processed
    from feature_engineering import create_grid_features, save_grid_features

    print("=" * 60)
    print("STEP 1 / 3 — Preprocessing")
    print("=" * 60)
    df = preprocess()
    save_processed(df)

    print("\n" + "=" * 60)
    print("STEP 2 / 3 — Feature Engineering")
    print("=" * 60)
    cells, feat_cols = create_grid_features(df)
    save_grid_features(cells)

    print("\n" + "=" * 60)
    print("STEP 3 / 3 — Model Training")
    print("=" * 60)
    model, metrics = train_models(cells)

    print("\n" + "=" * 60)
    print("✅  TRAINING PIPELINE COMPLETE")
    print("=" * 60)
