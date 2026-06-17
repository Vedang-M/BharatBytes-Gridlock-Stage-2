# ParkIQ API Documentation

Base URL: `http://localhost:8000/api`

## Hotspot Endpoints

### `GET /api/hotspots`
Returns DBSCAN clusters ranked by CCS score.
- **Query**: `top_n` (int, default=50)

### `GET /api/hotspots/heatmap`
Returns lat/lon points for heatmap visualization.
- **Query**: `sample_n` (int, default=30000)

### `GET /api/hotspots/schedule`
Auto-generated enforcement deployment schedule.
- **Query**: `n_zones` (int, default=8)

### `GET /api/hotspots/summary`
KPI summary (total violations, critical zones, ROI).

---

## Prediction Endpoints

### `POST /api/predictions/predict`
ML model inference for a grid cell's features.
- **Body**: JSON with 12 feature values
- **Returns**: `{ category, probabilities, confidence }`

### `GET /api/predictions/model-metrics`
Full model evaluation metrics (accuracy, F1, confusion matrix, feature importance).

### `GET /api/predictions/forecast`
7-day violation risk forecast.

---

## Analytics Endpoints

### `GET /api/analytics/temporal`
Hourly, daily, and monthly violation aggregations.

### `GET /api/analytics/heatmap`
Hour × Day-of-week violation counts.

### `GET /api/analytics/trend`
Daily violation counts + 7-day rolling average.

### `GET /api/analytics/violations`
Top violation types breakdown.

### `GET /api/analytics/vehicles`
Vehicle type distribution.

### `GET /api/analytics/roi`
ROI calculation with adjustable parameters.
- **Query**: `vot`, `vph`, `delay`, `fuel`, `sessions`, `session_hr`, `top_n`

---

## Model API (Port 8001)

### `POST /predict`
Same as backend prediction endpoint.

### `GET /metrics`
Model evaluation metrics.

### `GET /health`
Health check.
