import os
import json

_metrics = None
_bins = []

def _load_metrics():
    global _metrics, _bins
    if _metrics is not None:
        return
    path = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "model", "saved_models", "model_metrics.json"
    )
    path = os.path.abspath(path)
    try:
        with open(path, "r") as f:
            _metrics = json.load(f)
            _bins = _metrics.get("bins", [])
    except Exception as e:
        print(f"[CCS Helper] Failed to load model_metrics.json: {e}")
        _metrics = {}
        _bins = [0.0, 1.5, 3.0, 4.5, 10.0]  # Fallback

def get_ccs_category(score: float) -> str:
    _load_metrics()
    
    # Bins expected: [min, q1, q2, q3, max]
    # e.g. [0, 1.2, 2.8, 5.1, 10]
    # We map to LOW, MODERATE, HIGH, CRITICAL
    
    if len(_bins) >= 5:
        if score > _bins[3]:
            return "CRITICAL"
        if score > _bins[2]:
            return "HIGH"
        if score > _bins[1]:
            return "MODERATE"
        return "LOW"
    else:
        # Fallback if bins are weird
        if score >= 4.5: return "CRITICAL"
        if score >= 3.0: return "HIGH"
        if score >= 1.5: return "MODERATE"
        return "LOW"

def get_ccs_color(score: float):
    cat = get_ccs_category(score)
    if cat == "CRITICAL":
        return (68, 68, 239)    # Red in BGR
    if cat == "HIGH":
        return (22, 115, 249)   # Orange in BGR
    if cat == "MODERATE":
        return (8, 179, 234)    # Yellow in BGR
    return (129, 185, 16)       # Green in BGR
