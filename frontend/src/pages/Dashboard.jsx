import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import StatsCard from '../components/StatsCard';
import MapView from '../components/MapView';
import HotspotCard from '../components/HotspotCard';
import { getSummary, getHotspots, getHeatmapData, getSchedule } from '../api/backendApi';

const CCS_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MODERATE: '#eab308', LOW: '#22c55e' };

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <h1 className="page-title">Traffic Enforcement Dashboard</h1>
        <p className="page-subtitle">Bengaluru Traffic Police · Jan–May 2025</p>
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
        <div className="flat-card" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <div className="card-title">Top 10 Critical Zones</div>
          {hotspots.slice(0, 10).map((h, i) => (
            <HotspotCard key={i} hotspot={h} rank={i + 1} />
          ))}
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">CCS Distribution</div>
          <div className="chart-wrapper" style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={ccsChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={95}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: '#737373' }}
                >
                  {ccsChartData.map((entry) => (
                    <Cell key={entry.name} fill={CCS_COLORS[entry.name] || '#737373'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 4 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">#1 Hotspot Profile</div>
          {top && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{top.top_junction}</div>
                <span className={`badge badge-${(top.CCS_category || 'low').toLowerCase()}`}>{top.CCS_category}</span>
                <span style={{ marginLeft: 8, fontWeight: 600, color: CCS_COLORS[top.CCS_category] }}>{top.CCS}/10</span>
              </div>
              <div className="chart-wrapper" style={{ height: 240 }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="#262626" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        <div className="flat-card">
          <div className="card-title">Deployment Schedule</div>
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
                    <td>{s.deploy_window}</td>
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
