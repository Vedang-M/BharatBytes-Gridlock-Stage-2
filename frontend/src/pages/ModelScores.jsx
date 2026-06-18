import { useState, useEffect } from 'react';
import { getModelMetrics } from '../api/backendApi';

function ConfusionMatrix({ matrix, categories }) {
  if (!matrix || matrix.length === 0) return null;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: 120 }}>True ↓ / Pred →</th>
            {categories.map((c) => (
              <th key={c} style={{ textAlign: 'center' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td><strong style={{ color: 'var(--text-primary)' }}>{categories[i]}</strong></td>
              {row.map((val, j) => {
                const isCorrect = i === j;
                return (
                  <td key={j} className="cm-cell" style={{
                    background: isCorrect ? 'rgba(59, 130, 246, 0.15)' : val > 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                    border: isCorrect ? '1px solid var(--accent)' : '1px solid transparent',
                    fontWeight: 700,
                    color: isCorrect ? 'var(--accent)' : val > 0 ? 'var(--status-critical)' : 'var(--text-muted)',
                  }}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureImportanceBars({ features }) {
  const sorted = Object.entries(features)
    .map(([name, val]) => ({ name: name.replace(/_/g, ' '), value: val }))
    .sort((a, b) => b.value - a.value);
  const maxVal = Math.max(...sorted.map((f) => f.value), 0.001);

  return (
    <div>
      {sorted.map((f) => (
        <div key={f.name} className="fi-bar-wrapper">
          <div className="fi-bar-label">{f.name}</div>
          <div className="fi-bar-track">
            <div
              className="fi-bar-fill"
              style={{ width: `${Math.max(0, (f.value / maxVal) * 100)}%` }}
            />
          </div>
          <div className="fi-bar-value">{(f.value * 100).toFixed(1)}%</div>
        </div>
      ))}
    </div>
  );
}

export default function ModelScores() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getModelMetrics()
      .then((m) => setMetrics(m))
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">Loading model performance data...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Model Performance</h1>
          </div>
        </div>
        <div className="flat-card" style={{ textAlign: 'center', padding: 60 }}>
          <h2 style={{ marginBottom: 12 }}>Model Not Trained Yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            Run <code>cd model/src && python train.py</code> to train the classifier.
          </p>
        </div>
      </div>
    );
  }

  const acc   = (metrics.accuracy * 100);
  const prec  = (metrics.precision_weighted * 100);
  const rec   = (metrics.recall_weighted * 100);
  const f1    = (metrics.f1_weighted * 100);
  const kappa = (metrics.cohen_kappa * 100);
  const cvF1  = (metrics.cv_f1_score * 100);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Model Diagnostics</h1>
          <p className="page-subtitle">
            {metrics.model_name} Classifier · {metrics.train_size} training samples · {metrics.test_size} test samples
          </p>
        </div>
      </div>

      <div className="grid-5" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-content">
            <div className="stat-value">{acc.toFixed(1)}%</div>
            <div className="stat-label">Accuracy</div>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'var(--status-low-glow)', color: 'var(--status-low)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <div className="stat-value">{f1.toFixed(1)}%</div>
            <div className="stat-label">F1 Score</div>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <div className="stat-value">{kappa.toFixed(1)}%</div>
            <div className="stat-label">Cohen Kappa</div>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'var(--status-high-glow)', color: 'var(--status-high)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <div className="stat-value">{prec.toFixed(1)}%</div>
            <div className="stat-label">Precision</div>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'var(--status-moderate-glow)', color: 'var(--status-moderate)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <div className="stat-value">{cvF1.toFixed(1)}%</div>
            <div className="stat-label">Cross-Val F1</div>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'var(--status-low-glow)', color: 'var(--status-low)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            Per-Class Performance
          </div>
          {metrics.per_class_metrics ? (
            <div className="table-responsive">
              <table className="data-table table-grid-perclass">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th style={{ textAlign: 'center' }}>Precision</th>
                    <th style={{ textAlign: 'center' }}>Recall</th>
                    <th style={{ textAlign: 'center' }}>F1</th>
                    <th style={{ textAlign: 'center' }}>Support</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.per_class_metrics).map(([cat, m]) => (
                    <tr key={cat}>
                      <td><span className={`badge badge-${cat.toLowerCase()}`}>{cat}</span></td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{(m.precision * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{(m.recall * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{(m.f1 * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{m.support}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data available</p>
          )}

          <div style={{ marginTop: 24 }}>
            <div className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Model Configuration
            </div>
            <div className="table-responsive">
              <table className="data-table table-grid-config">
                <tbody>
                  <tr><td>Algorithm</td><td style={{ fontWeight: 600 }}>{metrics.model_name}</td></tr>
                  <tr><td>Validation</td><td style={{ fontWeight: 600 }}>5-Fold Stratified CV</td></tr>
                  <tr><td>Features</td><td style={{ fontWeight: 600 }}>{metrics.n_features}</td></tr>
                  <tr><td>Categories</td><td style={{ fontWeight: 600 }}>{(metrics.categories || []).join(', ')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="13" x2="15" y2="13"></line>
              <line x1="9" y1="17" x2="13" y2="17"></line>
            </svg>
            Confusion Matrix
          </div>
          <ConfusionMatrix matrix={metrics.confusion_matrix} categories={metrics.categories || []} />
          <div style={{ marginTop: 16, fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Glowing Blue indicates correct classifications (diagonal). Soft Red indicates misclassifications.
          </div>
        </div>
      </div>

      <div className="flat-card" style={{ marginBottom: 24 }}>
        <div className="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20v-6M6 20V10M18 20V4"></path>
          </svg>
          Feature Importance
        </div>
        {metrics.feature_importance && Object.keys(metrics.feature_importance).length > 0 ? (
          <FeatureImportanceBars features={metrics.feature_importance} />
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No data available — retrain the model to generate feature importance.</p>
        )}
      </div>
    </div>
  );
}
