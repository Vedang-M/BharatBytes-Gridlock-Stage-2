import { useState, useRef, useEffect } from 'react';
import { postChatQuery } from '../api/backendApi';

export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! I am ParkIQ Assistant. How can I help you analyze the traffic and hotspot data?' }
  ]);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('en-IN');
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = { role: 'user', text: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await postChatQuery(userMessage.text, language);
      const assistantMessage = { role: 'assistant', text: response.text };
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Play audio if provided
      if (response.audio_base64) {
        const audioSrc = `data:audio/wav;base64,${response.audio_base64}`;
        if (audioRef.current) {
          audioRef.current.src = audioSrc;
          audioRef.current.play().catch(err => console.error('Audio play error:', err));
        }
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I encountered an error. Please try again or check API configurations.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        className="assistant-fab" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent)', color: 'white', border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem', transition: 'transform 0.2s'
        }}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className="flat-card"
          style={{
            position: 'fixed', bottom: 90, right: 24, zIndex: 9998,
            width: 350, height: 500, display: 'flex', flexDirection: 'column',
            padding: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid var(--border)'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '4px', borderTopRightRadius: '4px'
          }}>
            <strong style={{ fontSize: '1rem' }}>Ask ParkIQ Copilot</strong>
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem'
              }}
            >
              <option value="en-IN">English</option>
              <option value="hi-IN">Hindi</option>
              <option value="kn-IN">Kannada</option>
            </select>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.role === 'user' ? '#2563eb' : '#333333',
                  color: '#ffffff',
                  padding: '10px 14px', borderRadius: '8px', maxWidth: '85%', fontSize: '0.875rem',
                  lineHeight: '1.4'
                }}
              >
                {msg.text}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start', background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                padding: '10px 14px', borderRadius: '8px', fontSize: '0.875rem'
              }}>
                Typing...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} style={{
            padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', background: 'var(--bg-card)',
            borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px'
          }}>
            <input 
              type="text" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about hotspots..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none'
              }}
            />
            <button 
              type="submit" 
              disabled={loading || !query.trim()}
              style={{
                background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px',
                padding: '0 16px', cursor: (loading || !query.trim()) ? 'not-allowed' : 'pointer',
                opacity: (loading || !query.trim()) ? 0.5 : 1
              }}
            >
              ➤
            </button>
          </form>
          
          {/* Invisible Audio Player for TTS */}
          <audio ref={audioRef} style={{ display: 'none' }} />
        </div>
      )}
    </>
  );
}
