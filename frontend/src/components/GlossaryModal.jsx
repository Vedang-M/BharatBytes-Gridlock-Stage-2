import { useState, useEffect, useCallback } from 'react';
import './GlossaryModal.css';

const GLOSSARY = [
  {
    section: 'Overview',
    icon: '📊',
    terms: [
      { term: 'CCS (Congestion Cost Score)', definition: 'A metric from 0 to 10 measuring the severity of traffic congestion and violations in an area.' },
      { term: 'Total Violations', definition: 'The cumulative count of all recorded traffic violations within the specified time period.' },
      { term: 'Hotspot Clusters', definition: 'Groups of geographically close traffic violations identified by the DBSCAN algorithm.' },
      { term: 'Critical Zones', definition: 'Areas assigned the highest CCS category, indicating frequent and severe traffic violations.' },
      { term: 'Daily ROI (Top 10)', definition: 'Estimated daily revenue recoverable by deploying officers to the top 10 highest-scoring hotspot zones.' },
      { term: 'Peak-Hour Share', definition: 'The percentage of traffic violations that occur during morning (7–11 AM) or evening (5–9 PM) rush hours.' },
      { term: 'Enforcement Opportunity Cost', definition: 'Estimated economic loss from unpatrolled zones today.' },
      { term: 'Coverage Gap', definition: 'The percentage of identified hotspot zones that currently have no police patrol assigned.' },
      { term: 'HIGH+ Zones Exposed', definition: 'The number of HIGH or CRITICAL severity zones with no scheduled police coverage.' },
    ],
  },
  {
    section: 'Hotspots Analysis',
    icon: '🔥',
    terms: [
      { term: 'DBSCAN', definition: 'Density-Based Spatial Clustering of Applications with Noise: an algorithm that groups nearby traffic violations to detect dense hotspots.' },
      { term: 'CCS Category', definition: 'The severity level assigned to a hotspot based on its Congestion Cost Score: LOW (0–3), MODERATE (3–5), HIGH (5–7), or CRITICAL (7–10).' },
      { term: 'Peak %', definition: 'The percentage of violations in a hotspot that occur during peak hours (7–11 AM or 5–9 PM).' },
      { term: 'Violation Types', definition: 'The categories of traffic violations recorded in an area, such as speeding or signal jumping.' },
    ],
  },
  {
    section: 'Temporal Analytics',
    icon: '📈',
    terms: [
      { term: 'Temporal Analytics', definition: 'The analysis of traffic violation trends over time, including hourly, daily, and monthly patterns.' },
      { term: 'Rolling 7-Day Average', definition: 'The average number of violations over the past 7 days, used to identify overall trends.' },
      { term: 'Forecast (Prophet Model)', definition: 'A time-series forecasting model that predicts traffic violation trends for the next 7 days based on historical data.' },
      { term: 'What-If Zone Planner', definition: 'A simulation tool for modeling hypothetical scenarios, such as adjusting police deployment, to estimate impacts on violations and revenue.' },
      { term: 'Peak Hours', definition: 'Time periods with the highest concentration of traffic violations, typically 7–11 AM and 5–9 PM.' },
    ],
  },
  {
    section: 'Model Performance',
    icon: '🤖',
    terms: [
      { term: 'Stacking Ensemble', definition: 'A machine learning method combining multiple models (CatBoost, XGBoost, LightGBM) with a meta-learner (Logistic Regression) to improve accuracy.' },
      { term: 'Optuna Bayesian Optimization', definition: 'An automated hyperparameter tuning framework used to find the optimal model configuration over multiple trials.' },
      { term: 'K-Means Spatial Clustering', definition: 'An unsupervised learning technique used to group geographic areas into distinct zones for pattern recognition.' },
      { term: '5-Fold Stratified Cross-Validation', definition: 'A validation technique that splits data into 5 segments, training on 4 and testing on 1 iteratively, to ensure model generalization.' },
      { term: 'Accuracy', definition: 'The percentage of total predictions (across all categories) that the model classified correctly.' },
      { term: 'F1 Score', definition: 'A metric combining Precision and Recall into a single value to evaluate overall model performance.' },
      { term: 'Cohen\'s Kappa', definition: 'A metric that measures model accuracy while accounting for the possibility of correct predictions occurring by chance.' },
      { term: 'Cross-Val F1', definition: 'The average F1 score achieved across the 5 validation folds, indicating expected real-world performance consistency.' },
      { term: 'Precision', definition: 'The proportion of positive predictions that are correct, indicating the accuracy of critical zone identification.' },
      { term: 'Recall', definition: 'The proportion of actual critical zones successfully identified by the model.' },
      { term: 'Balanced Accuracy', definition: 'The average recall across all categories, providing an unbiased evaluation when category sizes are unequal.' },
      { term: 'Support', definition: 'The actual number of occurrences of a specific class or category within the dataset.' },
      { term: 'Confusion Matrix', definition: 'A table used to evaluate the performance of a classification model by comparing predicted and actual categories.' },
      { term: 'Feature Importance (SHAP)', definition: 'An analytical method used to determine which input variables most significantly influence the model\'s predictions.' },
      { term: 'Model Blind Spot Detector', definition: 'Classes where the model cannot reliably predict. It highlights categories where the model exhibits 0% Precision or Recall, indicating an inability to reliably detect that class.' },
    ],
  },
  {
    section: 'Live Feed',
    icon: '🎥',
    terms: [
      { term: 'YOLOv8', definition: 'A real-time object detection model used to classify vehicles and traffic violations within a video stream.' },
      { term: 'FPS (Frames Per Second)', definition: 'The number of video frames processed per second by the detection system.' },
      { term: 'Bounding Box', definition: 'A rectangular marker drawn around a detected vehicle or violation in the video feed.' },
      { term: 'CCS Score (Live)', definition: 'A real-time Congestion Cost Score calculated for the monitored zone based on detected violations.' },
      { term: 'Alert Active', definition: 'A status indicator triggered when a high number of violations are detected in the current video frame.' },
    ],
  },
];

export default function GlossaryModal({ isOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState('All');

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const q = search.toLowerCase();
  const filtered = GLOSSARY
    .filter(s => activeSection === 'All' || s.section === activeSection)
    .map(s => ({
      ...s,
      terms: s.terms.filter(t =>
        t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q)
      ),
    }))
    .filter(s => s.terms.length > 0);

  const totalTerms = GLOSSARY.reduce((a, s) => a + s.terms.length, 0);

  return (
    <div className="glossary-overlay" onClick={onClose}>
      <div className="glossary-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="glossary-header">
          <div className="glossary-header-left">
            <div className="glossary-icon">📖</div>
            <div>
              <h2 className="glossary-title" style={{ marginBottom: 0 }}>Project Glossary</h2>
            </div>
          </div>
          <button className="glossary-close" onClick={onClose} aria-label="Close Glossary">✕</button>
        </div>

        {/* Search + Filter bar */}
        <div className="glossary-controls">
          <div className="glossary-search-wrapper">
            <svg className="glossary-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              className="glossary-search"
              type="text"
              placeholder="Search terms..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button className="glossary-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <div className="glossary-filters">
            {['All', ...GLOSSARY.map(s => s.section)].map(sec => (
              <button
                key={sec}
                className={`glossary-filter-btn ${activeSection === sec ? 'active' : ''}`}
                onClick={() => setActiveSection(sec)}
              >
                {GLOSSARY.find(s => s.section === sec)?.icon} {sec}
              </button>
            ))}
          </div>
        </div>

        {/* Term content */}
        <div className="glossary-body">
          {filtered.length === 0 ? (
            <div className="glossary-empty">
              <p>No terms found for "<strong>{search}</strong>"</p>
            </div>
          ) : (
            filtered.map(section => (
              <div key={section.section} className="glossary-section">
                <div className="glossary-section-header">
                  <span className="glossary-section-icon">{section.icon}</span>
                  <span>{section.section}</span>
                  <span className="glossary-section-count">{section.terms.length} terms</span>
                </div>
                <div className="glossary-terms-grid">
                  {section.terms.map(t => (
                    <div key={t.term} className="glossary-term-card">
                      <div className="glossary-term-name">{t.term}</div>
                      <div className="glossary-term-def">{t.definition}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
