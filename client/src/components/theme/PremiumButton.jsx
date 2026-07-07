const STYLES = {
  'pill-glow': 'theme-btn-pill-glow',
  glass: 'theme-btn-glass',
  'rounded-gold': 'theme-btn-rounded-gold',
  neon: 'theme-btn-neon',
  'outline-glass': 'theme-btn-outline-glass',
  sharp: 'theme-btn-sharp',
};

/** Premium CTA button with per-theme style variant. */
export default function PremiumButton({ buttonStyle = 'pill-glow', children, className = '', as: Tag = 'button', ...props }) {
  const variant = STYLES[buttonStyle] || STYLES['pill-glow'];
  return (
    <Tag className={`theme-premium-btn ${variant} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
