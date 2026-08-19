/** Decorative floral art only — never an event/cover/invitation image. */
export default function FloralBackdrop() {
  return (
    <div className="wt-hero-art" aria-hidden>
      <div className="wt-hero-wash" />
      <svg className="wt-hero-svg" viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" color="var(--wt-gold)">
          <path d="M70 160c40-70 120-90 170-40 30 30 28 78-6 104-42 32-96 8-120-28-18-28-8-62 18-78 22-14 52-8 66 14" />
          <path d="M90 210c28-8 52 10 58 34 8 30-18 54-46 50-22-3-36-24-30-44 4-16 22-26 40-20" />
          <ellipse cx="128" cy="148" rx="18" ry="28" transform="rotate(-28 128 148)" />
          <ellipse cx="168" cy="132" rx="16" ry="26" transform="rotate(18 168 132)" />
          <ellipse cx="148" cy="176" rx="14" ry="22" />
          <circle cx="148" cy="156" r="8" fill="currentColor" opacity="0.35" />

          <path d="M730 180c-40-70-120-90-170-40-30 30-28 78 6 104 42 32 96 8 120-28 18-28 8-62-18-78-22-14-52-8-66 14" />
          <ellipse cx="672" cy="168" rx="18" ry="28" transform="rotate(28 672 168)" />
          <ellipse cx="632" cy="152" rx="16" ry="26" transform="rotate(-18 632 152)" />
          <circle cx="652" cy="176" r="8" fill="currentColor" opacity="0.35" />

          <path d="M80 980c50-40 130-20 150 40 12 36-10 74-48 86-48 16-92-18-96-58-3-28 18-52 44-56 22-4 42 10 48 30" />
          <ellipse cx="120" cy="1028" rx="20" ry="32" transform="rotate(-40 120 1028)" />
          <ellipse cx="158" cy="1050" rx="16" ry="28" transform="rotate(12 158 1050)" />
          <circle cx="138" cy="1040" r="8" fill="currentColor" opacity="0.35" />

          <path d="M720 1000c-50-40-130-20-150 40-12 36 10 74 48 86 48 16 92-18 96-58 3-28-18-52-44-56-22-4-42 10-48 30" />
          <ellipse cx="680" cy="1048" rx="20" ry="32" transform="rotate(40 680 1048)" />
          <ellipse cx="642" cy="1070" rx="16" ry="28" transform="rotate(-12 642 1070)" />
          <circle cx="662" cy="1060" r="8" fill="currentColor" opacity="0.35" />
        </g>
        <g fill="var(--wt-art-3)" opacity="0.22">
          <path d="M40 420c30-10 48 22 28 48-26 34-70 18-62-22 4-18 18-28 34-26z" />
          <path d="M760 520c-30-10-48 22-28 48 26 34 70 18 62-22-4-18-18-28-34-26z" />
          <path d="M60 700c24 18 8 52-18 48-28-4-34-42-8-52 10-4 18-2 26 4z" />
          <path d="M740 760c-24 18-8 52 18 48 28-4 34-42 8-52-10-4-18-2-26 4z" />
        </g>
        <g stroke="var(--wt-gold)" strokeWidth="1.1" fill="none" opacity="0.35">
          <rect x="28" y="28" width="744" height="1144" rx="18" />
          <rect x="40" y="40" width="720" height="1120" rx="14" />
        </g>
      </svg>
      <div className="wt-hero-veil" />
    </div>
  );
}
