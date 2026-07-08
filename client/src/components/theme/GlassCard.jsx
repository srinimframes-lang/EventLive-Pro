/** Glass card with reduced blur for readable content areas. */
export default function GlassCard({ children, className = '', dark = false, solid = false, animate = true }) {
  return (
    <div
      className={`theme-glass-card ${dark ? 'theme-glass-dark' : ''} ${solid ? 'theme-glass-solid' : ''} ${animate ? 'theme-animate-fade-up' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
