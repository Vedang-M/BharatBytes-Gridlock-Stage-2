import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import { getTemporalData, getDailyTrend, getForecast, getSchedule, getHotspots } from '../api/backendApi';
import WhatIfZonePlanner from '../components/WhatIfZonePlanner';

const HOUR_COLOR = (h) => ((h >= 7 && h <= 11) || (h >= 17 && h <= 21)) ? 'url(#peakBarGradient)' : 'url(#normalBarGradient)';

export default function Analytics() {
  const [temporal, setTemporal] = useState(null);
  const [trend, setTrend] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTemporalData().catch(() => null),
      getDailyTrend().catch(() => []),
      getSchedule(8).catch(() => []),
      getHotspots(50).catch(() => [])
    ]).then(([t, tr, sc, hz]) => {
      setTemporal(t);
      setTrend(tr);
      setSchedule(sc);
      setZones(hz);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    getForecast(selectedZone).then(setForecast).catch(() => setForecast([]));
  }, [selectedZone]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">Loading temporal patterns...</div>
      </div>
    );
  }

  const hourly = temporal?.hourly || [];
  const daily = temporal?.daily || [];
  const monthly = temporal?.monthly || [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Temporal Analytics</h1>
          <p className="page-subtitle">Violation patterns, forecasts, and schedules</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Violations by Hour
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <BarChart data={hourly} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="peakBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#991b1b" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="normalBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour_ist" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Bar dataKey="violations" radius={[4, 4, 0, 0]}>
                  {hourly.map((entry, i) => (
                    <Cell key={i} fill={HOUR_COLOR(entry.hour_ist)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center', fontWeight: 600 }}>
            <span style={{ color: '#ef4444' }}>■ Peak Hours (7–11am, 5–9pm)</span> · <span style={{ color: 'var(--accent)' }}>■ Off-Peak Hours</span>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Violations by Day of Week
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="dailyBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="dow_ist" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Bar dataKey="violations" fill="url(#dailyBarGradient)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"></path>
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
            </svg>
            Monthly Violation Trend
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <LineChart data={monthly} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="month_name" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Line type="monotone" dataKey="violations" stroke="var(--accent)" strokeWidth={3} dot={{ r: 5, fill: 'var(--accent)', strokeWidth: 0 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
            Daily Trend & 7-Day Rolling Avg
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <AreaChart data={trend.slice(-90)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="areaTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date_ist" tick={{ fill: 'var(--text-secondary)', fontSize: 9, fontWeight: 600 }} interval={6} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Area type="monotone" dataKey="violations" stroke="var(--accent)" strokeWidth={1} fill="url(#areaTrendGradient)" />
                <Line type="monotone" dataKey="rolling_7d" stroke="var(--status-critical)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              Next 7-Day Forecast
            </div>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
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
              <option value="ALL">City-Wide Top Zones</option>
              {zones.map(z => (
                <option key={z.cluster} value={z.cluster}>{z.top_junction}</option>
              ))}
            </select>
          </div>
          {forecast.length > 0 ? (
            <div className="table-responsive">
              <table className="data-table table-grid-forecast">
                <thead>
                  <tr><th>Date</th><th>Day</th><th>Risk</th><th>Peak Hours</th><th>Top Zone</th></tr>
                </thead>
                <tbody>
                  {forecast.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{f.date}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{f.day}</td>
                      <td>
                        <span className={`badge ${f.risk === 'HIGH' ? 'badge-critical' : 'badge-moderate'}`}>
                          {f.risk}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.peak_hours}</td>
                      <td style={{ fontWeight: 600 }}>{f.top_zone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No forecast data</p>
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
              <table className="data-table table-grid-schedule-4col">
                <thead>
                  <tr><th>Zone</th><th>CCS</th><th>Window</th><th>Priority</th></tr>
                </thead>
                <tbody>
                  {schedule.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>
                        {s.top_junction}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.CCS}</td>
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

      {/* ── What-If Zone Planner ─────────────────────────────── */}
      <div className="flat-card" style={{ marginBottom: 24 }}>
        <WhatIfZonePlanner apiBase="http://localhost:8000" />
      </div>

    </div>
  );
}
