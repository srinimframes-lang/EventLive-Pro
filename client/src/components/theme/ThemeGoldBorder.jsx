/** Ornamental gold border frame for regional premium themes. */
export default function ThemeGoldBorder({ enabled = true, children, className = '' }) {
  if (!enabled) return children;
  return (
    <div className={`theme-gold-border-wrap ${className}`}>
      <span className="theme-gold-corner theme-gold-corner-tl" aria-hidden />
      <span className="theme-gold-corner theme-gold-corner-tr" aria-hidden />
      <span className="theme-gold-corner theme-gold-corner-bl" aria-hidden />
      <span className="theme-gold-corner theme-gold-corner-br" aria-hidden />
      <span className="theme-gold-edge theme-gold-edge-top" aria-hidden />
      <span className="theme-gold-edge theme-gold-edge-bottom" aria-hidden />
      {children}
    </div>
  );
}
