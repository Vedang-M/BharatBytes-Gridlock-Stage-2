import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// ── Hotspots ──────────────────────────────────────────────────
export const getHotspots = (topN = 50) =>
  api.get('/hotspots', { params: { top_n: topN } }).then(r => r.data);

export const getHeatmapData = (sampleN = 30000) =>
  api.get('/hotspots/heatmap', { params: { sample_n: sampleN } }).then(r => r.data);

export const getSchedule = (nZones = 8) =>
  api.get('/hotspots/schedule', { params: { n_zones: nZones } }).then(r => r.data);

export const postChatQuery = (query, language = 'en-IN') =>
  api.post('/assistant/chat', { query, language }).then(r => r.data);

// Send audio blob to Sarvam STT → returns { transcript, language_code }
export const postSpeechToText = (audioBlob) => {
  const form = new FormData();
  form.append('file', audioBlob, 'recording.wav');
  return api.post('/assistant/stt', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }).then(r => r.data);
};

export const getSummary = () =>
  api.get('/hotspots/summary').then(r => r.data);

// ── Predictions ───────────────────────────────────────────────
export const postPrediction = (features) =>
  api.post('/predictions/predict', features).then(r => r.data);

export const getModelMetrics = () =>
  api.get('/predictions/model-metrics').then(r => r.data);

export const getForecast = () =>
  api.get('/predictions/forecast').then(r => r.data);

// ── Analytics ─────────────────────────────────────────────────
export const getTemporalData = () =>
  api.get('/analytics/temporal').then(r => r.data);

export const getTemporalHeatmap = () =>
  api.get('/analytics/heatmap').then(r => r.data);

export const getDailyTrend = () =>
  api.get('/analytics/trend').then(r => r.data);

export const getViolationTypes = () =>
  api.get('/analytics/violations').then(r => r.data);

export const getVehicleTypes = () =>
  api.get('/analytics/vehicles').then(r => r.data);

export const getROI = (params = {}) =>
  api.get('/analytics/roi', { params }).then(r => r.data);

export default api;

export const getMorningBrief = () =>
  api.get('/brief').then(r => r.data);