import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import GlossaryModal from './GlossaryModal';

export default function Navbar() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <>
      <GlossaryModal isOpen={glossaryOpen} onClose={() => setGlossaryOpen(false)} />

      <nav className="navbar">
        <style>{`
          @keyframes livePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
          .live-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ef4444;
            display: inline-block;
            margin-left: 6px;
            animation: livePulse 1.2s infinite;
          }
          .glossary-nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 14px;
            border-radius: 8px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-secondary);
            font-size: 0.82rem;
            font-weight: 600;
            font-family: var(--font-family);
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
          }
          .glossary-nav-btn:hover {
            border-color: var(--accent);
            color: var(--accent);
            background: rgba(var(--accent-rgb, 20 184 166), 0.06);
          }
        `}</style>

        <NavLink to="/" className="navbar-brand">
          <div>
            <div className="navbar-logo">ParkIQ</div>
            <div className="navbar-subtitle">Enforcement Dashboard</div>
          </div>
        </NavLink>

        <div className="navbar-right">
          <div className="navbar-links">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
              Overview
            </NavLink>
            <NavLink to="/hotspots" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Hotspots
            </NavLink>
            <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Analytics
            </NavLink>
            <NavLink to="/model" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Model Performance
            </NavLink>
            <NavLink
              to="/live"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <span>Live Feed</span>
              <span className="live-dot" />
            </NavLink>
          </div>

          {/* Glossary Button */}
          <button
            className="glossary-nav-btn"
            onClick={() => setGlossaryOpen(true)}
            title="Open Project Glossary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
            Glossary
          </button>

          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
