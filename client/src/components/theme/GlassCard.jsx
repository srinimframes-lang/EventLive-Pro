/** Glassmorphism card wrapper for themed watch sections. */
export default function GlassCard({ children, className = '', dark = false, animate = true }) {
  return (
    <div
      className={`theme-glass-card ${dark ? 'theme-glass-dark' : ''} ${animate ? 'theme-animate-fade-up' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
