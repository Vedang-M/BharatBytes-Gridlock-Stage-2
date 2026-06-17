# ParkIQ Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                    │
│                     http://localhost:5173                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Dashboard │  │ Hotspots │  │ Analytics│                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       └──────────────┼─────────────┘                         │
│                      │  Axios /api/*                          │
└──────────────────────┼───────────────────────────────────────┘
                       │ (Vite proxy)
┌──────────────────────┼───────────────────────────────────────┐
│              Backend (FastAPI)  :8000                          │
│  ┌───────────┐ ┌──────────────┐ ┌────────────┐              │
│  │ /hotspots │ │ /predictions │ │ /analytics │              │
│  └─────┬─────┘ └──────┬───────┘ └──────┬─────┘              │
│        │               │                │                     │
│  ┌─────┴─────┐ ┌──────┴───────┐ ┌──────┴─────┐             │
│  │ HotspotSvc│ │PredictionSvc │ │AnalyticsSvc│             │
│  │ (DBSCAN)  │ │  (ML Model)  │ │ (Temporal) │             │
│  └───────────┘ └──────────────┘ └────────────┘              │
└──────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────┐
│             Model Service (FastAPI)  :8001                    │
│  ┌──────────────────────────────────┐                        │
│  │  Trained Classifier (RF / GBT)   │                        │
│  │  + StandardScaler + LabelEncoder │                        │
│  └──────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
```

## ML Pipeline

1. **Preprocess** – Clean 298k violations, parse JSON, engineer features
2. **Feature Engineering** – Spatial grid cells (~500m), 12 features per cell
3. **Training** – RandomForest + GradientBoosting with 5-fold CV + GridSearchCV
4. **Evaluation** – Accuracy, F1, confusion matrix, ROC, feature importance
5. **Inference** – REST API at :8001/predict

## Data Flow

1. User opens frontend → loads KPIs, map, charts from backend
2. Backend loads CSV at startup → DBSCAN clustering → CCS scoring
3. Predictions use trained model from `model/saved_models/`
4. All analytics computed server-side, returned as JSON
