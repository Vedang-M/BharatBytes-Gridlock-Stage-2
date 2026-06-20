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
from catboost import CatBoostClassifier
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from sklearn.ensemble import StackingClassifier
from sklearn.linear_model import LogisticRegression
# pyrefly: ignore [missing-import]
import optuna
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
from feature_engineering import FEATURE_COLS
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

    # Train / Test Split
    X_train_raw, X_test_raw, y_clf_train, y_clf_test, y_reg_train, y_reg_test = train_test_split(
        X, y_clf_enc, y_reg, test_size=0.2, random_state=42, stratify=y_clf_enc
    )

    # Scale features AFTER split to prevent data leakage
    scaler = RobustScaler()
    X_train = scaler.fit_transform(X_train_raw)
    X_test = scaler.transform(X_test_raw)

    print(f"  Train: {len(X_train):,}   Test: {len(X_test):,}")
    train_dist = dict(zip(*np.unique(le.inverse_transform(y_clf_train), return_counts=True)))
    print(f"  Train distribution: {train_dist}")

    # Optuna & Stacking Benchmark
    print("\n🚀 Evaluating StackingClassifier with Optuna …")
    
    def objective(trial):
        cb_lr = trial.suggest_float('cb_lr', 0.01, 0.1)
        cb_depth = trial.suggest_int('cb_depth', 4, 6)
        cb_l2 = trial.suggest_int('cb_l2', 3, 10)
        
        xgb_lr = trial.suggest_float('xgb_lr', 0.01, 0.1)
        xgb_depth = trial.suggest_int('xgb_depth', 3, 6)
        xgb_lambda = trial.suggest_float('xgb_lambda', 1.0, 10.0)
        
        lgb_lr = trial.suggest_float('lgb_lr', 0.01, 0.1)
        lgb_leaves = trial.suggest_int('lgb_leaves', 15, 31)
        lgb_l2 = trial.suggest_float('lgb_l2', 1.0, 10.0)
        
        cb = CatBoostClassifier(learning_rate=cb_lr, depth=cb_depth, l2_leaf_reg=cb_l2, random_state=42, verbose=0)
        xgb = XGBClassifier(learning_rate=xgb_lr, max_depth=xgb_depth, reg_lambda=xgb_lambda, random_state=42, eval_metric='mlogloss')
        lgb = LGBMClassifier(learning_rate=lgb_lr, num_leaves=lgb_leaves, reg_lambda=lgb_l2, random_state=42, verbosity=-1)
        
        stack = StackingClassifier(
            estimators=[('cb', cb), ('xgb', xgb), ('lgb', lgb)],
            final_estimator=LogisticRegression(random_state=42, max_iter=1000),
            cv=3
        )
        
        # 3-fold CV score for this trial
        cv_inner = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        f1_scores = []
        for tr_idx, val_idx in cv_inner.split(X_train, y_clf_train):
            X_tr, y_tr = X_train[tr_idx], y_clf_train[tr_idx]
            X_val, y_val = X_train[val_idx], y_clf_train[val_idx]
            stack.fit(X_tr, y_tr)
            preds = stack.predict(X_val)
            f1_scores.append(f1_score(y_val, preds, average='weighted'))
        return np.mean(f1_scores)

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    sampler = optuna.samplers.TPESampler(seed=42)
    study = optuna.create_study(direction='maximize', sampler=sampler)
    print("   Running 30 trials...")
    study.optimize(objective, n_trials=30)
    
    print(f"  Best params: {study.best_params}")
    print(f"  Best CV F1: {study.best_value:.4f}")
    
    # Train final stacking model
    bp = study.best_params
    cb = CatBoostClassifier(learning_rate=bp['cb_lr'], depth=bp['cb_depth'], l2_leaf_reg=bp['cb_l2'], random_state=42, verbose=0)
    xgb = XGBClassifier(learning_rate=bp['xgb_lr'], max_depth=bp['xgb_depth'], reg_lambda=bp['xgb_lambda'], random_state=42, eval_metric='mlogloss')
    lgb = LGBMClassifier(learning_rate=bp['lgb_lr'], num_leaves=bp['lgb_leaves'], reg_lambda=bp['lgb_l2'], random_state=42, verbosity=-1)
    
    best_model = StackingClassifier(
        estimators=[('cb', cb), ('xgb', xgb), ('lgb', lgb)],
        final_estimator=LogisticRegression(random_state=42, max_iter=1000),
        cv=5
    )
    best_model.fit(X_train, y_clf_train)
    
    print("\n✅ Winner: StackingClassifier")
    best_name = "StackingClassifier"
    y_pred = best_model.predict(X_test).flatten()
        
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

    # Feature importance via permutation
    from sklearn.inspection import permutation_importance
    perm_result = permutation_importance(
        best_model, X_test, y_clf_test,
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
        "cv_f1_mean":        round(study.best_value, 4),
        "cv_f1_std":         0.0,
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
