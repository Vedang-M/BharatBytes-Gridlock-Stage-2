import { useState, useRef, useEffect, useCallback } from 'react';
import { postChatQuery, postSpeechToText } from '../api/backendApi';

// ── Language auto-detection from Unicode script ───────────────────────────────
function detectLangFromText(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';  // Devanagari → Hindi
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN';  // Kannada script
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';  // Tamil script
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';  // Telugu script
  return 'en-IN';
}

const LANG_LABELS = {
  'en-IN': '🇮🇳 English',
  'hi-IN': '🇮🇳 Hindi',
  'kn-IN': '🇮🇳 Kannada',
  'ta-IN': '🇮🇳 Tamil',
  'te-IN': '🇮🇳 Telugu',
};

// ── WAV playback via Blob URL ─────────────────────────────────────────────────
function playBase64Wav(base64String, audioElementRef) {
  return new Promise((resolve, reject) => {
    try {
      const binary = atob(base64String);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = audioElementRef.current;
      if (!audio) { reject(new Error('No audio element')); return; }

      if (audio.dataset.blobUrl) URL.revokeObjectURL(audio.dataset.blobUrl);
      audio.dataset.blobUrl = url;
      audio.src = url;
      audio.load();
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      const p = audio.play();
      if (p !== undefined) p.then(() => console.log('[Audio] ▶ Playing')).catch(reject);
    } catch (err) { reject(err); }
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am ParkIQ Copilot for Bengaluru Traffic Police. Ask or speak in any language — English, Hindi, Kannada — and I will respond accordingly.',
      lang: 'en-IN',
      audioB64: null,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedLang, setDetectedLang] = useState('en-IN');
  const [micStatus, setMicStatus] = useState(''); // 'recording' | 'processing' | ''
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-detect language as user types
  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.trim().length > 1) {
      const lang = detectLangFromText(val);
      setDetectedLang(lang);
    }
  };

  // ── Replay audio for a specific message ────────────────────────────────────
  const replayAudio = useCallback(async (audioB64) => {
    if (!audioB64 || audioPlaying) return;
    setAudioPlaying(true);
    try {
      await playBase64Wav(audioB64, audioRef);
    } catch (err) {
      console.error('[Audio] Replay error:', err);
    } finally {
      setAudioPlaying(false);
    }
  }, [audioPlaying]);

  // ── Stop any currently playing audio ───────────────────────────────────────
  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setAudioPlaying(false);
  }, []);

  // ── Core: send query to backend ────────────────────────────────────────────
  const sendQuery = useCallback(async (text, langOverride) => {
    if (!text.trim()) return;

    const lang = langOverride || detectLangFromText(text);
    setDetectedLang(lang);

    setMessages((prev) => [...prev, { role: 'user', text, lang, audioB64: null }]);
    setLoading(true);

    try {
      const response = await postChatQuery(text, lang);
      const assistantText = response.text || '(No response)';
      const responseLang = response.language || lang;
      const audioB64 = response.audio_base64 || null;

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: assistantText, lang: responseLang, audioB64 },
      ]);

      // Auto-play audio unless muted
      if (audioB64 && audioB64.length > 0 && !isMuted) {
        setAudioPlaying(true);
        try {
          await playBase64Wav(audioB64, audioRef);
        } catch (err) {
          console.error('[Audio] Playback error:', err);
        } finally {
          setAudioPlaying(false);
        }
      }
    } catch (err) {
      console.error('[Chat]', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${err?.response?.data?.detail || err.message}`, lang: 'en-IN', audioB64: null },
      ]);
    } finally {
      setLoading(false);
    }
  }, [isMuted]);

  // ── Text submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();
    const text = query.trim();
    if (!text || loading) return;
    setQuery('');
    await sendQuery(text);
  }, [query, loading, sendQuery]);

  // ── Voice: MediaRecorder → Sarvam STT ─────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log(`[STT] Sending ${(audioBlob.size / 1024).toFixed(1)}KB audio to Sarvam`);

        setMicStatus('processing');
        setIsRecording(false);

        try {
          const result = await postSpeechToText(audioBlob);
          const transcript = result.transcript?.trim();
          const detectedLanguage = result.language_code || 'en-IN';

          console.log(`[STT] Transcript: "${transcript}", Lang: ${detectedLanguage}`);

          if (transcript) {
            setDetectedLang(detectedLanguage);
            setMicStatus('');
            await sendQuery(transcript, detectedLanguage);
          } else {
            setMicStatus('');
            console.warn('[STT] Empty transcript from Sarvam');
          }
        } catch (err) {
          console.error('[STT] Error:', err);
          setMicStatus('');
        }
      };

      recorder.start();
      setIsRecording(true);
      setMicStatus('recording');
    } catch (err) {
      console.error('[Mic] Access error:', err);
      setMicStatus('');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ── Toggle mute ────────────────────────────────────────────────────────────
  const handleMuteToggle = () => {
    if (audioPlaying) stopAudio();
    setIsMuted((m) => !m);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const isProcessing = micStatus === 'processing';
  const micBusy = isRecording || isProcessing;

  return (
    <>
      <audio ref={audioRef} style={{ display: 'none' }} preload="none" />

      {/* FAB */}
      <button
        id="assistant-fab-btn"
        onClick={() => setIsOpen((o) => !o)}
        title="ParkIQ Copilot"
        style={{
          position: 'fixed', bottom: 56, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%',
          background: audioPlaying ? '#16a34a' : 'var(--accent)',
          color: '#fff', border: 'none',
          boxShadow: audioPlaying
            ? '0 4px 18px rgba(22,163,74,0.6)'
            : '0 4px 18px rgba(15, 118, 110, 0.4)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem',
          transition: 'all 0.25s',
          animation: audioPlaying ? 'speakPulse 1.2s infinite' : 'none',
        }}
        onMouseEnter={(e) => { if (!audioPlaying) { e.currentTarget.style.transform = 'scale(1.1)'; } }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {isOpen ? '✕' : audioPlaying ? '🔊' : '🤖'}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 130, right: 24, zIndex: 9998,
          width: 365, height: 545,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)',
          backdropFilter: 'var(--glass-blur-heavy)',
          WebkitBackdropFilter: 'var(--glass-blur-heavy)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-diffuse)',
          overflow: 'hidden',
          fontFamily: "var(--font-family)",
          transition: 'all 0.3s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', flexShrink: 0, color: '#fff',
              }}>🤖</div>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'var(--font-display)' }}>ParkIQ Copilot</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.67rem', fontWeight: 600 }}>
                  Powered by Sarvam AI
                </div>
              </div>
            </div>
            {/* Language badge — auto-detected */}
            <div style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '4px 10px',
              fontSize: '0.68rem',
              color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 5,
              fontWeight: 700,
            }}>
              <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>AUTO</span>
              {LANG_LABELS[detectedLang] || '🇮🇳 English'}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px 12px',
            display: 'flex', flexDirection: 'column', gap: '10px',
            background: 'transparent',
          }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
              }}>
                <div style={{
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                  color: msg.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user'
                    ? '16px 16px 2px 16px'
                    : '16px 16px 16px 2px',
                  fontSize: '0.83rem',
                  lineHeight: '1.55',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                  wordBreak: 'break-word',
                  fontWeight: 500,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                }}>
                  {msg.text}
                </div>
                {/* Footer: language tag + replay button */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  paddingLeft: msg.role === 'user' ? 0 : 4,
                  paddingRight: msg.role === 'user' ? 4 : 0,
                }}>
                  {msg.lang && msg.lang !== 'en-IN' && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {LANG_LABELS[msg.lang]}
                    </span>
                  )}
                  {/* Per-message replay button for assistant messages with audio */}
                  {msg.role === 'assistant' && msg.audioB64 && (
                    <button
                      onClick={() => replayAudio(msg.audioB64)}
                      disabled={audioPlaying}
                      title="Replay audio"
                      style={{
                        background: 'none', border: 'none',
                        color: audioPlaying ? 'var(--text-muted)' : 'var(--accent)',
                        cursor: audioPlaying ? 'not-allowed' : 'pointer',
                        fontSize: '0.78rem', padding: '2px 4px',
                        borderRadius: '6px',
                        transition: 'all 0.15s',
                        opacity: audioPlaying ? 0.4 : 0.8,
                      }}
                      onMouseEnter={(e) => { if (!audioPlaying) e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = audioPlaying ? '0.4' : '0.8'; }}
                    >
                      🔊
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                padding: '12px 16px', borderRadius: '16px 16px 16px 2px',
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 0.2, 0.4].map((delay, i) => (
                  <span key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--text-muted)', display: 'inline-block',
                    animation: `dotBounce 1s ${delay}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Mic status bar */}
          {micStatus && (
            <div style={{
              padding: '6px 14px',
              background: micStatus === 'recording'
                ? 'var(--status-critical-glow)'
                : 'var(--accent-glow)',
              color: micStatus === 'recording' ? 'var(--status-critical)' : 'var(--accent)',
              fontSize: '0.72rem',
              textAlign: 'center',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontWeight: 600,
            }}>
              {micStatus === 'recording' ? (
                <><span style={{ animation: 'micPulse 1s infinite', display: 'inline-block' }}>🔴</span> Recording — tap mic to stop</>
              ) : (
                <><span>⏳</span> Copilot is transcribing your voice...</>
              )}
            </div>
          )}

          {/* Input bar */}
          <form onSubmit={handleSubmit} style={{
            padding: '12px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: '8px', alignItems: 'center',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}>
            {/* Mic button */}
            <button
              type="button"
              id="voice-input-btn"
              onClick={handleMicClick}
              disabled={isProcessing || loading}
              title={isRecording ? 'Stop recording' : 'Speak in any language'}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                border: isRecording
                  ? '2px solid var(--status-critical)'
                  : isProcessing
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border)',
                background: isRecording
                  ? 'var(--status-critical-glow)'
                  : isProcessing
                    ? 'var(--accent-glow)'
                    : 'var(--bg-hover)',
                color: isRecording ? 'var(--status-critical)' : isProcessing ? 'var(--accent)' : 'var(--text-primary)',
                cursor: (isProcessing || loading) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.95rem', flexShrink: 0,
                transition: 'all 0.2s',
                animation: isRecording ? 'micPulse 1.5s infinite' : 'none',
              }}
            >
              {isRecording ? '⏹' : isProcessing ? '⏳' : '🎤'}
            </button>

            {/* Speaker / Mute toggle button */}
            <button
              type="button"
              id="speaker-toggle-btn"
              onClick={handleMuteToggle}
              title={isMuted ? 'Unmute voice responses' : 'Mute voice responses'}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                border: `1px solid ${isMuted ? 'var(--status-critical)' : 'var(--border)'}`,
                background: isMuted ? 'var(--status-critical-glow)' : audioPlaying ? 'var(--status-low-glow)' : 'var(--bg-hover)',
                color: isMuted ? 'var(--status-critical)' : audioPlaying ? 'var(--status-low)' : 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.95rem', flexShrink: 0,
                transition: 'all 0.2s',
                animation: audioPlaying && !isMuted ? 'speakPulse 1.5s infinite' : 'none',
              }}
            >
              {isMuted ? '🔇' : audioPlaying ? '🔊' : '🔈'}
            </button>

            {/* Text input */}
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e); }}
              placeholder={micBusy ? '🎙 Recording...' : 'Type in any language...'}
              disabled={micBusy}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '20px',
                border: '1px solid var(--border)',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.83rem',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
            />

            {/* Send button */}
            <button
              type="submit"
              id="chat-send-btn"
              disabled={loading || !query.trim() || micBusy}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: (loading || !query.trim() || micBusy) ? 'var(--bg-hover)' : 'var(--accent)',
                color: (loading || !query.trim() || micBusy) ? 'var(--text-muted)' : '#fff',
                border: 'none',
                cursor: (loading || !query.trim() || micBusy) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.95rem', flexShrink: 0,
                transition: 'all 0.2s',
              }}
            >➤</button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes dotBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(239,68,68,0.25); }
          50% { box-shadow: 0 0 0 7px rgba(239,68,68,0.05); }
        }
        @keyframes speakPulse {
          0%, 100% { box-shadow: 0 4px 18px rgba(22,163,74,0.5); }
          50% { box-shadow: 0 4px 28px rgba(22,163,74,0.9); }
        }
      `}
      </style>
    </>
  );
}
