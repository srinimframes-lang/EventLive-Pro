const ICONS = {
  crown: '👑',
  flower: '✿',
  diamond: '◆',
  lotus: 'ॐ',
  temple: '🛕',
  om: '🕉',
  crescent: '☪',
  cross: '✝',
  champagne: '🥂',
  music: '♫',
  sun: '☀',
  leaf: '🍃',
  balloon: '🎈',
  bolt: '⚡',
  baby: '👶',
  star: '★',
  rings: '💍',
  heart: '♥',
  briefcase: '💼',
  mic: '🎤',
  home: '🏠',
  cap: '🎓',
  feather: '✦',
  wave: '🌊',
  film: '🎬',
};

/** Decorative corner ornaments based on theme icon set. */
export default function ThemeDecor({ iconSet = 'rings', decoration = 'elegant' }) {
  const icon = ICONS[iconSet] || '✦';
  const isNeon = decoration === 'neon';
  const isMinimal = decoration === 'minimal';

  if (isMinimal) {
    return (
      <div className="theme-decor-minimal pointer-events-none absolute inset-0" aria-hidden>
        <span className="absolute left-4 top-4 h-8 w-8 border-l-2 border-t-2 border-white/30" />
        <span className="absolute right-4 top-4 h-8 w-8 border-r-2 border-t-2 border-white/30" />
        <span className="absolute bottom-4 left-4 h-8 w-8 border-b-2 border-l-2 border-white/30" />
        <span className="absolute bottom-4 right-4 h-8 w-8 border-b-2 border-r-2 border-white/30" />
      </div>
    );
  }

  return (
    <div className="theme-decor pointer-events-none absolute inset-0" aria-hidden>
      <span
        className={`theme-decor-icon absolute left-3 top-3 text-2xl sm:left-6 sm:top-6 sm:text-3xl ${isNeon ? 'theme-decor-neon' : 'opacity-60'}`}
      >
        {icon}
      </span>
      <span
        className={`theme-decor-icon absolute right-3 top-3 text-2xl sm:right-6 sm:top-6 sm:text-3xl ${isNeon ? 'theme-decor-neon' : 'opacity-60'}`}
        style={{ transform: 'scaleX(-1)' }}
      >
        {icon}
      </span>
      <span
        className={`theme-decor-icon absolute bottom-3 left-3 text-xl sm:bottom-6 sm:left-6 sm:text-2xl ${isNeon ? 'theme-decor-neon' : 'opacity-40'}`}
      >
        {icon}
      </span>
      <span
        className={`theme-decor-icon absolute bottom-3 right-3 text-xl sm:bottom-6 sm:right-6 sm:text-2xl ${isNeon ? 'theme-decor-neon' : 'opacity-40'}`}
        style={{ transform: 'scaleX(-1)' }}
      >
        {icon}
      </span>
    </div>
  );
}
