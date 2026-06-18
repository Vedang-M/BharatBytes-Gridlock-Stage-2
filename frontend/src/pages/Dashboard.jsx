import { useState, useEffect, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
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

  const ccsDist = {};
  hotspots.forEach((h) => {
    const cat = h.CCS_category || 'LOW';
    ccsDist[cat] = (ccsDist[cat] || 0) + 1;
  });
  const ccsChartData = Object.entries(ccsDist).map(([name, value]) => ({ name, value }));

  const top = hotspots[0];
  const radarData = top ? [
    { metric: 'Density', value: Math.min((top.violations / 500) * 100, 100) },
    { metric: 'Peak %', value: top.peak_pct },
    { metric: 'Severity', value: (top.avg_severity / 6) * 100 },
    { metric: 'Main Rd', value: (top.main_road || 0) * 100 },
    { metric: 'Junction', value: (top.at_junc || 0) * 100 },
    { metric: 'CCS', value: (top.CCS / 10) * 100 },
  ] : [];

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
          <div className="chart-wrapper" style={{ height: 280 }} ref={pieChartRef}>
            <ResponsiveContainer>
              <PieChart margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                <Pie
                  data={ccsChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                >
                  {ccsChartData.map((entry) => (
                    <Cell key={entry.name} fill={CCS_COLORS[entry.name] || '#737373'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-family)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              <path d="M2 12h20"></path>
            </svg>
            #1 Hotspot Profile
          </div>
          {top && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{top.top_junction}</div>
                <span className={`badge badge-${(top.CCS_category || 'low').toLowerCase()}`}>{top.CCS_category}</span>
                <span style={{ marginLeft: 8, fontWeight: 700, color: CCS_COLORS[top.CCS_category] }}>{top.CCS}/10 CCS</span>
              </div>
              <div className="chart-wrapper" style={{ height: 240 }} ref={radarChartRef}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
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
            <table className="data-table">
              <thead>
                <tr><th>Zone</th><th>Window</th><th>Priority</th></tr>
              </thead>
              <tbody>
                {schedule.map((s, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(s.top_junction || '').slice(0, 22)}
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
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No schedule data</p>
          )}
        </div>
      </div>
    </div>
  );
}
