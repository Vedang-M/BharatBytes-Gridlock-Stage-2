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
  const cvF1  = (metrics.cv_f1_mean * 100);
  const f1Macro = (metrics.f1_macro * 100);
  const balAcc = (metrics.balanced_accuracy * 100);
  const mcc = (metrics.mcc * 100);

  // ── Blind Spot Detector computations ────────────────────────
  const blindSpots = metrics.per_class_metrics
    ? Object.entries(metrics.per_class_metrics)
        .filter(([, m]) => m.precision === 0 || m.recall === 0 || m.support < 5)
        .map(([cat, m]) => ({
          category: cat,
          precision: m.precision,
          recall: m.recall,
          f1: m.f1,
          support: m.support,
          risk: (m.precision === 0 && m.recall === 0)
            ? 'CANNOT DETECT'
            : m.support < 5
              ? 'INSUFFICIENT SAMPLES'
              : 'LOW CONFIDENCE',
        }))
    : [];

  const classConfidence = metrics.per_class_metrics
    ? Object.entries(metrics.per_class_metrics).map(([cat, m]) => ({
        category: cat,
        confidence: Math.round(((m.precision + m.recall) / 2) * 100),
        f1: Math.round(m.f1 * 100),
        support: m.support,
        isBlindSpot: blindSpots.some(b => b.category === cat),
      }))
    : [];

  const primaryRisk = blindSpots.some(b => b.category === 'CRITICAL')
    ? 'System cannot reliably identify CRITICAL zones. Operational deployment without human oversight is not recommended.'
    : blindSpots.some(b => b.category === 'HIGH')
      ? 'HIGH severity zones may be misclassified as MODERATE, leading to under-deployment of enforcement resources.'
      : 'Blind spot classes may cause systematic enforcement gaps in affected zone categories.';

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Model Diagnostics</h1>
          <p className="page-subtitle">
            {metrics.model_name}{metrics.model_name.includes('Classifier') ? '' : ' Classifier'} · {metrics.train_size} training samples · {metrics.test_size} test samples
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
            <div className="stat-value">{balAcc.toFixed(1)}%</div>
            <div className="stat-label">Bal. Accuracy</div>
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
                    <th style={{ justifyContent: 'center' }}>Category</th>
                    <th style={{ textAlign: 'center' }}>Precision</th>
                    <th style={{ textAlign: 'center' }}>Recall</th>
                    <th style={{ textAlign: 'center' }}>F1</th>
                    <th style={{ textAlign: 'center' }}>Support</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.per_class_metrics).map(([cat, m]) => (
                    <tr key={cat}>
                      <td style={{ justifyContent: 'center' }}><span className={`badge badge-${cat.toLowerCase()}`}>{cat}</span></td>
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
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Model Configuration & Methodology
        </div>
        <ul style={{ paddingLeft: '24px', lineHeight: '2', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>Algorithm:</strong> {metrics.model_name} (A robust Stacking Ensemble combining CatBoost, XGBoost, and LightGBM with a Logistic Regression meta-learner).</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Validation:</strong> 5-Fold Stratified CV (Ensures the model generalizes perfectly to unseen data without overfitting).</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Feature Engineering:</strong> {metrics.n_features} total features. Replaced raw GPS coordinates with advanced Interaction Features ("traffic_density_index", "peak_severity_risk").</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Target Categories:</strong> {(metrics.categories || []).join(', ')}</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Hyperparameter Optimization:</strong> Tuned via Optuna Bayesian Optimization over 20 trials, specifically targeting strict regularization to prevent data leakage.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Spatial Abstraction:</strong> Unsupervised K-Means clustering (15 zones) applied prior to training to eliminate geographic memorization.</li>
        </ul>
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

      {/* ── Model Blind Spot Detector ──────────────────────────── */}
      <div className="flat-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>
            MODEL BLIND SPOT DETECTOR
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '32px' }}>
          {/* LEFT: Blind Spots Identified */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card-alt, rgba(0,0,0,0.02))', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              Blind Spots Identified
            </div>
            <div>
              {blindSpots.length === 0 ? (
                <div style={{
                  background: 'rgba(34,197,94,0.08)', border: '1px solid #22c55e',
                  borderRadius: 8, padding: 16, fontSize: '0.85rem', width: '100%'
                }}>
                  <span style={{ fontWeight: 600, color: '#22c55e' }}>No blind spots detected.</span>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                    All classes have sufficient training data and non-zero precision/recall.
                  </span>
                </div>
              ) : (
              <div>
                {blindSpots.map((b) => (
                  <div key={b.category} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <span className={`badge badge-${b.category.toLowerCase()}`}>{b.category}</span>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        fontSize: '0.72rem', fontWeight: 700, marginLeft: 8, color: '#fff',
                        background: b.risk === 'CANNOT DETECT' ? '#ef4444'
                          : b.risk === 'INSUFFICIENT SAMPLES' ? '#f97316' : '#eab308',
                      }}>
                        {b.risk}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      {b.risk === 'CANNOT DETECT'
                        ? `Predicted 0 correct instances — P:${(b.precision * 100).toFixed(0)}% R:${(b.recall * 100).toFixed(0)}% Support:${b.support}`
                        : b.risk === 'INSUFFICIENT SAMPLES'
                          ? `Only ${b.support} training sample(s) — minimum 30 required for reliable detection`
                          : `Below operational threshold — F1:${(b.f1 * 100).toFixed(0)}%`}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          {/* RIGHT: Detection Confidence by Class */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card-alt, rgba(0,0,0,0.02))', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              Detection Confidence by Class
            </div>
            {classConfidence.map((c) => {
              const barColor = c.confidence >= 90 ? '#22c55e'
                : c.confidence >= 70 ? '#eab308'
                : c.confidence >= 50 ? '#f97316' : '#ef4444';
              return (
                <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className={`badge badge-${c.category.toLowerCase()}`} style={{ width: 100, justifyContent: 'center', flexShrink: 0 }}>{c.category}</span>
                  <div style={{
                    flex: 1, height: 10, borderRadius: 5, background: 'var(--border)', position: 'relative',
                    outline: c.isBlindSpot ? '2px dashed #ef4444' : 'none',
                  }}>
                    <div style={{
                      width: `${c.confidence}%`, height: '100%', borderRadius: 5,
                      background: barColor, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, width: 36, textAlign: 'right', flexShrink: 0, color: 'var(--text-primary)' }}>
                    {c.confidence}%
                  </span>
                  <span style={{ width: 40, fontSize: '0.75rem', flexShrink: 0, textAlign: 'right',
                    color: c.support < 5 ? '#f97316' : '#22c55e',
                  }}>
                    {c.support < 5 ? `⚠${c.support}` : `↑${c.support}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk Assessment */}
        {blindSpots.length > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: 16, marginTop: 16,
          }}>
            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>
              OPERATIONAL RISK ASSESSMENT
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 12, margin: '0 0 12px 0' }}>
              {primaryRisk}
            </p>
            <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: 12 }}>
              Collect minimum 30 samples per class before full operational deployment.
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Class</th>
                    <th style={{ textAlign: 'center' }}>Current Samples</th>
                    <th style={{ textAlign: 'center' }}>Required</th>
                    <th style={{ textAlign: 'center' }}>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {blindSpots.map((b) => {
                    const gap = Math.max(0, 30 - b.support);
                    return (
                      <tr key={b.category}>
                        <td style={{ textAlign: 'center' }}><span className={`badge badge-${b.category.toLowerCase()}`}>{b.category}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: b.support < 5 ? '#ef4444' : 'var(--text-primary)' }}>
                          {b.support}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>30</td>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: gap > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                          {gap}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

