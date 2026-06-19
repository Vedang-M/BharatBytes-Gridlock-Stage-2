"""
ParkIQ – Model Evaluation & Visualisation
Generates confusion matrix, feature importance, and ROC plots.
"""
import os
import json
import numpy as np
import joblib
import matplotlib
matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    RocCurveDisplay,
    classification_report,
)
from sklearn.preprocessing import label_binarize

# ── Paths ──────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(PROJECT_ROOT, "model", "saved_models")

CATEGORIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"]
FEATURE_COLS = [
    "weekend_pct",
    "unique_hours",
    "n_violations_avg",
    "unique_vehicle_types",
    "temporal_entropy",
    "lat_center",
    "lon_center"
]


def load_artifacts():
    model = joblib.load(os.path.join(MODEL_DIR, "hotspot_model.pkl"))
    le    = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))
    data  = np.load(os.path.join(MODEL_DIR, "test_data.npz"))
    with open(os.path.join(MODEL_DIR, "model_metrics.json")) as f:
        metrics = json.load(f)
    return model, le, data, metrics


def plot_confusion_matrix(y_true, y_pred, le):
    fig, ax = plt.subplots(figsize=(8, 6))
    ConfusionMatrixDisplay.from_predictions(
        le.inverse_transform(y_true),
        le.inverse_transform(y_pred),
        labels=CATEGORIES,
        cmap="Blues",
        ax=ax,
        colorbar=False,
    )
    ax.set_title("Confusion Matrix — CCS Category Prediction", fontsize=14, fontweight="bold")
    plt.tight_layout()
    path = os.path.join(MODEL_DIR, "confusion_matrix.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved → {path}")


def plot_feature_importance(model, feature_names):
    if not hasattr(model, "feature_importances_"):
        print("  (model has no feature_importances_ — skipping)")
        return
    imp = model.feature_importances_
    idx = np.argsort(imp)

    fig, ax = plt.subplots(figsize=(8, 6))
    colors = sns.color_palette("viridis", len(idx))
    ax.barh(
        [feature_names[i] for i in idx],
        imp[idx],
        color=colors,
    )
    ax.set_xlabel("Importance")
    ax.set_title("Feature Importance — Hotspot Severity Prediction", fontsize=14, fontweight="bold")
    plt.tight_layout()
    path = os.path.join(MODEL_DIR, "feature_importance.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved → {path}")


def plot_roc_curves(model, X_test, y_test, le, y_prob):
    """One-vs-rest ROC curves for each CCS category."""
    n_classes = len(CATEGORIES)
    y_bin = label_binarize(y_test, classes=list(range(n_classes)))

    if y_prob is None or len(y_prob) == 0:
        print("  (model has no predict_proba — skipping ROC)")
        return

    y_score = y_prob

    fig, axes = plt.subplots(1, n_classes, figsize=(5 * n_classes, 4))
    if n_classes == 1:
        axes = [axes]

    for i, (cat, ax) in enumerate(zip(CATEGORIES, axes)):
        if i < y_bin.shape[1]:
            if i in model.classes_:
                col_idx = list(model.classes_).index(i)
                score = y_score[:, col_idx]
            else:
                score = np.zeros(len(y_test))
            RocCurveDisplay.from_predictions(
                y_bin[:, i], score, name=cat, ax=ax,
            )
            ax.set_title(f"ROC — {cat}")
            ax.plot([0, 1], [0, 1], "k--", alpha=0.3)

    plt.tight_layout()
    path = os.path.join(MODEL_DIR, "roc_curves.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved → {path}")


def plot_metrics_summary(metrics):
    """Bar chart of weighted precision / recall / F1 + accuracy."""
    names = ["Accuracy", "Precision", "Recall", "F1 Score", "Cohen κ"]
    values = [
        metrics["accuracy"],
        metrics["precision_weighted"],
        metrics["recall_weighted"],
        metrics["f1_weighted"],
        metrics["cohen_kappa"],
    ]
    colors = ["#2563eb", "#7c3aed", "#db2777", "#059669", "#d97706"]

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(names, values, color=colors, edgecolor="white", linewidth=1.2)
    for bar, v in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.01,
            f"{v:.2%}",
            ha="center", va="bottom", fontweight="bold", fontsize=12,
        )
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("Score")
    ax.set_title(
        f"Model Performance — {metrics['model_name']}",
        fontsize=14, fontweight="bold",
    )
    ax.spines[["top", "right"]].set_visible(False)
    plt.tight_layout()
    path = os.path.join(MODEL_DIR, "metrics_summary.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved → {path}")


# ── CLI entry ──────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("MODEL EVALUATION")
    print("=" * 60)

    model, le, data, metrics = load_artifacts()
    X_test, y_test, y_pred = data["X_test"], data["y_test"], data["y_pred"]
    y_prob = data["y_prob"] if "y_prob" in data else []

    print("\nGenerating plots …")
    plot_confusion_matrix(y_test, y_pred, le)
    plot_feature_importance(model, FEATURE_COLS)
    plot_roc_curves(model, X_test, y_test, le, y_prob)
    plot_metrics_summary(metrics)

    print("\n📊 Classification report:")
    print(
        classification_report(
            le.inverse_transform(y_test),
            le.inverse_transform(y_pred),
            labels=CATEGORIES,
            target_names=CATEGORIES,
            zero_division=0,
        )
    )
    print("✅ Evaluation complete!")
