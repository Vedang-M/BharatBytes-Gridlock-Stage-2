/**
 * WhatIfZonePlanner.jsx
 *
 * Drop this into frontend/src/components/
 * and render it inside your Analytics or a new "What-If" page.
 *
 * Props:
 *   apiBase  – e.g. "http://localhost:8000"  (defaults to same origin)
 *
 * The component renders:
 *   1. An instruction banner
 *   2. A MapmyIndia map where the user draws a rectangle
 *   3. A clearance slider (0–100 %)
 *   4. A rich results panel: before/after CCS gauge, impact cards,
 *      violation-type breakdown bar chart, vehicle mix donut,
 *      affected clusters table, and peak-hour sparkline
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { mappls } from 'mappls-web-maps';
import { getHotspots } from '../api/backendApi';

const mapplsClassObject = new mappls();
const MAPPLS_ACCESS_TOKEN = import.meta.env.VITE_MAPPLS_TOKEN;

// ── colour helpers ──────────────────────────────────────────────
const CCS_COLOUR = (cat) =>
    ({ CRITICAL: "#ef4444", HIGH: "#f97316", MODERATE: "#eab308", LOW: "#22c55e" }[cat] ?? "#6b7280");

const fmt = (n, dec = 1) =>
    n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: dec });

// ── Mini gauge (SVG arc) ────────────────────────────────────────
function CCSGauge({ value = 0, category = "LOW", label = "CCS" }) {
    const pct = Math.min(value / 10, 1);
    const r = 52;
    const circ = Math.PI * r;          // half-circle circumference
    const dash = pct * circ;
    const colour = CCS_COLOUR(category);
    return (
        <div style={{ textAlign: "center" }}>
            <svg width="130" height="75" viewBox="0 0 130 75">
                {/* background arc */}
                <path
                    d="M 10 65 A 55 55 0 0 1 120 65"
                    fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round"
                />
                {/* value arc */}
                <path
                    d="M 10 65 A 55 55 0 0 1 120 65"
                    fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ}`}
                    style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
                <text x="65" y="62" textAnchor="middle" fontSize="20" fontWeight="700" fill={colour}>
                    {fmt(value, 2)}
                </text>
                <text x="65" y="74" textAnchor="middle" fontSize="9" fill="#6b7280">{label}</text>
            </svg>
            <div style={{
                display: "inline-block", padding: "2px 10px", borderRadius: 12,
                background: colour + "22", color: colour, fontWeight: 700, fontSize: 11, marginTop: 2,
            }}>
                {category}
            </div>
        </div>
    );
}

// ── Thin horizontal bar ─────────────────────────────────────────
function Bar({ value, max, colour = "#14b8a6", label, sub }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: "#374151", fontWeight: 500 }}>{label}</span>
                <span style={{ color: "#6b7280" }}>{sub}</span>
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 6, height: 7, overflow: "hidden" }}>
                <div style={{
                    width: `${pct}%`, background: colour, height: "100%", borderRadius: 6,
                    transition: "width 0.5s ease",
                }} />
            </div>
        </div>
    );
}

// ── Donut (vehicle mix) ─────────────────────────────────────────
const DONUT_COLOURS = ["#14b8a6", "#6366f1", "#f97316", "#eab308", "#ec4899", "#3b82f6"];
function Donut({ data = [] }) {
    const total = data.reduce((s, d) => s + d.count, 0) || 1;
    let angle = -90;
    const cx = 60, cy = 60, r = 46, inner = 28;
    const slices = data.map((d, i) => {
        const deg = (d.count / total) * 360;
        const start = angle;
        angle += deg;
        const a1 = (start * Math.PI) / 180;
        const a2 = (angle * Math.PI) / 180;
        const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2); const y2 = cy + r * Math.sin(a2);
        const xi1 = cx + inner * Math.cos(a1); const yi1 = cy + inner * Math.sin(a1);
        const xi2 = cx + inner * Math.cos(a2); const yi2 = cy + inner * Math.sin(a2);
        const lg = deg > 180 ? 1 : 0;
        return (
            <path key={i}
                d={`M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${lg} 0 ${xi1} ${yi1}`}
                fill={DONUT_COLOURS[i % DONUT_COLOURS.length]} opacity={0.88}
            />
        );
    });
    return (
        <svg width="120" height="120" viewBox="0 0 120 120">
            {slices}
            <text x="60" y="64" textAnchor="middle" fontSize="9" fill="#6b7280">mix</text>
        </svg>
    );
}

// ── Main component ──────────────────────────────────────────────
export default function WhatIfZonePlanner({ apiBase = "" }) {
    const mapRef = useRef(null);
    const mapObj = useRef(null);
    const rectLayer = useRef(null);
    const markersRef = useRef([]);

    const [hotspots, setHotspots] = useState([]);
    const [drawing, setDrawing] = useState(false);
    const [startLL, setStartLL] = useState(null);
    const [bounds, setBounds] = useState(null);   // {lat_min,lat_max,lon_min,lon_max}
    const [clearance, setClearance] = useState(100);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        getHotspots(50).then(data => setHotspots(data)).catch(console.error);
    }, []);

    // ── Initialise MapmyIndia map ──────────────────────────────
    useEffect(() => {
        let cancelled = false;

        mapplsClassObject.initialize(MAPPLS_ACCESS_TOKEN, { map: true }, () => {
            if (cancelled || !mapRef.current) return;

            const map = mapplsClassObject.Map({
                id: mapRef.current.id,
                properties: {
                    center: [12.9716, 77.5946],
                    zoom: 12,
                    zoomControl: true,
                    backgroundColor: 'dark',
                }
            });

            map.on('load', () => {
                if (cancelled) return;
                mapObj.current = map;

                // Render hotspots once the map is loaded
                if (hotspots.length > 0) {
                    hotspots.forEach(h => {
                        const cat = h.CCS_category || 'LOW';
                        const color = CCS_COLOUR(cat);
                        const radius = Math.max(6, Math.min(h.CCS * 3.5, 28));

                        const popupHtml = `
                            <div style="font-family: var(--font-family); min-width: 210px; font-size: 13px; color: #171717;">
                            <strong style="font-size: 14px;">${h.top_junction}</strong>
                            <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e5e5;" />
                            <div>CCS: <strong style="color: ${color};">${h.CCS}/10</strong> (${cat})</div>
                            </div>
                        `;

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
                }

                // Mouse events for rectangle drawing
                map.on("mousedown", (e) => {
                    if (!drawingRef.current) return;
                    setStartLL({ lat: e.lngLat.lat, lng: e.lngLat.lng });
                });

                map.on("mouseup", (e) => {
                    if (!drawingRef.current || !startLLRef.current) return;
                    const end = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                    
                    // If bounds are effectively zero, just reset drawing state
                    if (Math.abs(startLLRef.current.lat - end.lat) < 0.0001 || 
                        Math.abs(startLLRef.current.lng - end.lng) < 0.0001) {
                        setDrawing(false);
                        if (map.dragPan) map.dragPan.enable();
                        return;
                    }

                    const b = {
                        lat_min: Math.min(startLLRef.current.lat, end.lat),
                        lat_max: Math.max(startLLRef.current.lat, end.lat),
                        lon_min: Math.min(startLLRef.current.lng, end.lng),
                        lon_max: Math.max(startLLRef.current.lng, end.lng),
                    };
                    setBounds(b);
                    setDrawing(false);
                    if (map.dragPan) map.dragPan.enable();
                    drawRect(map, b);
                });
            });
        });

        return () => {
            cancelled = true;
            if (mapObj.current) {
                markersRef.current.forEach(m => {
                    try { mapplsClassObject.removeLayer({ map: mapObj.current, layer: m }); } catch (_) { }
                });
                markersRef.current = [];
                mapObj.current = null;
            }
        };
    }, [hotspots]);

    // keep refs in sync so map callbacks can read latest state
    const drawingRef = useRef(drawing);
    const startLLRef = useRef(startLL);
    useEffect(() => { drawingRef.current = drawing; }, [drawing]);
    useEffect(() => { startLLRef.current = startLL; }, [startLL]);

    const drawRect = (map, b) => {
        if (rectLayer.current) {
            try { mapplsClassObject.removeLayer({ map, layer: rectLayer.current }); } catch (_) { }
        }
        
        rectLayer.current = mapplsClassObject.Polygon({
            map: map,
            paths: [
                { lat: b.lat_min, lng: b.lon_min },
                { lat: b.lat_max, lng: b.lon_min },
                { lat: b.lat_max, lng: b.lon_max },
                { lat: b.lat_min, lng: b.lon_max }
            ],
            fillColor: "#14b8a6",
            fillOpacity: 0.15,
            strokeColor: "#14b8a6",
            strokeOpacity: 0.8,
            weight: 2,
        });
    };

    // ── API call ────────────────────────────────────────────────
    const runSimulation = useCallback(async () => {
        if (!bounds) return;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const params = new URLSearchParams({
                lat_min: bounds.lat_min,
                lat_max: bounds.lat_max,
                lon_min: bounds.lon_min,
                lon_max: bounds.lon_max,
                clearance_pct: clearance,
            });
            const res = await fetch(`${apiBase}/api/analytics/what-if?${params}`);
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [bounds, clearance, apiBase]);

    const reset = () => {
        setBounds(null);
        setResult(null);
        setError(null);
        if (rectLayer.current && mapObj.current) {
            try { mapObj.current.removeLayer(rectLayer.current); } catch (_) { }
            rectLayer.current = null;
        }
    };

    // ── Styles ──────────────────────────────────────────────────
    const badge = (cat) => ({
        display: "inline-block", padding: "2px 10px", borderRadius: 10,
        background: CCS_COLOUR(cat) + "22", color: CCS_COLOUR(cat),
        fontWeight: 700, fontSize: 11,
    });
    const impactCard = (colour) => ({
        background: colour + "11", border: `1px solid ${colour}33`,
        borderRadius: 10, padding: "12px 16px", flex: "1 1 140px",
    });

    return (
        <div className="page-container" style={{ paddingTop: 0 }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                    What-If Zone Planner
                </h2>
                <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                    Draw a zone on the map to simulate the congestion impact of clearing illegal parking.
                </p>
            </div>

            {/* Instruction banner */}
            <div style={{
                background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10,
                padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#065f46",
                display: "flex", alignItems: "center", gap: 10,
            }}>
                <span style={{ fontSize: 16, fontWeight: "bold" }}>i</span>
                <span>
                    {!bounds
                        ? <><strong>Step 1:</strong> Click "Start Drawing", then click-drag on the map to select a zone.</>
                        : <><strong>Zone selected!</strong> Adjust the clearance slider, then click <strong>Run Simulation</strong>.</>
                    }
                </span>
            </div>

            {/* Controls row */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <button
                    onClick={() => { 
                        setDrawing(true); 
                        setResult(null); 
                        setError(null);
                        if (mapObj.current && mapObj.current.dragPan) {
                            mapObj.current.dragPan.disable();
                        }
                    }}
                    disabled={drawing}
                    style={{
                        background: drawing ? "#d1fae5" : "#14b8a6", color: drawing ? "#065f46" : "#fff",
                        border: "none", borderRadius: 8, padding: "9px 18px",
                        fontWeight: 600, fontSize: 13, cursor: drawing ? "not-allowed" : "pointer",
                    }}
                >
                    {drawing ? "Drawing… click-drag on map" : "Start Drawing"}
                </button>

                {bounds && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 220 }}>
                            <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                                Clearance %:
                            </span>
                            <input
                                type="range" min={10} max={100} step={10}
                                value={clearance}
                                onChange={(e) => setClearance(Number(e.target.value))}
                                style={{ flex: 1, accentColor: "#14b8a6" }}
                            />
                            <span style={{
                                fontWeight: 700, fontSize: 14, color: "#14b8a6",
                                minWidth: 40, textAlign: "right",
                            }}>
                                {clearance}%
                            </span>
                        </div>

                        <button
                            onClick={runSimulation}
                            disabled={loading}
                            style={{
                                background: "#6366f1", color: "#fff", border: "none",
                                borderRadius: 8, padding: "9px 20px", fontWeight: 600,
                                fontSize: 13, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? "Simulating…" : "Run Simulation"}
                        </button>

                        <button
                            onClick={reset}
                            style={{
                                background: "#f3f4f6", color: "#6b7280", border: "none",
                                borderRadius: 8, padding: "9px 16px", fontWeight: 600,
                                fontSize: 13, cursor: "pointer",
                            }}
                        >
                            Reset
                        </button>
                    </>
                )}
            </div>

            {/* Map */}
            <div
                id="whatif-map"
                ref={mapRef}
                className="map-container"
                style={{
                    marginBottom: 20,
                    cursor: drawing ? "crosshair" : "default",
                }}
            >
                {/* Fallback if SDK not available */}
                {!window.MapmyIndia && !window.mappls && !mapObj.current && (
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        height: "100%", color: "#6b7280", fontSize: 14,
                    }}>
                        Loading Map SDK... (If this persists, check your MAPPLS_ACCESS_TOKEN)
                    </div>
                )}
            </div>

            {/* Manual coordinate input (fallback / hackathon demo mode) */}
            {!bounds && (
                <details style={{ marginBottom: 16 }}>
                    <summary style={{ fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
                        Or enter coordinates manually (demo mode)
                    </summary>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        {[
                            ["lat_min", "South Lat", "12.960"],
                            ["lat_max", "North Lat", "12.980"],
                            ["lon_min", "West Lon", "77.570"],
                            ["lon_max", "East Lon", "77.590"],
                        ].map(([key, label, placeholder]) => (
                            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "#374151" }}>
                                {label}
                                <input
                                    type="number" step="0.001" placeholder={placeholder}
                                    style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
                                    onChange={(e) =>
                                        setBounds((prev) => ({ ...(prev ?? { lat_min: 12.96, lat_max: 12.98, lon_min: 77.57, lon_max: 77.59 }), [key]: parseFloat(e.target.value) || 0 }))
                                    }
                                />
                            </label>
                        ))}
                        <button
                            onClick={() => setBounds((b) => b ?? { lat_min: 12.960, lat_max: 12.980, lon_min: 77.570, lon_max: 77.590 })}
                            style={{
                                alignSelf: "flex-end", background: "#14b8a6", color: "#fff",
                                border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer",
                            }}
                        >
                            Set Zone
                        </button>
                    </div>
                </details>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
                    padding: "12px 16px", color: "#dc2626", fontSize: 13, marginBottom: 16,
                }}>
                    {error}
                </div>
            )}

            {/* ── Results panel ───────────────────────────────────── */}
            {result && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Before / After gauges */}
                    <div className="glass-card" style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", padding: "16px 20px" }}>
                        <div style={{ flex: 1, minWidth: 140, textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>BEFORE CLEARANCE</div>
                            <CCSGauge value={result.before.ccs} category={result.before.ccs_category} label="CCS Score" />
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
                                {fmt(result.before.violations, 0)} violations
                            </div>
                        </div>

                        {/* Arrow */}
                        <div style={{ padding: "0 20px", fontSize: 28, color: "#14b8a6", fontWeight: 700 }}>→</div>

                        <div style={{ flex: 1, minWidth: 140, textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#14b8a6", marginBottom: 6, fontWeight: 600 }}>AFTER {clearance}% CLEARANCE</div>
                            <CCSGauge value={result.after.ccs} category={result.after.ccs_category} label="CCS Score" />
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
                                {fmt(result.after.violations, 0)} violations remain
                            </div>
                        </div>

                        {/* CCS reduction badge */}
                        <div style={{
                            flex: "0 0 auto", padding: "16px 24px", textAlign: "center",
                            borderLeft: "1px solid #f3f4f6",
                        }}>
                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>CCS REDUCED BY</div>
                            <div style={{ fontSize: 36, fontWeight: 800, color: "#14b8a6", lineHeight: 1 }}>
                                {result.impact.ccs_reduction_pct}%
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                                ({fmt(result.impact.ccs_reduction, 2)} points)
                            </div>
                        </div>
                    </div>

                    {/* Impact cards */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                        {[
                            { label: "Violations Cleared", value: fmt(result.impact.violations_cleared, 0), sub: `of ${fmt(result.before.violations, 0)} in zone`, colour: "#14b8a6" },
                            { label: "Traffic Flow Improvement", value: `+${result.impact.flow_improvement_pct}%`, sub: "estimated carriageway gain", colour: "#6366f1" },
                            { label: "Delay Saved", value: `${result.impact.delay_saved_min} min`, sub: "per vehicle per pass", colour: "#f97316" },
                            { label: "Total Savings (Daily)", value: `₹${fmt(result.impact.total_savings_inr, 0)}`, sub: `VOT ₹${fmt(result.impact.roi_vot_saved, 0)} + Fuel ₹${fmt(result.impact.roi_fuel_saved, 0)}`, colour: "#22c55e" },
                        ].map((item) => (
                            <div key={item.label} style={impactCard(item.colour)}>
                                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: item.colour }}>{item.value}</div>
                                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{item.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Zone details row */}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>

                        {/* Violation type breakdown */}
                        <div className="glass-card" style={{ flex: "2 1 280px", padding: "16px 20px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Top Violation Types in Zone</div>
                            {result.cleared_by_type.map((d, i) => (
                                <Bar
                                    key={i}
                                    label={d.type}
                                    value={d.count}
                                    max={result.cleared_by_type[0]?.count || 1}
                                    colour={DONUT_COLOURS[i % DONUT_COLOURS.length]}
                                    sub={`${fmt(d.count, 0)} total · ${fmt(d.cleared, 0)} cleared`}
                                />
                            ))}
                        </div>

                        {/* Vehicle mix donut */}
                        <div className="glass-card" style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 20px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, alignSelf: "flex-start" }}>Vehicle Mix</div>
                            <Donut data={result.vehicle_mix} />
                            <div style={{ marginTop: 8, width: "100%" }}>
                                {result.vehicle_mix.slice(0, 5).map((d, i) => (
                                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280", marginBottom: 2 }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: DONUT_COLOURS[i], display: "inline-block" }} />
                                            {d.vehicle}
                                        </span>
                                        <span>{fmt(d.count, 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Peak hours */}
                        <div className="glass-card" style={{ flex: "1 1 180px", padding: "16px 20px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Peak Hours in Zone</div>
                            {result.peak_hours.map((d, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
                                    <span style={{ color: "#374151" }}>
                                        {String(d.hour_ist).padStart(2, "0")}:00–{String((d.hour_ist + 1) % 24).padStart(2, "0")}:00
                                    </span>
                                    <span style={{ fontWeight: 600, color: i === 0 ? "#ef4444" : "#6b7280" }}>
                                        {fmt(d.count, 0)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Affected hotspot clusters */}
                    {result.affected_clusters?.length > 0 && (
                        <div className="glass-card" style={{ padding: "16px 20px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
                                Existing Hotspot Clusters in / Near Zone
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                    <tr style={{ borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>
                                        {["Junction", "CCS", "Category", "Violations"].map((h) => (
                                            <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.affected_clusters.map((c, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid #f9fafb" }}>
                                            <td style={{ padding: "6px 8px", fontWeight: 500 }}>{c.name}</td>
                                            <td style={{ padding: "6px 8px", fontWeight: 700, color: CCS_COLOUR(c.category) }}>{fmt(c.ccs, 2)}</td>
                                            <td style={{ padding: "6px 8px" }}>
                                                <span style={badge(c.category)}>{c.category}</span>
                                            </td>
                                            <td style={{ padding: "6px 8px", color: "#6b7280" }}>{fmt(c.violations, 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Zone meta */}
                    <div className="glass-card" style={{ fontSize: 11, color: "#9ca3af", padding: "16px 20px" }}>
                        <strong>Zone bounds:</strong>{" "}
                        Lat [{fmt(result.zone_bounds.lat_min, 4)}, {fmt(result.zone_bounds.lat_max, 4)}] ·
                        Lon [{fmt(result.zone_bounds.lon_min, 4)}, {fmt(result.zone_bounds.lon_max, 4)}] ·
                        Clearance assumed: {result.clearance_pct}% ·
                        Before peak share: {result.before.peak_pct}% ·
                        Avg severity: {result.before.avg_severity}
                    </div>
                </div>
            )}
        </div>
    );
}
