import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        <div>
          <div className="navbar-title">ParkIQ</div>
          <div className="navbar-subtitle">Enforcement Dashboard</div>
        </div>
      </NavLink>

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
      </div>
    </nav>
  );
}
