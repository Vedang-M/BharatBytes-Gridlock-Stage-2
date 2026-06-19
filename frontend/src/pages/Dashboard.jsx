import { useState, useEffect, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import StatsCard from '../components/StatsCard';
import MapView from '../components/MapView';
import HotspotCard from '../components/HotspotCard';
import { getSummary, getHotspots, getHeatmapData, getSchedule } from '../api/backendApi';
import { generateDashboardPDF } from '../utils/pdfGenerator';

const CCS_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MODERATE: '#eab308', LOW: '#22c55e' };

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [selectedHotspotIndex, setSelectedHotspotIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const pieChartRef = useRef(null);
  const radarChartRef = useRef(null);

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateDashboardPDF({
        summary,
        hotspots,
        schedule,
        chartElements: [pieChartRef.current, radarChartRef.current]
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    Promise.all([
      getSummary().catch(() => null),
      getHotspots(30).catch(() => []),
      getHeatmapData(25000).catch(() => []),
      getSchedule(6).catch(() => []),
    ]).then(([s, h, hm, sc]) => {
      setSummary(s);
      setHotspots(h);
      setHeatmap(hm);
      setSchedule(sc);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">Loading data...</div>
      </div>
    );
  }

  const ccsDist = summary?.ccs_distribution || {};
  const ccsChartData = Object.entries(ccsDist)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value); // Sort so largest slices are first

  const top = hotspots[selectedHotspotIndex] || hotspots[0];
  const radarData = top ? [
    { metric: 'Density', value: Math.min((top.violations / 500) * 100, 100) },
    { metric: 'Peak %', value: top.peak_pct },
    { metric: 'Severity', value: (top.avg_severity / 6) * 100 },
    { metric: 'Main Rd', value: (top.main_road || 0) * 100 },
    { metric: 'Junction', value: (top.at_junc || 0) * 100 },
    { metric: 'CCS', value: (top.CCS / 10) * 100 },
  ] : [];

  // ── Enforcement Opportunity Cost computations ───────────────
  const totalZones = hotspots.length;
  const patrolledZones = schedule.length;
  const unpatrolledZones = totalZones - patrolledZones;
  const coverageGapPct = totalZones > 0
    ? ((unpatrolledZones / totalZones) * 100).toFixed(1) : 0;
  const avgViolationsPerZone = hotspots.length > 0
    ? hotspots.reduce((s, h) => s + (h.violations || 0), 0) / hotspots.length
    : 0;
  const estimatedMissedViolations = Math.round(avgViolationsPerZone * unpatrolledZones);
  const missedEconomicCost = Math.round(estimatedMissedViolations * 150 * 2.5 / 60);
  const highPlusUnpatrolled = hotspots
    .filter(h => ['HIGH', 'CRITICAL'].includes(h.CCS_category))
    .filter(h => !schedule.some(s => s.top_junction === h.top_junction))
    .length;
  const coverageColor = coverageGapPct > 70 ? '#ef4444'
    : coverageGapPct > 40 ? '#f97316' : '#22c55e';
  const recoveryCost = Math.round(missedEconomicCost * 0.4);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Traffic Enforcement Dashboard</h1>
          <p className="page-subtitle">Bengaluru Traffic Police · Jan–May 2025</p>
        </div>
        <button
          onClick={handleDownloadPDF}
          disabled={isGeneratingPDF}
          className="btn btn-primary"
          style={{ height: 'fit-content' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          {isGeneratingPDF ? 'Generating PDF...' : 'Download Report'}
        </button>
      </div>

      <div className="grid-5" style={{ marginBottom: 24 }}>
        <StatsCard value={summary ? summary.total_violations.toLocaleString() : '—'} label="Total Violations" />
        <StatsCard value={summary ? summary.total_clusters.toLocaleString() : '—'} label="Hotspot Clusters" />
        <StatsCard value={summary ? summary.critical_zones.toLocaleString() : '—'} label="Critical Zones" />
        <StatsCard value={summary ? `₹${summary.top10_roi.toLocaleString()}` : '—'} label="Daily ROI (Top 10)" />
        <StatsCard value={summary ? `${summary.peak_pct}%` : '—'} label="Peak-Hour Share" />
      </div>

      {/* ── Premium Enforcement Opportunity Cost Card ─────────────────── */}
      <div className="flat-card" style={{ 
        marginBottom: 24, 
        background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.03) 0%, rgba(249, 115, 22, 0.03) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
        boxShadow: '0 4px 24px -6px rgba(239, 68, 68, 0.12)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle glowing orb in background */}
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, background: 'radial-gradient(circle, rgba(239,68,68,0.1) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

        <style>{`
          @keyframes eocPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.6); }
          }
          @keyframes shimmerBar {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12, fontSize: '1.05rem', letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#ef4444', opacity: 0.3, animation: 'eocPulse 2s infinite ease-in-out' }} />
               <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', zIndex: 1, boxShadow: '0 0 8px #ef4444' }} />
            </div>
            ENFORCEMENT OPPORTUNITY COST
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
          <div style={{ flex: '1 1 180px', padding: '20px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(to bottom, #ef4444, #f97316)' }} />
            <div style={{ fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.1, background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>
              ₹{missedEconomicCost.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Missed Daily Cost</div>
          </div>
          <div style={{ flex: '1 1 140px', padding: '20px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: 6 }}>
              {unpatrolledZones}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unpatrolled Zones</div>
          </div>
          <div style={{ flex: '1 1 140px', padding: '20px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: coverageColor, lineHeight: 1.1, marginBottom: 6 }}>
              {coverageGapPct}%
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coverage Gap</div>
          </div>
          <div style={{ flex: '1 1 140px', padding: '20px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f97316', lineHeight: 1.1, marginBottom: 6 }}>
              {highPlusUnpatrolled}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HIGH+ Exposed</div>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ height: 12, borderRadius: 12, background: 'var(--bg-hover)', width: '100%', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{
              width: `${coverageGapPct}%`, height: '100%', borderRadius: 12,
              background: `linear-gradient(90deg, #f97316 0%, #ef4444 50%, #f97316 100%)`,
              backgroundSize: '200% 100%',
              animation: 'shimmerBar 3s infinite linear',
              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-primary)' }}>{patrolledZones}</span> of {totalZones} hotspot clusters covered today
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f97316', background: 'rgba(249, 115, 22, 0.08)', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(249, 115, 22, 0.2)' }}>
              Deploying to {highPlusUnpatrolled} additional HIGH+ zones recovers <span style={{fontWeight: 800}}>₹{recoveryCost.toLocaleString('en-IN')}</span> daily
            </div>
          </div>
        </div>
      </div>

      <div className="grid-3-1" style={{ marginBottom: 24 }}>
        <div className="flat-card" style={{ padding: 0, overflow: 'hidden' }}>
          <MapView hotspots={hotspots} heatmapPoints={heatmap} topN={20} />
        </div>
        <div className="flat-card" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            Top 10 Critical Zones
          </div>
          {hotspots.slice(0, 10).map((h, i) => (
            <HotspotCard key={i} hotspot={h} rank={i + 1} />
          ))}
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
              <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
            </svg>
            CCS Distribution
          </div>
          <div className="chart-wrapper" style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 500 }} ref={pieChartRef}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ left: 50, right: 50, top: 20, bottom: 20 }}>
                <Pie
                  data={ccsChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="80%"
                  paddingAngle={3}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                >
                  {ccsChartData.map((entry) => (
                    <Cell key={entry.name} fill={CCS_COLORS[entry.name] || '#737373'} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-family)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                <path d="M2 12h20"></path>
              </svg>
              #{selectedHotspotIndex + 1} Hotspot Profile
            </div>
            {hotspots.length > 0 && (
              <select
                value={selectedHotspotIndex}
                onChange={(e) => setSelectedHotspotIndex(Number(e.target.value))}
                style={{
                  padding: '6px 30px 6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                  maxWidth: '250px',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {hotspots.map((h, i) => (
                  <option key={i} value={i}>{h.top_junction}</option>
                ))}
              </select>
            )}
          </div>
          {top && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{top.top_junction}</div>
                <span className={`badge badge-${(top.CCS_category || 'low').toLowerCase()}`}>{top.CCS_category}</span>
                <span style={{ marginLeft: 8, fontWeight: 700, color: CCS_COLORS[top.CCS_category] }}>{top.CCS}/10 CCS</span>
              </div>
              <div className="chart-wrapper" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} ref={radarChartRef}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="80%">
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={2.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Deployment Schedule
          </div>
          {schedule.length > 0 ? (
            <div className="table-responsive">
              <table className="data-table table-grid-schedule">
                <thead>
                  <tr><th>Zone</th><th>Window</th><th>Priority</th></tr>
                </thead>
                <tbody>
                  {schedule.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>
                        {s.top_junction}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.deploy_window}</td>
                      <td>
                        <span className={`badge ${s.priority === 'IMMEDIATE' ? 'badge-critical' : s.priority === 'HIGH' ? 'badge-high' : 'badge-moderate'}`}>
                          {s.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No schedule data</p>
          )}
        </div>
      </div>
    </div>
  );
}
