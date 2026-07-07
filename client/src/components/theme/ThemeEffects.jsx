import { useMemo } from 'react';

const PARTICLE_COUNTS = { petals: 18, 'gold-dust': 24, neon: 16, bubbles: 14, stars: 20, confetti: 22, bokeh: 12, leaves: 16, dust: 10, none: 0 };

/** Floating particles + animated gradient orbs for premium themed pages. */
export default function ThemeEffects({ particleStyle = 'bokeh', gradientFrom, gradientTo }) {
  const count = PARTICLE_COUNTS[particleStyle] ?? 12;
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${(i * 37 + 11) % 100}%`,
        delay: `${(i * 0.7) % 8}s`,
        duration: `${6 + (i % 5) * 1.4}s`,
        size: `${4 + (i % 6) * 2}px`,
        opacity: 0.25 + (i % 4) * 0.12,
      })),
    [count]
  );

  if (particleStyle === 'none' && !gradientFrom) return null;

  const from = gradientFrom || 'var(--theme-primary)';
  const to = gradientTo || 'var(--theme-accent)';

  return (
    <div className="theme-effects pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="theme-gradient-orb theme-gradient-orb-a"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${from} 45%, transparent) 0%, transparent 70%)` }}
      />
      <div
        className="theme-gradient-orb theme-gradient-orb-b"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${to} 40%, transparent) 0%, transparent 70%)` }}
      />
      {particleStyle !== 'none' &&
        particles.map((p) => (
          <span
            key={p.id}
            className={`theme-particle theme-particle-${particleStyle}`}
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
            }}
          />
        ))}
    </div>
  );
}
