import PhotographyStudio from '../../PhotographyStudio.jsx';
import ThemeGoldBorder from '../ThemeGoldBorder.jsx';
import GlassCard from '../GlassCard.jsx';
import {
  CouplePhoto,
  HeroEffects,
  PhotographerBadge,
  WatchChatBlock,
  WatchDescription,
  WatchFooter,
  WatchGallerySection,
  WatchLiveButton,
  WatchMeta,
  WatchPlayerBlock,
  WatchPlayerHeader,
} from '../layoutShared.jsx';

/** 1 — Royal Palace: split hero, golden frame, masonry gallery */
export function RoyalPalaceLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, goldBorder, ...rest } = ctx;
  return (
    <>
      <header className="layout-royal-hero relative isolate overflow-hidden">
        <HeroEffects style={style} />
        <ThemeGoldBorder enabled={goldBorder} className="relative z-10">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-2 md:items-center md:py-16">
            <div className="layout-royal-frame mx-auto w-full max-w-sm">
              <CouplePhoto src={couplePhoto} title={title} className="layout-royal-photo aspect-[4/5] w-full" />
            </div>
            <div className="text-center md:text-left" style={{ color: 'var(--theme-hero-readable)' }}>
              <p className="layout-royal-crown text-2xl" aria-hidden>👑</p>
              <p className="text-xs font-bold uppercase tracking-[0.4em]">{eventTypeLabel}</p>
              <h1 className="mt-3 font-extrabold leading-tight" style={{ fontFamily: 'var(--theme-font-heading)', fontSize: 'clamp(1.75rem, 5vw, 3.25rem)' }}>
                {title}
              </h1>
              <WatchMeta event={event} className="mt-4 justify-center md:justify-start" />
              <div className="mt-4 flex justify-center md:justify-start">
                <PhotographerBadge event={event} />
              </div>
              <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
            </div>
          </div>
        </ThemeGoldBorder>
      </header>
      <main className="layout-royal-main relative z-10 mx-auto max-w-6xl px-4 py-8">
        <div id="watch-player">
          <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} />
          <WatchPlayerHeader {...ctx} />
          <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3" />
          <WatchChatBlock {...rest} surfaceDark={surfaceRead.isDark} className="h-[55vh] lg:col-span-2 lg:h-[60vh]" />
        </div>
        <WatchGallerySection event={event} surfaceDark={surfaceRead.isDark} galleryVariant="masonry-gold" />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-royal-footer" />
    </>
  );
}

/** 2 — Luxury Gold: edge-to-edge player, horizontal gallery */
export function LuxuryGoldLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-luxury-hero relative px-4 py-10 text-center">
        <HeroEffects style={style} />
        <div className="relative z-10" style={{ color: 'var(--theme-hero-readable)' }}>
          <p className="text-xs font-bold uppercase tracking-[0.45em] text-amber-200/90">{eventTypeLabel}</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
        </div>
      </header>
      <section id="watch-player" className="layout-luxury-player relative z-10 w-full px-0">
        <WatchPlayerBlock {...rest} surfaceDark bare className="rounded-none" />
      </section>
      <main className="layout-luxury-main relative z-10 mx-auto max-w-6xl px-4 py-8">
        <WatchPlayerHeader {...ctx} />
        <WatchDescription event={event} surfaceDark />
        <WatchChatBlock {...rest} surfaceDark className="mt-6 h-[50vh] sm:h-[55vh]" />
        <WatchGallerySection event={event} surfaceDark galleryVariant="horizontal-scroll" />
        <PhotographyStudio event={event} themed surfaceDark />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-luxury-footer" />
    </>
  );
}

/** 3 — Floral Garden: soft card hero, stacked column, polaroid gallery */
export function FloralGardenLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-floral-hero px-4 py-10">
        <HeroEffects style={style} />
        <GlassCard className="relative z-10 mx-auto max-w-lg p-6 text-center" solid>
          {couplePhoto && (
            <CouplePhoto src={couplePhoto} title={title} className="layout-floral-photo mx-auto mb-4 h-36 w-36 rounded-full border-4 border-pink-200" />
          )}
          <p className="text-xs font-bold uppercase tracking-widest text-pink-600">{eventTypeLabel}</p>
          <h1 className="mt-2 text-3xl font-extrabold text-pink-900" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          <WatchMeta event={event} className="mt-3 text-pink-800" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-5" />
        </GlassCard>
      </header>
      <main className="layout-floral-main mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div id="watch-player">
          <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} />
          <WatchPlayerHeader {...ctx} />
        </div>
        <WatchChatBlock {...rest} surfaceDark={surfaceRead.isDark} className="h-[50vh]" />
        <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
        <WatchGallerySection event={event} surfaceDark={surfaceRead.isDark} galleryVariant="polaroid" />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-floral-footer rounded-t-3xl" />
    </>
  );
}

/** 4 — South Indian Traditional: temple arch hero, equal split player/chat */
export function SouthIndianTraditionalLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, goldBorder, ...rest } = ctx;
  return (
    <>
      <header className="layout-temple-hero relative overflow-hidden px-4 py-12 text-center">
        <HeroEffects style={style} />
        <div className="layout-temple-arch relative z-10 mx-auto max-w-3xl py-8" style={{ color: 'var(--theme-hero-readable)' }}>
          <p className="layout-temple-lamps text-lg" aria-hidden>🪔 🌿 🪔</p>
          {couplePhoto && <CouplePhoto src={couplePhoto} title={title} className="mx-auto mb-4 h-24 w-24 rounded-full border-4 border-amber-400" />}
          <p className="text-xs font-bold uppercase tracking-[0.35em]">{eventTypeLabel}</p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          <WatchMeta event={event} className="mt-4" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
        </div>
        {goldBorder && <ThemeGoldBorder enabled className="pointer-events-none absolute inset-4 z-20" />}
      </header>
      <main className="layout-temple-main mx-auto max-w-6xl px-4 py-8">
        <div id="watch-player" className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <div>
            <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} />
            <WatchPlayerHeader {...ctx} />
            <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
          </div>
          <WatchChatBlock {...rest} surfaceDark={surfaceRead.isDark} className="h-[50vh] lg:h-auto lg:min-h-[420px]" />
        </div>
        <WatchGallerySection event={event} surfaceDark={surfaceRead.isDark} galleryVariant="temple-tiles" />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-temple-footer border-t-4 border-amber-500" />
    </>
  );
}

/** 5 — Modern Minimal: left-aligned type, asymmetric grid */
export function ModernMinimalLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-minimal-hero border-b border-neutral-200 bg-white px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{eventTypeLabel}</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-6xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>
            {title}
          </h1>
          <WatchMeta event={event} className="mt-4 justify-start text-neutral-600" />
          {couplePhoto && <CouplePhoto src={couplePhoto} title={title} className="mt-8 aspect-[21/9] w-full max-w-4xl rounded-sm object-cover" />}
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-8" />
        </div>
      </header>
      <main className="layout-minimal-main mx-auto max-w-6xl px-4 py-10">
        <div id="watch-player" className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <WatchPlayerBlock {...rest} surfaceDark={false} bare className="rounded-sm border border-neutral-200" />
            <WatchDescription event={event} surfaceDark={false} className="border border-neutral-100 bg-neutral-50" />
          </div>
          <WatchChatBlock {...rest} surfaceDark={false} className="h-[55vh] border border-neutral-200" />
        </div>
        <WatchPlayerHeader {...ctx} />
        <WatchGallerySection event={event} surfaceDark={false} galleryVariant="minimal" />
        <PhotographyStudio event={event} themed surfaceDark={false} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-minimal-footer border-t py-6" />
    </>
  );
}

/** 6 — Sunset Romance: wave hero, tabs below player */
export function SunsetRomanceLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-sunset-hero relative px-4 py-14 text-center">
        <HeroEffects style={style} />
        <div className="relative z-10" style={{ color: 'var(--theme-hero-readable)' }}>
          {couplePhoto && <CouplePhoto src={couplePhoto} title={title} className="mx-auto mb-5 h-28 w-28 rounded-full border-4 border-orange-200 shadow-lg" />}
          <p className="text-xs font-bold uppercase tracking-widest">{eventTypeLabel}</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          <WatchMeta event={event} className="mt-4" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
        </div>
        <div className="layout-sunset-wave" aria-hidden />
      </header>
      <main className="layout-sunset-main mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div id="watch-player">
          <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} />
          <WatchPlayerHeader {...ctx} />
        </div>
        <WatchChatBlock {...rest} surfaceDark={surfaceRead.isDark} className="h-[48vh]" />
        <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
        <WatchGallerySection event={event} surfaceDark={surfaceRead.isDark} galleryVariant="circles" />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-sunset-footer" />
    </>
  );
}

/** 7 — Emerald Wedding: invitation card hero */
export function EmeraldWeddingLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-emerald-hero px-4 py-12">
        <div className="layout-emerald-invite relative z-10 mx-auto max-w-xl border-4 border-emerald-700 bg-white/95 p-8 text-center shadow-xl">
          <p className="text-emerald-800 text-xs font-bold uppercase tracking-[0.35em]">{eventTypeLabel}</p>
          <h1 className="mt-3 text-3xl font-extrabold text-emerald-900" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          {couplePhoto && <CouplePhoto src={couplePhoto} title={title} className="mx-auto mt-5 h-32 w-full max-w-xs rounded border-2 border-amber-400 object-cover" />}
          <WatchMeta event={event} className="mt-4 text-emerald-800" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
        </div>
      </header>
      <main className="layout-emerald-main mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div id="watch-player" className="grid gap-6 md:grid-cols-2">
          <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} />
          <WatchChatBlock {...rest} surfaceDark={surfaceRead.isDark} className="h-[45vh] md:h-auto md:min-h-[320px]" />
        </div>
        <WatchPlayerHeader {...ctx} />
        <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
        <WatchGallerySection event={event} surfaceDark={surfaceRead.isDark} galleryVariant="invitation" />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-emerald-footer" />
    </>
  );
}

/** 8 — Vintage Classic: paper frame, album gallery */
export function VintageClassicLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-vintage-hero px-4 py-10">
        <div className="layout-vintage-paper mx-auto max-w-2xl p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-900/70">{eventTypeLabel}</p>
          <h1 className="mt-3 text-3xl font-extrabold text-stone-800 sm:text-4xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          {couplePhoto && <CouplePhoto src={couplePhoto} title={title} className="layout-vintage-photo mx-auto mt-6 aspect-video w-full border-8 border-amber-100 object-cover sepia" />}
          <WatchMeta event={event} className="mt-4 text-stone-600" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
        </div>
      </header>
      <main className="layout-vintage-main mx-auto max-w-4xl px-4 py-8">
        <div id="watch-player" className="layout-vintage-letter space-y-6 p-6">
          <WatchPlayerBlock {...rest} surfaceDark={false} />
          <WatchChatBlock {...rest} surfaceDark={false} className="h-[50vh]" />
          <WatchPlayerHeader {...ctx} />
          <WatchDescription event={event} surfaceDark={false} />
        </div>
        <WatchGallerySection event={event} surfaceDark={false} galleryVariant="vintage" />
        <PhotographyStudio event={event} themed surfaceDark={false} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-vintage-footer font-serif" />
    </>
  );
}

/** 9 — Crystal Wedding: bento grid, glassmorphism */
export function CrystalWeddingLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-crystal-hero px-4 py-12 text-center">
        <div className="layout-crystal-glass relative z-10 mx-auto max-w-lg rounded-2xl p-8 backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-[0.4em] text-slate-500">{eventTypeLabel}</p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-800 sm:text-4xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          <WatchMeta event={event} className="mt-4 text-slate-600" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-6" />
        </div>
      </header>
      <main className="layout-crystal-main mx-auto max-w-6xl px-4 py-8">
        <div id="watch-player" className="layout-crystal-bento grid gap-4 md:grid-cols-3 md:grid-rows-2">
          <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} className="md:col-span-2 md:row-span-2" />
          <WatchChatBlock {...rest} surfaceDark={surfaceRead.isDark} className="h-[40vh] md:col-span-1 md:h-full md:min-h-[280px]" />
        </div>
        <WatchPlayerHeader {...ctx} />
        <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
        <WatchGallerySection event={event} surfaceDark={surfaceRead.isDark} galleryVariant="bento" />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-crystal-footer backdrop-blur-md" />
    </>
  );
}

/** 10 — Night Sky: stars hero, centered glowing player */
export function NightSkyWeddingLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-night-hero relative min-h-[42vh] px-4 py-16 text-center">
        <HeroEffects style={style} />
        <div className="layout-night-stars pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative z-10" style={{ color: 'var(--theme-hero-readable)' }}>
          <p className="text-3xl" aria-hidden>🌙</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.45em] text-amber-200/90">{eventTypeLabel}</p>
          <h1 className="mt-3 text-3xl font-extrabold text-amber-100 sm:text-5xl" style={{ fontFamily: 'var(--theme-font-heading)' }}>{title}</h1>
          {couplePhoto && <CouplePhoto src={couplePhoto} title={title} className="mx-auto mt-6 h-24 w-24 rounded-full border-2 border-amber-300/50 object-cover shadow-[0_0_30px_rgba(251,191,36,0.4)]" />}
          <WatchMeta event={event} className="mt-4 text-amber-100/90" />
          <WatchLiveButton style={style} heroRead={heroRead} className="mt-8" />
        </div>
      </header>
      <main className="layout-night-main mx-auto max-w-4xl px-4 py-8">
        <div id="watch-player" className="layout-night-glow rounded-2xl p-1">
          <WatchPlayerBlock {...rest} surfaceDark className="rounded-xl" />
        </div>
        <WatchPlayerHeader {...ctx} />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <WatchDescription event={event} surfaceDark className="lg:col-span-2" />
          <WatchChatBlock {...rest} surfaceDark className="h-[50vh] lg:col-span-1" />
        </div>
        <WatchGallerySection event={event} surfaceDark galleryVariant="constellation" />
        <PhotographyStudio event={event} themed surfaceDark />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-night-footer" />
    </>
  );
}
