# ParkIQ – Parking-Induced Congestion Intelligence Platform

> **GridLock Hackathon · Stage 2 · Problem Statement 1**  
> **Built for Bengaluru Traffic Police (BTP)**

ParkIQ is a state-of-the-art, AI-powered intelligence platform designed to analyze, predict, and optimize parking violation enforcement in Bengaluru. By processing 298,450+ parking violation records, the platform identifies high-density congestion hotspots, predicts violation risk levels using machine learning, and recommends optimized patrol schedules for BTP officers.

---

## ✨ Features

*   **DBSCAN Spatial Clustering** – Groups raw GPS coordinates of illegal parking events into high-density geographic hotspots.
*   **Congestion Cost Score (CCS)** – Calculates a custom traffic severity metric (`0` to `10`) for each hotspot using 6 weighted components (violation count, temporal density, average vehicle weight, etc.).
*   **ML-Powered Predictions** – A trained machine learning classifier (Random Forest / Gradient Boosting) predicts spatial congestion severity.
*   **7-Day Violation Risk Forecast** – Employs pattern-based historical analysis to forecast peak violation hours and risk levels.
*   **ROI & Economic Calculator** – Quantifies enforcement economic value and patrol yield based on the NITI Aayog gridlock framework.
*   **AI Copilot & Smart Insights** – Features an integrated speech-enabled AI assistant powered by Gemini and Sarvam AI to provide verbal/textual explanations of metrics, analytics, and patrol strategies.
*   **Interactive Live Map** – Visualizes hotspot clusters, violation heatmaps, and police patrol routing in real-time.

---

## 🏗️ System Architecture

ParkIQ operates as a multi-tier service consisting of a React frontend, a FastAPI controller backend, and a standalone ML inference API.

```
                  ┌──────────────────────────────────────────────┐
                  │            Frontend (React + Vite)           │
                  │             http://localhost:5173            │
                  │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
                  │  │ Dashboard │  │ Hotspots │  │ Analytics│    │
                  │  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
                  │       └──────────────┼─────────────┘          │
                  │                      │ Axios HTTP             │
                  └──────────────────────┼────────────────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │            Backend (FastAPI)                 │
                  │             http://localhost:8000            │
                  │  ┌───────────┐ ┌──────────────┐ ┌──────────┐ │
                  │  │ /hotspots │ │ /predictions │ │ /chat    │ │
                  │  └─────┬─────┘ └──────┬───────┘ └────┬─────┘ │
                  │        │              │              │       │
                  │  ┌─────┴─────┐ ┌──────┴───────┐ ┌────┴─────┐ │
                  │  │ HotspotSvc│ │PredictionSvc │ │ AI Svc   │ │
                  │  │ (DBSCAN)  │ │  (ML Model)  │ │ (LLM/STT)│ │
                  │  └───────────┘ └──────────────┘ └──────────┘ │
                  └──────────────────────┬───────────────────────┘
                                         ▼ (Optional HTTP)
                  ┌──────────────────────────────────────────────┐
                  │            Model Service (FastAPI)           │
                  │             http://localhost:8001            │
                  │  ┌────────────────────────────────────────┐  │
                  │  │   Trained Classifier (RF / GBT)        │  │
                  │  └────────────────────────────────────────┘  │
                  └──────────────────────────────────────────────┘
```

*   **Frontend (Port 5173)**: Built using React, Vite, and Tailwind/Vanilla CSS, featuring Mappls (MapmyIndia) interactive maps and responsive analytics.
*   **Backend API (Port 8000)**: Serves as the orchestrator, loading the raw CSV data, running DBSCAN clustering, computing CCS metrics, handling AI Assistant chat/audio endpoints, and calling model prediction routines.
*   **Model API (Port 8001)**: A microservice wrapping the scikit-learn models, providing prediction, health-check, and hot-reload hooks.

---

## 🛠️ Setup & Installation

Follow these steps to set up and run the entire ParkIQ stack locally.

### Prerequisites

Ensure you have the following installed on your machine:
*   **Python 3.10 or higher**
*   **Node.js 18 or higher** (including `npm`)
*   **Git**

---

### Step 1: Data Verification

ParkIQ processes a large dataset containing anonymized violation logs.
1. Locate the file `jan to may police violation_anonymized791b166.csv` in the root directory.
2. If it is still zipped, extract `jan to may police violation_anonymized791b166.csv.zip` into the root directory.

---

### Step 2: Configure Environment Variables

Both the backend and frontend rely on environment variables to access API endpoints and services.

#### Backend Configuration
Navigate to the `backend/` directory and check/create a `.env` file:
```bash
cd backend
```
Create a `.env` file containing:
```env
# Path to the primary raw dataset (relative or absolute)
CSV_PATH=../jan to may police violation_anonymized791b166.csv

# Path to the folder where trained models are saved
MODEL_DIR=../model/saved_models

# Server network settings
HOST=0.0.0.0
PORT=8000

# AI APIs (used for voice assistance and insights generation)
SARVAM_API_KEY=your_sarvam_api_key_here
```

#### Frontend Configuration
Navigate to the `frontend/` directory and check/create a `.env` file:
```bash
cd ../frontend
```
Create a `.env` file containing:
```env
# Mappls (MapmyIndia) Map SDK Token
VITE_MAPPLS_TOKEN=your_mappls_token_here
```

---

### Step 3: Train the Machine Learning Model

Before starting the server, you must preprocess the raw dataset and train the classification model.

1. Navigate to the `model/` directory:
   ```bash
   cd ../model
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the training script:
   ```bash
   cd src
   python train.py
   ```
   *Note: This script will clean the dataset, engineer spatial features based on 500m grid cells, apply SMOTE class balancing, and train a Random Forest and Gradient Boosting classifier.*
4. Run the evaluation script (optional):
   ```bash
   python evaluate.py
   ```
   *This saves performance plots (confusion matrix, feature importance, ROC curves) inside `model/saved_models/`.*

---

### Step 4: Start the Backend Server

The backend acts as the data engine for the dashboard.

1. Navigate to the `backend/` directory:
   ```bash
   cd ../../backend
   ```
2. Install python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI application:
   ```bash
   python -m app.main
   ```
   *The API documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).*

---

### Step 5: Start the Model API Service (Optional)

The backend is fully capable of running predictions by importing files directly from the model package. However, if you prefer running predictions via a standalone microservice:

1. Navigate to the `model/api/` directory:
   ```bash
   cd ../model/api
   ```
2. Run the server:
   ```bash
   python model_api.py
   ```
   *The model service will start on [http://localhost:8001](http://localhost:8001).*

---

### Step 6: Start the Frontend App

1. Navigate to the `frontend/` directory:
   ```bash
   cd ../../frontend
   ```
2. Install NPM packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your web browser and navigate to **[http://localhost:5173](http://localhost:5173)**.

---

## 📊 ML Model Diagnostics

The model divides coordinates into ~500m grid cells and extracts 12 spatial-temporal features.
Key model performance statistics are displayed dynamically on the **Model Diagnostics** tab in the dashboard.

Trained model artifacts are stored under `model/saved_models/`:
*   `classifier.joblib` – Saved RandomForest/GradientBoosting model.
*   `scaler.joblib` – Fitted StandardScaler.
*   `encoder.joblib` – Fitted LabelEncoder for target classes.
*   `model_metrics.json` – Diagnostic summaries (Accuracy, F1, Precision, Cohen's Kappa, etc.).

---

## 📁 Directory Structure

```
├── backend/                  # FastAPI Backend API Server
│   ├── app/
│   │   ├── routes/           # REST endpoints (hotspots, predictions, analytics, assistant)
│   │   ├── services/         # DBSCAN, calculations, and AI service logic
│   │   └── schemas/          # Pydantic schemas for requests/responses
│   ├── requirements.txt      # Backend Python dependencies
│   └── .env                  # Backend credentials & file paths
├── frontend/                 # React + Vite Client Dashboard
│   ├── src/
│   │   ├── api/              # Axios interface to REST API
│   │   ├── pages/            # View components (Dashboard, Hotspots, Diagnostics)
│   │   └── components/       # Common visual elements (Sidebar, Charts, AI Assistant)
│   ├── package.json          # Node dependencies and build scripts
│   └── .env                  # Map Token
├── model/                    # Python ML Training Pipeline & Model API
│   ├── api/                  # Standalone FastAPI model prediction service
│   ├── src/                  # Code for training, evaluation, and inference
│   ├── saved_models/         # Serialized classifiers, scalers, and metric files
│   └── requirements.txt      # ML dependencies (sklearn, imblearn, pandas)
├── docs/                     # Platform architecture and dataset specs
├── docker-compose.yml        # Multi-container local orchestration script
└── LICENSE                   # Project license file
```

---

## 👥 Team BharatBytes

Built for **Flipkart GridLock Hackathon Stage 2**
