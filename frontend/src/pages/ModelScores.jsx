import { useState, useEffect } from 'react';
import { getModelMetrics } from '../api/backendApi';

function ConfusionMatrix({ matrix, categories }) {
  if (!matrix || matrix.length === 0) return null;
  const maxVal = Math.max(...matrix.flat(), 1);

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
              <td><strong>{categories[i]}</strong></td>
              {row.map((val, j) => {
                const isCorrect = i === j;
                return (
                  <td key={j} className="cm-cell" style={{
                    background: isCorrect ? 'rgba(37, 99, 235, 0.1)' : val > 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                    fontWeight: isCorrect ? 600 : 400,
                    color: isCorrect ? '#2563eb' : val > 0 ? '#ef4444' : 'var(--text-muted)',
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
              style={{ width: `${(f.value / maxVal) * 100}%` }}
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
          <h1 className="page-title">Model Performance</h1>
        </div>
        <div className="flat-card" style={{ textAlign: 'center', padding: 60 }}>
          <h2 style={{ marginBottom: 8 }}>Model Not Trained Yet</h2>
          <p style={{ color: 'var(--text-muted)' }}>
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
        <h1 className="page-title">Model Performance</h1>
        <p className="page-subtitle">
          {metrics.model_name} Classifier · {metrics.train_size} training samples · {metrics.test_size} test samples
        </p>
      </div>

      <div className="grid-5" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{acc.toFixed(1)}%</div>
          <div className="stat-label">Accuracy</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{f1.toFixed(1)}%</div>
          <div className="stat-label">F1 Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{kappa.toFixed(1)}%</div>
          <div className="stat-label">Cohen Kappa</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{prec.toFixed(1)}%</div>
          <div className="stat-label">Precision (Weighted)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{cvF1.toFixed(1)}%</div>
          <div className="stat-label">Cross-Validation F1</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">Per-Class Performance</div>
          {metrics.per_class_metrics ? (
            <table className="data-table">
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
                    <td style={{ textAlign: 'center' }}>{(m.precision * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: 'center' }}>{(m.recall * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: 'center' }}>{(m.f1 * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: 'center' }}>{m.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data available</p>
          )}

          <div style={{ marginTop: 24 }}>
            <div className="card-title">Model Configuration</div>
            <table className="data-table">
              <tbody>
                <tr><td>Algorithm</td><td>{metrics.model_name}</td></tr>
                <tr><td>Validation</td><td>5-Fold Stratified CV</td></tr>
                <tr><td>Features</td><td>{metrics.n_features}</td></tr>
                <tr><td>Categories</td><td>{(metrics.categories || []).join(', ')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">Confusion Matrix</div>
          <ConfusionMatrix matrix={metrics.confusion_matrix} categories={metrics.categories || []} />
          <div style={{ marginTop: 16, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Blue indicates correct predictions (diagonal). Red indicates misclassifications.
          </div>
        </div>
      </div>

      <div className="flat-card" style={{ marginBottom: 24 }}>
        <div className="card-title">Feature Importance</div>
        {metrics.feature_importance ? (
          <FeatureImportanceBars features={metrics.feature_importance} />
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No data available</p>
        )}
      </div>
    </div>
  );
}
