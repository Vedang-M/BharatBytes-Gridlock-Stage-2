import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import HeatmapLayer from './HeatmapLayer';

const CCS_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MODERATE: '#eab308',
  LOW: '#22c55e',
};

export default function MapView({ hotspots = [], heatmapPoints = [], topN = 20 }) {
  return (
    <div className="map-container">
      <MapContainer
        center={[12.975, 77.595]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
        />

        {heatmapPoints.length > 0 && <HeatmapLayer points={heatmapPoints} />}

        {hotspots.slice(0, topN).map((h, i) => {
          const cat = h.CCS_category || 'LOW';
          const color = CCS_COLORS[cat];
          const radius = Math.max(6, Math.min(h.CCS * 3.5, 28));

          return (
            <CircleMarker
              key={i}
              center={[h.lat, h.lon]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.55,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'var(--font-family)', minWidth: 210, fontSize: 13, color: '#171717' }}>
                  <strong style={{ fontSize: 14 }}>{h.top_junction}</strong>
                  <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid #e5e5e5' }} />
                  <div>CCS: <strong style={{ color }}>{h.CCS}/10</strong> ({cat})</div>
                  <div style={{ marginTop: 4 }}>Archetype: {h.archetype}</div>
                  <div>Violations: {Number(h.violations).toLocaleString()}</div>
                  <div>Peak: {h.peak_pct}%</div>
                  <div style={{ marginTop: 4, color: '#737373' }}>Station: {h.top_police}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
