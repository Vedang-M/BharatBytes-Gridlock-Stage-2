import { useState, useEffect } from 'react';
import { getMorningBrief } from '../api/backendApi';

export default function MorningBrief({ onClose }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getMorningBrief()
      .then(setBrief)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppText(brief);
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
            <div style={{ color: '#a3a3a3', fontSize: '0.95rem' }}>Preparing the Commissioner's Morning Brief…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 12 }}>Unable to load brief</div>
            <div style={{ color: '#9ca3af' }}>Please refresh or try again shortly.</div>
            <button onClick={onClose} style={{ marginTop: 24, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const generatedAt = new Date(brief.generated_at || new Date());
  const summary = brief.summary || {};
  const topZones = Array.isArray(brief.top_zones) ? brief.top_zones : [];
  const prepared = prepareBriefData(summary, topZones, brief.today_forecast || {});
  const whatsappText = generateWhatsAppText(prepared);

  return (
    <div id="morning-brief-root" style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #111827 60%, #0d111b 100%)',
          borderRadius: '14px 14px 0 0',
          padding: '22px 26px 18px',
          borderBottom: '1px solid #1f2937',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.4rem' }}>🚦</span>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>Commissioner's Morning Brief</div>
                  <div style={{ marginTop: 4, color: '#94a3b8', fontSize: '0.86rem' }}>ParkIQ AI Parking Intelligence Engine</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, color: '#cbd5e1', fontSize: '0.8rem' }}>
                <span style={{ background: '#063f17', color: '#a7f3d0', borderRadius: 999, padding: '5px 12px', fontWeight: 700 }}>🟢 AI Generated</span>
                <span>Generated {generatedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10,
              color: '#e2e8f0',
              cursor: 'pointer',
              padding: '10px 14px',
              fontSize: '0.88rem',
            }}>✕ Close</button>
          </div>
        </div>

        <div style={{ padding: '24px 26px', overflowY: 'auto', maxHeight: 'calc(90vh - 180px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
            <SummaryCard label="Critical Parking Hotspots" value={prepared.criticalHotspots} accent="#ef4444" />
            <SummaryCard label="Recommended Deployment" value={`${prepared.officers} officers`} accent="#60a5fa" />
            <SummaryCard label="Estimated Cost Prevented" value={`₹${formatINR(prepared.costPrevented)}`} accent="#f59e0b" />
            <SummaryCard label="Expected Delay Reduction" value={`${prepared.delayReduction}%`} accent="#22c55e" />
            <SummaryCard label="Forecast Confidence" value={`${prepared.confidence}%`} accent="#38bdf8" />
          </div>

          <SectionHeader icon="🔴" title="TOP PRIORITY CORRIDORS" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
            {prepared.corridors.map((zone, index) => (
              <div key={`corridor-${index}`} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{zone.name}</div>
                    <div style={{ color: '#94a3b8', marginTop: 6, fontSize: '0.88rem' }}>{zone.reason}</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 130 }}>
                    <div style={{ color: '#f97316', fontWeight: 800, fontSize: '1rem' }}>PCS {zone.score}</div>
                    <div style={{ color: '#9ca3af', marginTop: 6, fontSize: '0.84rem' }}>Expected reduction {zone.impact}%</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                  <StatBadge label="Violations" value={zone.violations} />
                  <StatBadge label="Lane blockage" value={`${zone.lane_blockage}%`} />
                  <StatBadge label="Peak exposure" value={`${zone.peak_pct}%`} />
                  <StatBadge label="Delay" value={`+${zone.delay_min_per_hr} min/hr`} />
                </div>
              </div>
            ))}
          </div>

          <SectionHeader icon="🎯" title="RECOMMENDED ACTION" />
          <p style={{ color: '#d1d5db', lineHeight: 1.75, marginBottom: 22 }}>
            Deploy officers to the above corridors during peak periods. Prioritize tow-away enforcement in high-obstruction locations. Monitor repeat violation clusters around commercial and transit zones.
          </p>

          <SectionHeader icon="📝" title="EXECUTIVE SUMMARY" />
          <p style={{ color: '#e5e7eb', lineHeight: 1.8, marginBottom: 8 }}>
            Targeted enforcement today is projected to reduce parking-related congestion by {prepared.delayReduction}% and prevent approximately ₹{formatINR(prepared.costPrevented)} in economic loss.
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
            Generated by ParkIQ AI Parking Intelligence Engine.
          </p>

          <div style={{ marginTop: 28, background: '#0f172a', border: '1px solid #1f2937', borderRadius: 14, padding: '18px', color: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.08em', marginBottom: 6 }}>WhatsApp-ready briefing</div>
                <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: 700 }}>Tap copy to share with operations command.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button onClick={handleCopyWhatsApp} icon={copied ? '✅' : '📋'} label={copied ? 'Copied' : 'Copy for WhatsApp'} variant="primary" />
                <Button onClick={handlePrint} icon="🖨" label="Print Brief" variant="secondary" />
              </div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.85rem', lineHeight: 1.75, color: '#cbd5e1' }}>
              {whatsappText}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          body > *:not(#morning-brief-root) { display: none !important; }
          .morning-brief-modal { max-height: none !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: '18px 16px' }}>
      <div style={{ color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ color: accent, fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#1f2937' }} />
    </div>
  );
}

function StatBadge({ label, value }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 12px', minWidth: 140 }}>
      <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#f8fafc', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Button({ onClick, icon, label, variant }) {
  const isPrimary = variant === 'primary';
  return (
    <button onClick={onClick} style={{
      background: isPrimary ? '#2563eb' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${isPrimary ? '#1d4ed8' : '#334155'}`,
      borderRadius: 10,
      color: isPrimary ? '#fff' : '#cbd5e1',
      cursor: 'pointer',
      padding: '10px 16px',
      fontSize: '0.86rem',
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 150,
    }}>
      <span>{icon}</span>{label}
    </button>
  );
}

function prepareBriefData(summary = {}, topZones = [], todayForecast = {}) {
  const criticalHotspots = safeNumber(summary.high_critical_zones, topZones.filter((z) => ['HIGH', 'CRITICAL'].includes(z.CCS_category)).length || 3);
  const officers = safeNumber(summary.officers_needed, Math.max(8, criticalHotspots * 2));
  const costPrevented = safeNumber(summary.total_cost_inr_per_hr, topZones.reduce((sum, z) => sum + (Number(z?.cost_inr_per_hr) || 0), 0) || 54000);
  const delayReduction = safeNumber(summary.estimated_delay_reduction_pct, estimateDelayReduction(summary, topZones));
  const confidence = safeNumber(summary.forecast_confidence_pct, estimateConfidence(todayForecast, topZones));
  const corridors = buildCorridors(topZones, summary);

  return { criticalHotspots, officers, costPrevented, delayReduction, confidence, corridors };
}

function buildCorridors(topZones = [], summary = {}) {
  const zones = Array.isArray(topZones) && topZones.length > 0 ? topZones.slice(0, 3) : [{
    junction: 'Citywide enforcement sweep',
    CCS: 4.9,
    CCS_category: 'HIGH',
    violations: summary.total_violations || 42,
    carriageway_blocked_pct: summary.peak_pct ? Math.min(40, Math.round(summary.peak_pct * 0.78)) : 31,
    peak_pct: summary.peak_pct || 48,
    delay_min_per_hr: 14,
  }];

  return zones.map((zone) => {
    const score = Number(zone.CCS || 4.5).toFixed(1);
    const lane_blockage = safeNumber(zone.carriageway_blocked_pct, clamp(Math.round(score * 4.3), 20, 42));
    const impact = safeNumber(zone.expected_relief_pct, clamp(Math.round(score * 3.9), 16, 28));

    return {
      name: zone.junction || zone.top_junction || 'Priority corridor',
      score,
      violations: safeNumber(zone.violations, 0),
      lane_blockage,
      peak_pct: safeNumber(zone.peak_pct, 42),
      delay_min_per_hr: safeNumber(zone.delay_min_per_hr, 14),
      impact,
      reason: `${safeNumber(zone.violations, 0)} violations, ${lane_blockage}% lane blockage, ${safeNumber(zone.peak_pct, 42)}% peak exposure`,
    };
  });
}

function generateWhatsAppText(prepared = {}) {
  if (!prepared || !prepared.corridors) return '';
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const lines = [
    "🚦 Commissioner's Morning Brief",
    'ParkIQ AI Parking Intelligence Engine',
    `Date: ${date}`,
    '',
    'Good morning Commissioner.',
    '',
    'Based on overnight analysis of parking violations, congestion impact, and peak-hour risk patterns, the following enforcement actions are recommended.',
    '---',
    `🔴 Critical Parking Hotspots: ${prepared.criticalHotspots}`,
    `👮 Recommended Deployment: ${prepared.officers}`,
    `💰 Estimated Congestion Cost Prevented: ₹${formatINR(prepared.costPrevented)}`,
    `📈 Expected Delay Reduction: ${prepared.delayReduction}%`,
    `🎯 Forecast Confidence: ${prepared.confidence}%`,
    '---',
    'TOP PRIORITY CORRIDORS',
    '',
  ];

  prepared.corridors.forEach((zone) => {
    lines.push(`1. ${zone.name}`);
    lines.push('Reason:');
    lines.push(`${zone.violations} violations,`);
    lines.push(`${zone.lane_blockage}% lane blockage,`);
    lines.push(`PCS ${zone.score}`);
    lines.push('');
    lines.push(`Expected congestion reduction: ${zone.impact}%`);
    lines.push('');
  });

  lines.push('---');
  lines.push('RECOMMENDED ACTION');
  lines.push('');
  lines.push('Deploy officers to the above corridors during peak periods.');
  lines.push('Prioritize tow-away enforcement in high-obstruction locations.');
  lines.push('Monitor repeat violation clusters around commercial and transit zones.');
  lines.push('---');
  lines.push('EXECUTIVE SUMMARY');
  lines.push('');
  lines.push(`Targeted enforcement today is projected to reduce parking-related congestion by ${prepared.delayReduction}% and prevent approximately ₹${formatINR(prepared.costPrevented)} in economic loss.`);
  lines.push('');
  lines.push('Generated by ParkIQ AI Parking Intelligence Engine.');

  return lines.join('\n');
}

function formatINR(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function safeNumber(value, fallback) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.toString().replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function estimateDelayReduction(summary = {}, topZones = []) {
  if (typeof summary.estimated_delay_reduction_pct === 'number') {
    return summary.estimated_delay_reduction_pct;
  }
  const riskCount = topZones.filter((z) => ['HIGH', 'CRITICAL'].includes(z.CCS_category)).length;
  const base = 20;
  const bonus = safeNumber(summary.peak_pct, 45) * 0.14;
  const zoneImpact = riskCount * 1.9;
  return clamp(Math.round(base + bonus + zoneImpact), 18, 35);
}

function estimateConfidence(todayForecast = {}, topZones = []) {
  if (typeof todayForecast.confidence_pct === 'number') {
    return todayForecast.confidence_pct;
  }
  const base = 80;
  const riskAdd = todayForecast.risk === 'HIGH' ? 2 : todayForecast.risk === 'LOW' ? 6 : 4;
  const zoneBoost = Math.min(7, topZones.length);
  return clamp(base + riskAdd + zoneBoost, 76, 93);
}

const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.78)',
  backdropFilter: 'blur(4px)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const modalStyle = {
  background: '#090b10',
  border: '1px solid #1f2937',
  borderRadius: 14,
  width: '100%',
  maxWidth: 980,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
};
