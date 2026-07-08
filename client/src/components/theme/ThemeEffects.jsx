import { useMemo } from 'react';

const PARTICLE_COUNTS = { petals: 12, 'gold-dust': 14, neon: 10, bubbles: 10, stars: 12, confetti: 12, bokeh: 8, leaves: 10, dust: 6, none: 0 };

/**
 * Background-only effects — confined to the lower hero zone so particles
 * never overlap couple names or hero text (z-index below content).
 */
export default function ThemeEffects({ particleStyle = 'bokeh', gradientFrom, gradientTo }) {
  const count = PARTICLE_COUNTS[particleStyle] ?? 8;
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${(i * 37 + 11) % 100}%`,
        delay: `${(i * 0.7) % 8}s`,
        duration: `${6 + (i % 5) * 1.4}s`,
        size: `${4 + (i % 6) * 2}px`,
        opacity: 0.15 + (i % 4) * 0.06,
      })),
    [count]
  );

  if (particleStyle === 'none' && !gradientFrom) return null;

  const from = gradientFrom || 'var(--theme-primary)';
  const to = gradientTo || 'var(--theme-accent)';

  return (
    <div className="theme-effects pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[45%] overflow-hidden" aria-hidden>
      <div
        className="theme-gradient-orb theme-gradient-orb-a"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${from} 30%, transparent) 0%, transparent 70%)` }}
      />
      <div
        className="theme-gradient-orb theme-gradient-orb-b"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${to} 25%, transparent) 0%, transparent 70%)` }}
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
