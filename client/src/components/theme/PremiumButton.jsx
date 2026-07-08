const STYLES = {
  'pill-glow': 'theme-btn-pill-glow',
  glass: 'theme-btn-glass',
  'rounded-gold': 'theme-btn-rounded-gold',
  neon: 'theme-btn-neon',
  'outline-glass': 'theme-btn-outline-glass',
  sharp: 'theme-btn-sharp',
};

/** Premium CTA button with per-theme style variant and readable contrast. */
export default function PremiumButton({
  buttonStyle = 'pill-glow',
  children,
  className = '',
  heroIsDark = true,
  as: Tag = 'button',
  ...props
}) {
  const variant = heroIsDark
    ? (STYLES[buttonStyle] || STYLES['pill-glow'])
    : 'theme-btn-readable-light-hero';
  return (
    <Tag className={`theme-premium-btn ${variant} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
