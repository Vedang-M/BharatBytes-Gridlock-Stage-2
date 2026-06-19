"""
ParkIQ – Model Training Pipeline
Trains Classifier & Regressor, selects the best, saves artifacts.
"""
import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix, cohen_kappa_score,
    balanced_accuracy_score, matthews_corrcoef
)
from sklearn.preprocessing import LabelEncoder, RobustScaler

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "model", "data", "processed")
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

# ensure sibling module imports work when run as script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FEATURE_COLS = [
    "weekend_pct",
    "unique_hours",
    "n_violations_avg",
    "unique_vehicle_types",
    "temporal_entropy",
    "lat_center",
    "lon_center"
]
CATEGORIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"]

def train_models(df: pd.DataFrame):
    os.makedirs(MODEL_DIR, exist_ok=True)

    X = df[FEATURE_COLS].values
    
    # We will need the CCS score for regression, and CCS_category for classification
    y_reg = df["CCS"].values
    y_cat = df["CCS_category"].values

    # Encode labels
    le = LabelEncoder()
    le.classes_ = np.array(CATEGORIES)
    y_clf_enc = le.transform(y_cat)

    # Calculate dynamic thresholds using the exact bins from the dataset
    # We use pd.qcut to get the exact thresholds used
    _, bins = pd.qcut(df["CCS"], q=4, retbins=True, duplicates="drop")
    
    # Handle the case where fewer than 4 bins are created due to duplicates
    actual_categories = CATEGORIES[-len(bins)+1:] if len(bins) - 1 < len(CATEGORIES) else CATEGORIES
    
    ccs_thresholds = {
        "LOW_MAX": float(bins[1]),
        "MODERATE_MAX": float(bins[2]) if len(bins) > 2 else float(bins[-1]),
        "HIGH_MAX": float(bins[3]) if len(bins) > 3 else float(bins[-1]),
    }
    
    # Helper to categorize regression output
    def categorize_scores(scores):
        return pd.cut(scores, bins=bins, labels=actual_categories, include_lowest=True)

    # Scale features
    scaler = RobustScaler()
    X_scaled = scaler.fit_transform(X)

    # Train / Test Split
    X_train, X_test, y_clf_train, y_clf_test, y_reg_train, y_reg_test = train_test_split(
        X_scaled, y_clf_enc, y_reg, test_size=0.2, random_state=42, stratify=y_clf_enc
    )

    print(f"  Train: {len(X_train):,}   Test: {len(X_test):,}")
    train_dist = dict(zip(*np.unique(le.inverse_transform(y_clf_train), return_counts=True)))
    print(f"  Train distribution: {train_dist}")

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    print("\n🚀 Evaluating HistGradientBoostingClassifier …")
    clf = HistGradientBoostingClassifier(random_state=42, class_weight='balanced')
    clf_f1_scores = []
    
    for train_idx, val_idx in cv.split(X_train, y_clf_train):
        X_tr, y_tr = X_train[train_idx], y_clf_train[train_idx]
        X_val, y_val = X_train[val_idx], y_clf_train[val_idx]
        clf.fit(X_tr, y_tr)
        preds = clf.predict(X_val)
        clf_f1_scores.append(f1_score(y_val, preds, average="weighted"))
        
    clf_mean_f1 = np.mean(clf_f1_scores)
    clf_std_f1 = np.std(clf_f1_scores)
    print(f"  Classifier CV F1: {clf_mean_f1:.4f} ± {clf_std_f1:.4f}")

    print("\n📈 Evaluating HistGradientBoostingRegressor …")
    reg = HistGradientBoostingRegressor(random_state=42)
    reg_f1_scores = []
    
    for train_idx, val_idx in cv.split(X_train, y_clf_train):
        X_tr, y_tr_reg = X_train[train_idx], y_reg_train[train_idx]
        X_val, y_val_clf = X_train[val_idx], y_clf_train[val_idx]
        reg.fit(X_tr, y_tr_reg)
        reg_preds = reg.predict(X_val)
        # categorize
        cat_preds = categorize_scores(reg_preds)
        # encode
        cat_preds_filled = cat_preds.fillna("LOW") # just a fallback
        enc_preds = le.transform(cat_preds_filled)
        reg_f1_scores.append(f1_score(y_val_clf, enc_preds, average="weighted"))
        
    reg_mean_f1 = np.mean(reg_f1_scores)
    reg_std_f1 = np.std(reg_f1_scores)
    print(f"  Regressor CV F1: {reg_mean_f1:.4f} ± {reg_std_f1:.4f}")

    # Pick winner
    if reg_mean_f1 > clf_mean_f1:
        print("\n✅ Winner: HistGradientBoostingRegressor")
        best_name = "HistGradientBoostingRegressor"
        best_model = reg
        best_model.fit(X_train, y_reg_train)
        y_pred_raw = best_model.predict(X_test)
        y_pred_cat = categorize_scores(y_pred_raw).fillna("LOW")
        y_pred = le.transform(y_pred_cat)
    else:
        print("\n✅ Winner: HistGradientBoostingClassifier")
        best_name = "HistGradientBoostingClassifier"
        best_model = clf
        best_model.fit(X_train, y_clf_train)
        y_pred = best_model.predict(X_test)
        
    y_pred_labels = le.inverse_transform(y_pred)
    y_test_labels = le.inverse_transform(y_clf_test)
    
    # Metrics
    acc = accuracy_score(y_clf_test, y_pred)
    prec = precision_score(y_clf_test, y_pred, average="weighted", zero_division=0)
    rec = recall_score(y_clf_test, y_pred, average="weighted", zero_division=0)
    f1_weighted = f1_score(y_clf_test, y_pred, average="weighted", zero_division=0)
    f1_macro = f1_score(y_clf_test, y_pred, average="macro", zero_division=0)
    bal_acc = balanced_accuracy_score(y_clf_test, y_pred)
    mcc = matthews_corrcoef(y_clf_test, y_pred)
    kappa = cohen_kappa_score(y_clf_test, y_pred)
    cm = confusion_matrix(y_clf_test, y_pred, labels=np.arange(len(CATEGORIES))).tolist()
    
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

    from sklearn.inspection import permutation_importance
    perm_result = permutation_importance(
        best_model, X_test, (y_clf_test if best_name == "HistGradientBoostingClassifier" else y_reg_test),
        n_repeats=10, random_state=42
    )
    importance = dict(zip(FEATURE_COLS, perm_result.importances_mean.round(4).tolist()))

    metrics = {
        "model_name":        best_name,
        "accuracy":          round(acc, 4),
        "precision_weighted": round(prec, 4),
        "recall_weighted":   round(rec, 4),
        "f1_weighted":       round(f1_weighted, 4),
        "f1_macro":          round(f1_macro, 4),
        "balanced_accuracy": round(bal_acc, 4),
        "mcc":               round(mcc, 4),
        "cohen_kappa":       round(kappa, 4),
        "cv_f1_mean":        round(clf_mean_f1 if best_name == "HistGradientBoostingClassifier" else reg_mean_f1, 4),
        "cv_f1_std":         round(clf_std_f1 if best_name == "HistGradientBoostingClassifier" else reg_std_f1, 4),
        "confusion_matrix":  cm,
        "categories":        CATEGORIES,
        "per_class_metrics": per_class,
        "feature_importance": importance,
        "train_size":        int(len(X_train)),
        "test_size":         int(len(X_test)),
        "n_features":        len(FEATURE_COLS),
        "feature_names":     FEATURE_COLS,
        "ccs_thresholds":    ccs_thresholds,
        "bins":              list(bins)
    }

    print(f"\n📊 Test-set results:")
    print(f"  Accuracy : {acc:.4f}")
    print(f"  F1 Macro : {f1_macro:.4f}")
    print(f"  F1 Weight: {f1_weighted:.4f}")
    print(f"  Kappa    : {kappa:.4f}")
    print(f"  MCC      : {mcc:.4f}")
    print(f"  Bal Acc  : {bal_acc:.4f}")

    # ── Persist artefacts ──────────────────────────────────
    joblib.dump(best_model, os.path.join(MODEL_DIR, "hotspot_model.pkl"))
    joblib.dump(scaler,     os.path.join(MODEL_DIR, "scaler.pkl"))
    joblib.dump(le,         os.path.join(MODEL_DIR, "label_encoder.pkl"))

    with open(os.path.join(MODEL_DIR, "model_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    if hasattr(best_model, "predict_proba"):
        y_prob = best_model.predict_proba(X_test)
    else:
        y_prob = []

    np.savez(
        os.path.join(MODEL_DIR, "test_data.npz"),
        X_test=X_test, y_test=y_clf_test, y_pred=y_pred, y_prob=y_prob
    )
    print(f"\n💾 Saved to: {MODEL_DIR}")
    return best_model, metrics

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
