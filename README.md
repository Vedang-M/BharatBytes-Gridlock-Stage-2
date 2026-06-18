# ParkIQ – Parking-Induced Congestion Intelligence Platform

> **GridLock Hackathon · Stage 2 · Problem Statement 1**
> Built for Bengaluru Traffic Police (BTP)

## 🚦 What is ParkIQ?

ParkIQ is an AI-powered intelligence platform that analyzes 298,450+ parking violations in Bengaluru to identify congestion hotspots, predict future violations, and optimize police enforcement deployment.

### Key Features
- **ML-Powered Predictions** – Trained classifier (RandomForest/GradientBoosting) predicts congestion severity
- **DBSCAN Spatial Clustering** – Identifies illegal parking hotspots from GPS coordinates
- **Congestion Cost Score (CCS)** – Custom 0-10 metric combining 6 weighted factors
- **Live Enforcement Map** – Interactive heatmap with CCS-scored markers
- **7-Day Forecast** – Pattern-based violation risk predictions
- **ROI Calculator** – Quantifies enforcement value using NITI Aayog framework

---

## 🏗️ Architecture

```
Frontend (React + Vite)  → :5173
Backend  (FastAPI)       → :8000
Model API (FastAPI)      → :8001
```

See [docs/architecture.md](docs/architecture.md) for full system diagram.

---

## 🚀 Quick Start

### 1. Train the ML Model
```bash
cd model/src
pip install -r ../requirements.txt
python train.py          # Runs preprocess → feature eng → training
python evaluate.py       # Generates evaluation plots
```

### 2. Start the Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Start the Model API (optional)
```bash
cd model/api
uvicorn model_api:app --port 8001
```

### 4. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Open the Dashboard
Navigate to **http://localhost:5173**

---

## 📊 ML Model Performance

The model is trained on spatial grid-cell features (12 features per ~500m cell):

| Metric | Score |
|--------|-------|
| Accuracy | See `model/saved_models/model_metrics.json` |
| Precision (weighted) | Displayed on dashboard |
| Recall (weighted) | Displayed on dashboard |
| F1 Score (weighted) | Displayed on dashboard |
| Cohen's Kappa | Displayed on dashboard |

Evaluation artifacts saved to `model/saved_models/`:
- `confusion_matrix.png`
- `feature_importance.png`
- `roc_curves.png`
- `metrics_summary.png`

---

## 🗺️ Streamlit Version (Legacy)

The original Streamlit app is preserved:
```bash
pip install streamlit folium scikit-learn plotly pandas numpy scipy
streamlit run app.py
```

---

## 📁 Project Structure

```
├── frontend/        React + Vite dashboard
├── backend/         FastAPI REST API
├── model/           ML training pipeline + model API
├── docs/            Architecture, dataset, API docs
├── app.py           Legacy Streamlit app
└── docker-compose.yml
```

---

## 👥 Team

Built for **GridLock Hackathon Stage 2** – Flipkart BharatBytes
