export default function Footer() {
  return (
    <footer
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderTop: '1px solid var(--nav-border)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
        © {new Date().getFullYear()} <span style={{ color: 'var(--accent)', fontWeight: 700 }}>ParkIQ</span>. All rights reserved.
      </span>
      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>
        Smart Parking Intelligence System
      </span>
    </footer>
  );
}