import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import StratifiedGroupKFold
from lightgbm import LGBMClassifier
import optuna
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix, cohen_kappa_score,
    balanced_accuracy_score, matthews_corrcoef
)
from sklearn.preprocessing import LabelEncoder
import lightgbm as lgb

warnings.filterwarnings("ignore")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "model", "data", "processed")
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

CATEGORIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"]

def add_dynamic_lags(df_train, df_test):
    # Lags must only use train data for neighbors
    vc_dict = dict(zip(df_train["cell_id"], df_train["violation_count"]))
    def get_lag(row):
        lat, lon = row["lat_bin"], row["lon_bin"]
        neighbors = [
            f"{lat-1}_{lon-1}", f"{lat-1}_{lon}", f"{lat-1}_{lon+1}",
            f"{lat}_{lon-1}",                     f"{lat}_{lon+1}",
            f"{lat+1}_{lon-1}", f"{lat+1}_{lon}", f"{lat+1}_{lon+1}"
        ]
        vals = [vc_dict.get(n) for n in neighbors if vc_dict.get(n) is not None]
        return np.mean(vals) if vals else 0.0

    df_train = df_train.copy()
    df_test = df_test.copy()
    df_train["lag_violation_count"] = df_train.apply(get_lag, axis=1)
    df_test["lag_violation_count"] = df_test.apply(get_lag, axis=1)
    return df_train, df_test

def evaluate_cv(df_train, feature_cols, lgb_params=None):
    if lgb_params is None:
        lgb_params = {"random_state": 42, "verbosity": -1, "n_estimators": 50, "max_depth": 3}
        
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    
    le = LabelEncoder()
    le.classes_ = np.array(CATEGORIES)
    
    fold_f1_val = []
    
    for tr_idx, val_idx in sgkf.split(df_train, df_train["CCS_category"], groups=df_train["zone_cluster_id"]):
        df_tr = df_train.iloc[tr_idx].copy()
        df_val = df_train.iloc[val_idx].copy()
        
        # Dynamic lags
        if "lag_violation_count" in feature_cols:
            df_tr, df_val = add_dynamic_lags(df_tr, df_val)
            
        X_tr = df_tr[feature_cols].values
        X_val = df_val[feature_cols].values
        y_tr = le.transform(df_tr["CCS_category"].values)
        y_val = le.transform(df_val["CCS_category"].values)
        
        # Inner SGKF for early stopping (80% train, 20% val)
        inner_sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
        inner_splits = list(inner_sgkf.split(X_tr, y_tr, groups=df_tr["zone_cluster_id"]))
        
        rng = np.random.default_rng(42 + len(fold_f1_val)) # Vary the fold per loop iteration
        selected_fold = rng.integers(0, len(inner_splits))
        inner_train_idx, inner_val_idx = inner_splits[selected_fold]
        
        X_inner_tr, X_inner_val = X_tr[inner_train_idx], X_tr[inner_val_idx]
        y_inner_tr, y_inner_val = y_tr[inner_train_idx], y_tr[inner_val_idx]
        
        clf = LGBMClassifier(**lgb_params)
        clf.fit(X_inner_tr, y_inner_tr, eval_set=[(X_inner_val, y_inner_val)], callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)])
        
        pred_val = clf.predict(X_val)
        fold_f1_val.append(f1_score(y_val, pred_val, average='weighted'))
        
    return np.mean(fold_f1_val), np.std(fold_f1_val), fold_f1_val

def train_models(df: pd.DataFrame):
    os.makedirs(MODEL_DIR, exist_ok=True)

    active_features = [
        "violation_count",
        "avg_severity",
        "avg_veh_weight",
        "peak_pct",
        "main_road_pct",
        "junction_pct",
        "weekend_pct",
        "unique_hours",
        "unique_vehicle_types",
        "temporal_entropy",
        "lag_violation_count"
    ]

    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    splits = list(sgkf.split(df, df["CCS_category"], groups=df["zone_cluster_id"]))
    train_idx, test_idx = splits[-1]
        
    df_train_raw = df.iloc[train_idx].copy()
    df_test_raw = df.iloc[test_idx].copy()

    # 1. Optuna
    print("\n[Optuna] Evaluating Regularized LGBM ...")
    
    def objective(trial):
        params = {
            'learning_rate': trial.suggest_float('lgb_lr', 0.05, 0.09),
            'max_depth': trial.suggest_int('max_depth', 3, 4),
            'num_leaves': trial.suggest_int('num_leaves', 8, 14),
            'min_child_samples': trial.suggest_int('min_child_samples', 80, 140),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.65, 0.85),
            'subsample': trial.suggest_float('subsample', 0.8, 1.0),
            'subsample_freq': trial.suggest_int('subsample_freq', 1, 3),
            'reg_lambda': trial.suggest_float('reg_lambda', 5.0, 20.0),
            'reg_alpha': trial.suggest_float('reg_alpha', 0.0, 5.0),
            'random_state': 42,
            'verbosity': -1,
            'n_estimators': 100
        }
        val_mean, val_std, fold_scores = evaluate_cv(df_train_raw, active_features, params)
        
        trial.set_user_attr("cv_std", val_std)
        trial.set_user_attr("fold_scores", fold_scores)
        
        score = val_mean - (0.3 * val_std)
        return score

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction='maximize', sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=20)
    
    best_trial = study.best_trial
    bp = best_trial.params
    cv_f1_mean = np.mean(best_trial.user_attrs["fold_scores"])
    cv_f1_std = best_trial.user_attrs["cv_std"]
    cv_fold_scores = best_trial.user_attrs["fold_scores"]
    
    print(f"  Best params: {bp}")
    print(f"  Best CV Mean: {cv_f1_mean:.4f} (Std: {cv_f1_std:.4f})")

    # 2. Outer Evaluation Loop
    outer_scores = []
    all_y_test = []
    all_y_pred = []
    all_importances = []
    
    le = LabelEncoder()
    le.classes_ = np.array(CATEGORIES)
    
    for fold_idx, (train_idx, test_idx) in enumerate(splits):
        df_train_fold = df.iloc[train_idx].copy()
        df_test_fold = df.iloc[test_idx].copy()
        
        if "lag_violation_count" in active_features:
            df_train_fold, df_test_fold = add_dynamic_lags(df_train_fold, df_test_fold)
            
        X_train_fold = df_train_fold[active_features].values
        X_test_fold = df_test_fold[active_features].values
        
        y_train_fold = le.transform(df_train_fold["CCS_category"].values)
        y_test_fold = le.transform(df_test_fold["CCS_category"].values)
        
        # Inner split for final model early stopping
        inner_sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
        inner_splits = list(inner_sgkf.split(X_train_fold, y_train_fold, groups=df_train_fold["zone_cluster_id"]))
        
        rng = np.random.default_rng(42 + fold_idx)
        selected_fold = rng.integers(0, len(inner_splits))
        inner_train_idx, inner_val_idx = inner_splits[selected_fold]
        
        X_inner_tr, X_inner_val = X_train_fold[inner_train_idx], X_train_fold[inner_val_idx]
        y_inner_tr, y_inner_val = y_train_fold[inner_train_idx], y_train_fold[inner_val_idx]
    
        fold_model = LGBMClassifier(
            learning_rate=bp['lgb_lr'], 
            max_depth=bp['max_depth'],
            num_leaves=bp['num_leaves'], 
            reg_lambda=bp['reg_lambda'],
            reg_alpha=bp['reg_alpha'],
            min_child_samples=bp['min_child_samples'],
            colsample_bytree=bp['colsample_bytree'],
            subsample=bp['subsample'],
            subsample_freq=bp['subsample_freq'],
            random_state=42, 
            verbosity=-1,
            n_estimators=100
        )
        fold_model.fit(X_inner_tr, y_inner_tr, eval_set=[(X_inner_val, y_inner_val)], callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)])
        
        y_pred_fold = fold_model.predict(X_test_fold)
        test_f1 = f1_score(y_test_fold, y_pred_fold, average='weighted')
        outer_scores.append(test_f1)
        
        all_y_test.extend(y_test_fold)
        all_y_pred.extend(y_pred_fold)
        
        from sklearn.inspection import permutation_importance
        perm_result = permutation_importance(fold_model, X_test_fold, y_test_fold, n_repeats=5, random_state=42)
        all_importances.append(perm_result.importances_mean)
        
        # Save the final model from the last outer fold as a representative artifact
        if fold_idx == len(splits) - 1:
            best_model = fold_model
            
    outer_f1_mean = np.mean(outer_scores)
    outer_f1_std = np.std(outer_scores)
    
    print("\n[Validation Rejection Checks]")
    cv_holdout_gap = abs(outer_f1_mean - cv_f1_mean)
    
    print(f"  Outer F1 Mean: {outer_f1_mean:.4f}")
    print(f"  Outer F1 Std: {outer_f1_std:.4f}")
    print(f"  Outer Fold Scores: {[round(x, 4) for x in outer_scores]}")
    print(f"  CV Mean: {cv_f1_mean:.4f}")
    print(f"  CV Std: {cv_f1_std:.4f}")
    print(f"  |Outer F1 - CV Mean|: {cv_holdout_gap:.4f}")
    
    print(f"\n[Complexity Diagnostic]")
    print(f"  Max Depth: {bp['max_depth']}")
    print(f"  Num Leaves: {bp['num_leaves']}")

    if cv_f1_std > 0.04:
        print(f"Pipeline Rejected: cv_f1_std is {cv_f1_std:.4f} > 0.04")
        sys.exit(1)
    if cv_holdout_gap > 0.05:
        print(f"Pipeline Rejected: Holdout F1 vs CV Mean gap is {cv_holdout_gap:.4f} > 0.05")
        sys.exit(1)

    # 3. Metrics & Export
    all_y_test = np.array(all_y_test)
    all_y_pred = np.array(all_y_pred)
    
    y_pred_labels = le.inverse_transform(all_y_pred)
    y_test_labels = le.inverse_transform(all_y_test)
    
    acc = accuracy_score(all_y_test, all_y_pred)
    prec = precision_score(all_y_test, all_y_pred, average="weighted", zero_division=0)
    rec = recall_score(all_y_test, all_y_pred, average="weighted", zero_division=0)
    f1_macro = f1_score(all_y_test, all_y_pred, average="macro", zero_division=0)
    bal_acc = balanced_accuracy_score(all_y_test, all_y_pred)
    mcc = matthews_corrcoef(all_y_test, all_y_pred)
    kappa = cohen_kappa_score(all_y_test, all_y_pred)
    cm = confusion_matrix(all_y_test, all_y_pred, labels=np.arange(len(CATEGORIES))).tolist()
    
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

    mean_importances = np.mean(all_importances, axis=0)
    importance = dict(zip(active_features, mean_importances.round(4).tolist()))

    metrics = {
        "model_name":        "LGBMClassifier",
        "accuracy":          round(acc, 4),
        "precision_weighted": round(prec, 4),
        "recall_weighted":   round(rec, 4),
        "f1_weighted":       round(outer_f1_mean, 4),
        "f1_macro":          round(f1_macro, 4),
        "balanced_accuracy": round(bal_acc, 4),
        "mcc":               round(mcc, 4),
        "cohen_kappa":       round(kappa, 4),
        "cv_f1_mean":        round(cv_f1_mean, 4),
        "cv_f1_std":         round(cv_f1_std, 4),
        "cv_fold_scores":    [round(f, 4) for f in cv_fold_scores],
        "outer_f1_mean":     round(outer_f1_mean, 4),
        "outer_f1_std":      round(outer_f1_std, 4),
        "outer_fold_scores": [round(f, 4) for f in outer_scores],
        "confusion_matrix":  cm,
        "categories":        CATEGORIES,
        "per_class_metrics": per_class,
        "feature_importance": importance,
        "train_size":        int(len(X_train_fold)), # Approx from last fold
        "test_size":         int(len(all_y_test)), # Total evaluation size
        "n_features":        len(active_features),
        "feature_names":     active_features,
    }

    print(f"\n[Results] Test-set results:")
    print(f"  Accuracy : {acc:.4f}")
    print(f"  F1 Macro : {f1_macro:.4f}")
    print(f"  Outer F1 Mean: {outer_f1_mean:.4f}")
    
    joblib.dump(best_model, os.path.join(MODEL_DIR, "hotspot_model.pkl"))
    joblib.dump(le,         os.path.join(MODEL_DIR, "label_encoder.pkl"))

    with open(os.path.join(MODEL_DIR, "model_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    return best_model, metrics

if __name__ == "__main__":
    from preprocess import preprocess, save_processed
    from feature_engineering import create_grid_features, save_grid_features

    print("=" * 60)
    print("STEP 1 / 3 - Preprocessing")
    print("=" * 60)
    df = preprocess()
    save_processed(df)

    print("\n" + "=" * 60)
    print("STEP 2 / 3 - Feature Engineering")
    print("=" * 60)
    cells, feat_cols = create_grid_features(df)
    save_grid_features(cells)

    print("\n" + "=" * 60)
    print("STEP 3 / 3 - Model Training")
    print("=" * 60)
    model, metrics = train_models(cells)

    print("\n" + "=" * 60)
    print("OK  TRAINING PIPELINE COMPLETE")
    print("=" * 60)
