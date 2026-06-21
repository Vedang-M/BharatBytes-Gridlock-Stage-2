# ParkIQ Architecture

## System Overview

```
                   ┌──────────────────────────────────────────────┐
                   │            Frontend (React + Vite)           │
                   │             http://localhost:5173            │
                   │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
                   │  │ Dashboard │  │ Hotspots │  │ Analytics│    │
                   │  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
                   │       └──────────────┼─────────────┘          │
                   │                      │ Axios HTTP & WS        │
                   └──────────────────────┼────────────────────────┘
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │            Backend (FastAPI)                 │
                   │             http://localhost:8000            │
                   │  ┌───────────┐ ┌──────────────┐ ┌──────────┐ │
                   │  │ /hotspots │ │ /predictions │ │ /chat    │ │
                   │  │ /stream   │ │ /analytics   │ │ /insights│ │
                   │  └─────┬─────┘ └──────┬───────┘ └────┬─────┘ │
                   │        │              │              │       │
                   │  ┌─────┴─────┐ ┌──────┴───────┐ ┌────┴─────┐ │
                   │  │ HotspotSvc│ │PredictionSvc │ │ AI Svc   │ │
                   │  │ (DBSCAN)  │ │  (ML Model)  │ │ (LLM/STT)│ │
                   │  └───────────┘ └──────────────┘ └────┬─────┘ │
                   │                                      │       │
                   │  ┌────────────────────────────────┐  │       │
                   │  │  VideoDetectionSvc (YOLOv8)    │  │       │
                   │  └────────────────────────────────┘  │       │
                   └──────────────────────┬───────────────┴───────┘
                                          ▼ (Optional HTTP)
                   ┌──────────────────────────────────────────────┐
                   │            Model Service (FastAPI)           │
                   │             http://localhost:8001            │
                   │  ┌────────────────────────────────────────┐  │
                   │  │   LightGBM Classifier (Optuna Tuned)   │  │
                   │  └────────────────────────────────────────┘  │
                   └──────────────────────────────────────────────┘
```

## ML Pipeline

1. **Preprocess** – Clean 298k violations, parse JSON, engineer features
2. **Feature Engineering** – Spatial grid cells (~500m), 12 features per cell + Dynamic Spatial Lags
3. **Training** – LightGBM Classifier tuned via Optuna (20 trials) + 5-fold Outer CV with Inner Early Stopping
4. **Evaluation** – Accuracy, F1, CV Mean/Std Gap Analysis, confusion matrix, feature permutation importance
5. **Inference** – REST API at :8001/predict

## Real-Time Computer Vision Pipeline

1. **Video Streaming** – Connects to live CCTV/video feeds over WebSocket (`/ws/stream`)
2. **Object Detection** – Utilizes YOLOv8 nano to detect vehicles in real-time
3. **Tracking & Violations** – Monitors object tracking history; flags stationary vehicles beyond predefined thresholds as illegal parking violations
4. **Live Metrics** – Computes live Congestion Cost Score (CCS) and overlays alerting graphics directly onto the video feed

## Data Flow

1. User opens frontend → loads KPIs, map, charts from backend
2. Backend loads CSV at startup → DBSCAN clustering → CCS scoring
3. Predictions use trained model from `model/saved_models/`
4. All analytics computed server-side, returned as JSON
5. Live feed components establish WebSocket connection for real-time YOLOv8 frame streaming and live metric updates
