import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import { getTemporalData, getDailyTrend, getForecast, getSchedule } from '../api/backendApi';

const tooltipStyle = {
  background: '#171717',
  border: '1px solid #262626',
  borderRadius: 4,
  color: '#fafafa',
};

const HOUR_COLOR = (h) => ((h >= 7 && h <= 11) || (h >= 17 && h <= 21)) ? '#ef4444' : '#2563eb';

export default function Analytics() {
  const [temporal, setTemporal] = useState(null);
  const [trend, setTrend] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTemporalData().catch(() => null),
      getDailyTrend().catch(() => []),
      getForecast().catch(() => []),
      getSchedule(8).catch(() => []),
    ]).then(([t, tr, fc, sc]) => {
      setTemporal(t);
      setTrend(tr);
      setForecast(fc);
      setSchedule(sc);
      setLoading(false);
    });
  }, []);

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
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">Violation patterns, forecasts, and schedules</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">Violations by Hour</div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <BarChart data={hourly} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="hour_ist" tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="violations" radius={[2, 2, 0, 0]}>
                  {hourly.map((entry, i) => (
                    <Cell key={i} fill={HOUR_COLOR(entry.hour_ist)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            Red: Peak hours (7–11am, 5–9pm) · Blue: Off-peak
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">Violations by Day of Week</div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="dow_ist" tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="violations" fill="#2563eb" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">Monthly Violation Trend</div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <LineChart data={monthly} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="month_name" tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="violations" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flat-card">
          <div className="card-title">Daily Trend & 7-Day Rolling Avg</div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <AreaChart data={trend.slice(-90)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date_ist" tick={{ fill: '#a3a3a3', fontSize: 10 }} interval={6} />
                <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="violations" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} strokeWidth={1} />
                <Line type="monotone" dataKey="rolling_7d" stroke="#2563eb" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="flat-card">
          <div className="card-title">Next 7-Day Forecast</div>
          {forecast.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Day</th><th>Risk</th><th>Peak Hours</th><th>Top Zone</th></tr>
              </thead>
              <tbody>
                {forecast.map((f, i) => (
                  <tr key={i}>
                    <td>{f.date}</td>
                    <td>{f.day}</td>
                    <td>
                      <span className={`badge ${f.risk === 'HIGH' ? 'badge-critical' : 'badge-moderate'}`}>
                        {f.risk}
                      </span>
                    </td>
                    <td>{f.peak_hours}</td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.top_zone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No forecast data</p>
          )}
        </div>

        <div className="flat-card">
          <div className="card-title">Deployment Schedule</div>
          {schedule.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Zone</th><th>CCS</th><th>Window</th><th>Priority</th></tr>
              </thead>
              <tbody>
                {schedule.map((s, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(s.top_junction || '').slice(0, 25)}
                    </td>
                    <td>{s.CCS}</td>
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
