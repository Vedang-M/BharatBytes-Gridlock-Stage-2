import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const CCS_COLOR = (category) => {
  if (category === 'CRITICAL') return '#ef4444';
  if (category === 'HIGH') return '#f97316';
  if (category === 'MODERATE') return '#eab308';
  return '#22c55e';
};

const VEHICLE_COLORS = {
  CAR: '#6366f1',
  MOTORCYCLE: '#14b8a6',
  BUS: '#f97316',
  TRUCK: '#ef4444',
};

export default function DetectionSidebar({
  ccsScore = 0,
  ccsCategory = 'LOW',
  violationCount = 0,
  vehicleCounts = {},
  alertActive = false,
  connected = false,
  frameId = 0,
}) {
  const [flash, setFlash] = useState(false);
  const [prevCount, setPrevCount] = useState(violationCount);

  useEffect(() => {
    if (violationCount > prevCount) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 600);
      setPrevCount(violationCount);
      return () => clearTimeout(timer);
    }
    setPrevCount(violationCount);
  }, [violationCount, prevCount]);

  // CCS gauge arc
  const pct = Math.min(ccsScore / 10, 1);
  const r = 52;
  const circ = Math.PI * r;
  const dash = pct * circ;
  const cat = ccsCategory || 'LOW';
  const color = CCS_COLOR(cat);

  // Vehicle chart data
  const chartData = ['CAR', 'MOTORCYCLE', 'BUS', 'TRUCK'].map((v) => ({
    name: v,
    count: vehicleCounts[v] || 0,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* CCS Gauge */}
      <div className="glass-card" style={{ textAlign: 'center', padding: '20px 16px' }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12,
        }}>
          Live Congestion Score
        </div>
        <svg width="140" height="80" viewBox="0 0 140 80">
          <path
            d="M 10 70 A 60 60 0 0 1 130 70"
            fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round"
          />
          <path
            d="M 10 70 A 60 60 0 0 1 130 70"
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
          <text x="70" y="65" textAnchor="middle" fontSize="22" fontWeight="800" fill={color}>
            {ccsScore.toFixed(2)}
          </text>
          <text x="70" y="78" textAnchor="middle" fontSize="9" fill="var(--text-muted)">CCS / 10</text>
        </svg>
        <div style={{
          display: 'inline-block', padding: '3px 14px', borderRadius: 30,
          background: color + '22', color: color,
          fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.04em',
          marginTop: 4,
        }}>
          {cat}
        </div>
      </div>

      {/* Violation Counter */}
      <div className="glass-card" style={{ textAlign: 'center', padding: '20px 16px' }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8,
        }}>
          Violations Detected
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2.8rem',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          color: flash ? '#ef4444' : 'var(--text-primary)',
          transition: 'color 0.3s ease',
        }}>
          {violationCount}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Illegal parking incidents
        </div>
      </div>

      {/* Vehicle Counts Chart */}
      <div className="glass-card" style={{ padding: '20px 16px' }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12,
        }}>
          Vehicle Breakdown
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: 'var(--text-secondary)', fontSize: 9, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-secondary)', fontSize: 9, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={VEHICLE_COLORS[entry.name] || '#6b7280'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Alert Panel */}
      <div className="glass-card" style={{
        padding: '16px 20px',
        background: alertActive ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.08)',
        borderColor: alertActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.2)',
        animation: alertActive ? 'alertPulse 1.5s ease-in-out infinite' : 'none',
      }}>
        <style>{`
          @keyframes alertPulse {
            0%, 100% { border-color: rgba(239, 68, 68, 0.3); }
            50% { border-color: rgba(239, 68, 68, 0.7); }
          }
        `}</style>
        {alertActive ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '1rem', fontWeight: 800, color: '#ef4444',
              fontFamily: 'var(--font-display)',
            }}>
              CRITICAL ALERT
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              High congestion risk detected. Deploy enforcement.
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '1rem', fontWeight: 800, color: '#10b981',
              fontFamily: 'var(--font-display)',
            }}>
              Zone Normal
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              No enforcement action required
            </div>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 0',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
          background: connected ? '#10b981' : '#ef4444',
          boxShadow: connected ? '0 0 6px rgba(16,185,129,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
        }} />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
        <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Frame #{frameId}</span>
      </div>
    </div>
  );
}
