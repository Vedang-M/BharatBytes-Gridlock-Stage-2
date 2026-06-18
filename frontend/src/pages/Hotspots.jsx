import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import MapView from '../components/MapView';
import { getHotspots, getViolationTypes, getVehicleTypes } from '../api/backendApi';

const CCS_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MODERATE: '#eab308', LOW: '#22c55e' };
const CHART_COLORS = ['#0f766e', '#14b8a6', '#475569', '#64748b', '#94a3b8'];

const renderPieLabel = ({ x, y, cx, name, percent }) => {
  return (
    <text 
      x={x} 
      y={y} 
      fill="var(--text-secondary)" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      style={{ fontSize: '9.5px', fontWeight: 600, fontFamily: 'var(--font-family)' }}
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function Hotspots() {
  const [hotspots, setHotspots] = useState([]);
  const [violations, setViolations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getHotspots(50).catch(() => []),
      getViolationTypes().catch(() => []),
      getVehicleTypes().catch(() => []),
    ]).then(([h, v, vh]) => {
      setHotspots(h);
      setViolations(v);
      setVehicles(vh);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">Loading hotspots...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hotspots Analysis</h1>
          <p className="page-subtitle">DBSCAN clusters scored by Congestion Cost Score (CCS)</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            Top Hotspots by CCS
          </div>
          <div className="table-responsive">
            <table className="data-table table-grid-hotspots">
              <thead>
                <tr>
                  <th>Junction</th><th>CCS</th><th>Category</th><th>Violations</th><th>Peak %</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.slice(0, 30).map((h, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{h.top_junction}</td>
                    <td style={{ fontWeight: 700, color: CCS_COLORS[h.CCS_category] }}>{h.CCS}</td>
                    <td><span className={`badge badge-${(h.CCS_category || 'low').toLowerCase()}`}>{h.CCS_category}</span></td>
                    <td style={{ fontWeight: 600 }}>{Number(h.violations).toLocaleString()}</td>
                    <td>{h.peak_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flat-card" style={{ padding: 0, overflow: 'hidden' }}>
          <MapView hotspots={hotspots} topN={30} />
        </div>
      </div>

      <div className="section-header">Violation & Vehicle Breakdown</div>
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            </svg>
            Top Violation Types
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <BarChart
                data={violations.map((v) => ({ name: (v.vtype_list || '').slice(0, 25), count: v.count }))}
                layout="vertical"
                margin={{ left: 140, right: 20, top: 5, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="violationsGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.9}/>
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.3}/>
                  </linearGradient>
                </defs>
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} width={130} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Bar dataKey="count" fill="url(#violationsGradient)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            Vehicle Type Distribution
          </div>
          <div className="chart-wrapper" style={{ height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={vehicles.map((v) => ({ name: v.vehicle, value: v.count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={45}
                  outerRadius={68}
                  paddingAngle={3}
                  label={renderPieLabel}
                  labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                >
                  {vehicles.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Legend 
                  verticalAlign="bottom" 
                  align="center"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-family)', paddingTop: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
