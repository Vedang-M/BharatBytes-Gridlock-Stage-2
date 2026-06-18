import { useEffect, useRef } from 'react';

/**
 * Mappls native heatmap layer.
 * Replaces the old leaflet-heat CDN-loaded layer — Mappls' SDK ships its
 * own HeatmapLayer, so there's no dynamic script injection needed here.
 */
export default function HeatmapLayer({ map, mapplsClassObject, points }) {
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!map || !mapplsClassObject || !points || points.length === 0) return;

    const data = points.map((p) => ({ lat: p.lat, lng: p.lon }));

    heatLayerRef.current = mapplsClassObject.HeatmapLayer({
      map,
      data,
      radius: 14,
      opacity: 0.7,
      maxIntensity: 10,
      fitbounds: false,
      // Mirrors the old blue -> lime -> yellow -> red leaflet.heat gradient
      gradient: [
        'rgba(0, 0, 255, 0)',
        'rgba(0, 0, 255, 1)',
        'rgba(0, 255, 0, 1)',
        'rgba(255, 255, 0, 1)',
        'rgba(255, 0, 0, 1)',
      ],
    });

    return () => {
      if (heatLayerRef.current) {
        mapplsClassObject.removeLayer({ map, layer: heatLayerRef.current });
        heatLayerRef.current = null;
      }
    };
  }, [points, map, mapplsClassObject]);

  return null;
}