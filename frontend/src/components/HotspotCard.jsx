const CCS_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MODERATE: '#eab308',
  LOW: '#22c55e',
};

export default function HotspotCard({ hotspot, rank }) {
  const cat = hotspot.CCS_category || 'LOW';
  const color = CCS_COLORS[cat];

  return (
    <div className="hotspot-item">
      <div className="hotspot-rank" style={{ color }}>#{rank}</div>
      <div className="hotspot-info">
        <div className="hotspot-name">
          {(hotspot.top_junction || 'Unknown').slice(0, 32)}
        </div>
        <div className="hotspot-meta">
          {hotspot.archetype} · {Number(hotspot.violations).toLocaleString()} violations
        </div>
      </div>
      <div className="hotspot-ccs" style={{ color }}>{hotspot.CCS}</div>
      <span className={`badge badge-${cat.toLowerCase()}`}>{cat}</span>
    </div>
  );
}
