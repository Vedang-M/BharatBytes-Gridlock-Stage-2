import { useEffect, useRef, useState } from 'react';
import { mappls } from 'mappls-web-maps';
import HeatmapLayer from './HeatmapLayer';

// Single shared instance of the Mappls SDK wrapper (per Mappls' own pattern —
// don't recreate this per render, it manages script injection internally).
const mapplsClassObject = new mappls();

// Mappls access token — put this in your .env as VITE_MAPPLS_TOKEN and never
// commit it. This replaces the old hardcoded Leaflet tile URL.
const MAPPLS_ACCESS_TOKEN = import.meta.env.VITE_MAPPLS_TOKEN;

const CCS_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MODERATE: '#eab308',
  LOW: '#22c55e',
};

export default function MapView({ hotspots = [], heatmapPoints = [], topN = 20 }) {
  const mapContainerRef = useRef(null);
  const mapObjectRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  // Initialize the SDK + map once on mount.
  useEffect(() => {
    let cancelled = false;

    mapplsClassObject.initialize(MAPPLS_ACCESS_TOKEN, { map: true }, () => {
      if (cancelled || !mapContainerRef.current) return;

      const map = mapplsClassObject.Map({
        id: mapContainerRef.current.id,
        properties: {
          center: [12.975, 77.595],
          zoom: 12,
          zoomControl: true,
          // closest built-in equivalent to the old CARTO dark basemap
          backgroundColor: 'dark',
        },
      });

      map.on('load', () => {
        if (cancelled) return;
        mapObjectRef.current = map;
        setMapReady(true);
      });
    });

    return () => {
      cancelled = true;
      // Mappls map objects don't need an explicit teardown call the way
      // Leaflet's map.remove() does, but we do clear markers below.
      mapObjectRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render hotspot markers whenever data or map readiness changes.
  useEffect(() => {
    if (!mapReady || !mapObjectRef.current) return;
    const map = mapObjectRef.current;

    // Clear previous markers before drawing the new set.
    markersRef.current.forEach((m) => {
      mapplsClassObject.removeLayer({ map, layer: m });
    });
    markersRef.current = [];

    hotspots.slice(0, topN).forEach((h) => {
      const cat = h.CCS_category || 'LOW';
      const color = CCS_COLORS[cat];
      const radius = Math.max(6, Math.min(h.CCS * 3.5, 28));

      const popupHtml = `
        <div style="font-family: var(--font-family); min-width: 210px; font-size: 13px; color: #171717;">
          <strong style="font-size: 14px;">${h.top_junction}</strong>
          <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e5e5;" />
          <div>CCS: <strong style="color: ${color};">${h.CCS}/10</strong> (${cat})</div>
          <div style="margin-top: 4px;">Archetype: ${h.archetype}</div>
          <div>Violations: ${Number(h.violations).toLocaleString()}</div>
          <div>Peak: ${h.peak_pct}%</div>
          <div style="margin-top: 4px; color: #737373;">Station: ${h.top_police}</div>
        </div>
      `;

      // Mappls doesn't have a native "filled circle of variable radius"
      // marker primitive like Leaflet's CircleMarker, so we render a round
      // div-icon marker sized by `radius` to reproduce the same visual.
      // IMPORTANT: the `html` option needs an HTML *string*, not a live
      // DOM node — passing an element gets stringified by the SDK and
      // renders literally as "[object HTMLDivElement]" on the map.
      const iconHtml = `<div style="
        width: ${radius * 2}px;
        height: ${radius * 2}px;
        border-radius: 50%;
        background: ${color};
        opacity: 0.55;
        border: 2px solid ${color};
        box-sizing: border-box;
      "></div>`;

      const marker = mapplsClassObject.Marker({
        map,
        position: { lat: h.lat, lng: h.lon },
        html: iconHtml,
        popupHtml,
        popupOptions: { openPopup: false },
      });

      markersRef.current.push(marker);
    });
  }, [hotspots, topN, mapReady]);

  return (
    <div className="map-container">
      <div id="mappls-map" ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
      {mapReady && heatmapPoints.length > 0 && (
        <HeatmapLayer map={mapObjectRef.current} mapplsClassObject={mapplsClassObject} points={heatmapPoints} />
      )}
    </div>
  );
}