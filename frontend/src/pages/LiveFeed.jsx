import { useState, useEffect, useRef, useCallback } from 'react';
import { LIVE_STREAM_WS_URL } from '../api/backendApi';
import DetectionSidebar from '../components/DetectionSidebar';

export default function LiveFeed() {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const [connected, setConnected] = useState(false);
  const [frameData, setFrameData] = useState(null);
  const [meta, setMeta] = useState({
    frame_id: 0,
    violation_count: 0,
    ccs_score: 0,
    ccs_category: 'LOW',
    alert_active: false,
    zone_name: '',
    vehicle_counts: {},
    violations_this_frame: [],
  });
  const [eventLog, setEventLog] = useState([]);
  const [fps, setFps] = useState(0);
  const frameTimestamps = useRef([]);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(LIVE_STREAM_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[LiveFeed] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setFrameData(data.frame);
        setMeta({
          frame_id: data.frame_id,
          violation_count: data.violation_count,
          ccs_score: data.ccs_score,
          ccs_category: data.ccs_category,
          alert_active: data.alert_active,
          zone_name: data.zone_name,
          vehicle_counts: data.vehicle_counts || {},
          violations_this_frame: data.violations_this_frame || [],
        });

        // FPS calculation
        const now = performance.now();
        frameTimestamps.current.push(now);
        const cutoff = now - 1000;
        frameTimestamps.current = frameTimestamps.current.filter((t) => t > cutoff);
        setFps(frameTimestamps.current.length);

        // Add new violations to event log
        if (data.violations_this_frame && data.violations_this_frame.length > 0) {
          const timestamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
          const newEntries = data.violations_this_frame.map((v) => ({
            time: timestamp,
            type: v.type,
            id: `${data.frame_id}-${v.track_id}`,
          }));
          setEventLog((prev) => [...newEntries, ...prev].slice(0, 5));
        }
      } catch (err) {
        console.error('[LiveFeed] Parse error:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[LiveFeed] WebSocket closed, reconnecting in 3s...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('[LiveFeed] WebSocket error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Video Detection</h1>
          <p className="page-subtitle">Real-time YOLOv8 vehicle detection and violation tracking</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Left panel – 65% */}
        <div style={{ flex: '0 0 65%', minWidth: 0 }}>
          {/* Status bar */}
          <div className="glass-card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', marginBottom: 16, flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                background: connected ? '#10b981' : '#ef4444',
                boxShadow: connected ? '0 0 6px rgba(16,185,129,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
              }} />
              <span style={{
                fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)',
              }}>
                {meta.zone_name || 'Waiting for stream...'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{
                fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
              }}>
                {fps} FPS
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 10px', borderRadius: 30, fontSize: '0.72rem', fontWeight: 700,
                background: meta.violation_count > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.08)',
                color: meta.violation_count > 0 ? '#ef4444' : '#10b981',
              }}>
                {meta.violation_count} violation{meta.violation_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Video feed */}
          <div style={{
            position: 'relative',
            background: '#0a0a0a',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            boxShadow: connected
              ? '0 0 20px rgba(20, 184, 166, 0.1), 0 10px 30px -10px rgba(0,0,0,0.3)'
              : 'var(--shadow-diffuse)',
            marginBottom: 16,
          }}>
            {frameData ? (
              <img
                src={`data:image/jpeg;base64,${frameData}`}
                alt="Live detection feed"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: 400, color: 'var(--text-muted)',
                gap: 12,
              }}>
                <div className="loading-container" style={{ height: 'auto' }}>
                  Connecting to live feed...
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Ensure the backend is running with YOLOv8 enabled
                </div>
              </div>
            )}
          </div>

          {/* Event Log */}
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <div style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 10,
            }}>
              Recent Violations
            </div>
            {eventLog.length === 0 ? (
              <div style={{
                fontSize: '0.82rem', color: 'var(--text-muted)',
                padding: '12px 0', textAlign: 'center',
              }}>
                No violations detected yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {eventLog.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 'var(--radius)',
                      background: 'rgba(239, 68, 68, 0.06)',
                      border: '1px solid rgba(239, 68, 68, 0.1)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <span style={{
                      fontFamily: 'monospace', fontSize: '0.75rem',
                      color: 'var(--text-muted)', flexShrink: 0,
                    }}>
                      [{entry.time}]
                    </span>
                    <span style={{ fontWeight: 600, color: '#ef4444', flexShrink: 0 }}>
                      {entry.type}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      — Illegal Parking Detected
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel – 35% */}
        <div style={{ flex: '0 0 35%', minWidth: 0 }}>
          <DetectionSidebar
            ccsScore={meta.ccs_score}
            ccsCategory={meta.ccs_category}
            violationCount={meta.violation_count}
            vehicleCounts={meta.vehicle_counts}
            alertActive={meta.alert_active}
            connected={connected}
            frameId={meta.frame_id}
          />
        </div>
      </div>
    </div>
  );
}
