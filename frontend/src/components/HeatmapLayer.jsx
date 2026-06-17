import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Leaflet heatmap layer via leaflet-heat.
 * Loads the plugin dynamically from CDN.
 */
export default function HeatmapLayer({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    let heatLayer;

    const applyHeat = () => {
      const data = points.map((p) => [p.lat, p.lon, 0.6]);
      heatLayer = L.heatLayer(data, {
        radius: 14,
        blur: 18,
        minOpacity: 0.35,
        maxZoom: 15,
        gradient: { 0.3: 'blue', 0.55: 'lime', 0.75: 'yellow', 1.0: 'red' },
      }).addTo(map);
    };

    // Check if L.heatLayer already loaded
    if (L.heatLayer) {
      applyHeat();
    } else {
      // Load leaflet-heat from CDN
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
      script.onload = applyHeat;
      document.head.appendChild(script);
    }

    return () => {
      if (heatLayer) map.removeLayer(heatLayer);
    };
  }, [points, map]);

  return null;
}
