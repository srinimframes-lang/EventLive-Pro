import { useMemo } from 'react';

/** Crystal sparkle overlay for the Crystal Reception hero banner. */
export default function CrystalSparkleOverlay() {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: `${(i * 23 + 7) % 96}%`,
        top: `${(i * 31 + 11) % 88}%`,
        delay: `${(i * 0.45) % 4}s`,
        size: 3 + (i % 4),
      })),
    []
  );

  return (
    <div className="layout-reception-crystal-sparkles pointer-events-none absolute inset-0 z-[1]" aria-hidden>
      {sparkles.map((s) => (
        <span
          key={s.id}
          className="layout-reception-sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}
