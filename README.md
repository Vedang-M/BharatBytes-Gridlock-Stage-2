# Project Structure

```text
project-root/
│
├── frontend/
│   ├── public/
│   │
│   ├── src/
│   │   ├── api/
│   │   │   └── backendApi.js
│   │   │
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── MapView.jsx
│   │   │   ├── HeatmapLayer.jsx
│   │   │   ├── HotspotCard.jsx
│   │   │   └── StatsCard.jsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Hotspots.jsx
│   │   │   └── Analytics.jsx
│   │   │
│   │   ├── hooks/
│   │   ├── utils/
│   │   │
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   │   ├── hotspots.py
│   │   │   ├── predictions.py
│   │   │   └── analytics.py
│   │   │
│   │   ├── services/
│   │   │   ├── hotspot_service.py
│   │   │   ├── prediction_service.py
│   │   │   └── analytics_service.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── hotspot.py
│   │   │   └── prediction.py
│   │   │
│   │   ├── utils/
│   │   │
│   │   └── main.py
│   │
│   ├── requirements.txt
│   └── .env
│
├── model/
│   ├── data/
│   │   ├── raw/
│   │   └── processed/
│   │
│   ├── notebooks/
│   │   └── eda.ipynb
│   │
│   ├── src/
│   │   ├── preprocess.py
│   │   ├── feature_engineering.py
│   │   ├── train.py
│   │   ├── evaluate.py
│   │   └── predict.py
│   │
│   ├── saved_models/
│   │   └── hotspot_model.pkl
│   │
│   ├── api/
│   │   └── model_api.py
│   │
│   └── requirements.txt
│
├── docs/
│   ├── architecture.png
│   ├── dataset_description.md
│   └── api_docs.md
│
├── docker-compose.yml
├── README.md
└── .gitignore
```

# Communication Flow

```text
Frontend (React)
      │
      ▼
Backend (FastAPI)
      │
      ▼
Model Service
      │
      ▼
Prediction Response
      │
      ▼
Frontend Dashboard
```

