/** Themed loading screen with per-theme animation variant. */
export default function ThemeLoadingScreen({ snapshot, label = 'Loading…' }) {
  const anim = snapshot?.style?.loadingAnimation || 'gold-shimmer';
  const region = snapshot?.region;

  return (
    <div className="theme-loading-screen" style={snapshot ? undefined : {}}>
      <div className={`theme-loading-inner theme-loading-${anim}`}>
        <div className="theme-loading-ornament" aria-hidden>
          {region ? 'ॐ' : '✦'}
        </div>
        <p className="theme-loading-label">{label}</p>
        <div className="theme-loading-bar">
          <span className="theme-loading-bar-fill" />
        </div>
      </div>
    </div>
  );
}
