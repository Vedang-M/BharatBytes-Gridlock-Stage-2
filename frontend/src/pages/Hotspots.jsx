import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import MapView from '../components/MapView';
import { getHotspots, getViolationTypes, getVehicleTypes } from '../api/backendApi';

const CCS_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MODERATE: '#eab308', LOW: '#22c55e' };
const CHART_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

const tooltipStyle = {
  background: '#171717',
  border: '1px solid #262626',
  borderRadius: 4,
  color: '#fafafa',
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
        <h1 className="page-title">Hotspots</h1>
        <p className="page-subtitle">DBSCAN clusters scored by Congestion Cost Score (CCS)</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <div className="card-title">Top Hotspots by CCS</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Junction</th><th>CCS</th><th>Category</th><th>Violations</th><th>Peak %</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.slice(0, 30).map((h, i) => (
                <tr key={i}>
                  <td>{(h.top_junction || '').slice(0, 28)}</td>
                  <td style={{ fontWeight: 600, color: CCS_COLORS[h.CCS_category] }}>{h.CCS}</td>
                  <td><span className={`badge badge-${(h.CCS_category || 'low').toLowerCase()}`}>{h.CCS_category}</span></td>
                  <td>{Number(h.violations).toLocaleString()}</td>
                  <td>{h.peak_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flat-card" style={{ padding: 0, overflow: 'hidden' }}>
          <MapView hotspots={hotspots} topN={30} />
        </div>
      </div>

      <div className="section-header">Violation & Vehicle Breakdown</div>
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">Top Violation Types</div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <BarChart
                data={violations.map((v) => ({ name: (v.vtype_list || '').slice(0, 25), count: v.count }))}
                layout="vertical"
                margin={{ left: 140, right: 20, top: 5, bottom: 5 }}
              >
                <XAxis type="number" tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#a3a3a3', fontSize: 11 }} width={130} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#2563eb" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">Vehicle Type Distribution</div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={vehicles.map((v) => ({ name: v.vehicle, value: v.count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#737373' }}
                >
                  {vehicles.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
