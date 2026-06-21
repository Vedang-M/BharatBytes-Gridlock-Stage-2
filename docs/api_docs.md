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
Full model evaluation metrics (accuracy, F1, cross-validation mean/std, confusion matrix, feature importance).

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

## Assistant & Insights Endpoints

### `POST /api/assistant/chat`
Conversational AI endpoint powered by LLM.

### `POST /api/assistant/audio`
Speech-to-Text conversational AI endpoint (Sarvam AI).

### `GET /api/insights/generate`
Generates automated contextual insights based on current dashboard data.

---

## Video Streaming Endpoints

### `WS /ws/stream`
WebSocket endpoint for real-time video streaming with YOLOv8-based vehicle detection and violation tracking overlays.

---

## Model API (Port 8001)

### `POST /predict`
Same as backend prediction endpoint.

### `GET /metrics`
Model evaluation metrics.

### `GET /health`
Health check.
