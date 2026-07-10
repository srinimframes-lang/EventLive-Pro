import PhotographyStudio from '../../PhotographyStudio.jsx';
import ThemeGoldBorder from '../ThemeGoldBorder.jsx';
import GlassCard from '../GlassCard.jsx';
import ReceptionStageLights from '../ReceptionStageLights.jsx';
import CrystalSparkleOverlay from '../CrystalSparkleOverlay.jsx';
import ThemeDecor from '../ThemeDecor.jsx';
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

/** Royal Reception Night — black & gold stage luxury with spotlights. */
export function ReceptionRoyalNightLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, couplePhoto, heroRead, surfaceRead, ...rest } = ctx;
  return (
    <>
      <header className="layout-reception-royal-hero relative isolate overflow-hidden">
        <ReceptionStageLights />
        <HeroEffects style={style} />
        <ThemeDecor iconSet={style.iconSet || 'champagne'} decoration={style.decoration || 'luxury'} />
        <ThemeGoldBorder enabled className="relative z-10">
          <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:py-20">
            <p
              className="layout-reception-royal-label text-xs font-bold uppercase tracking-[0.45em] sm:text-sm"
              style={{ color: 'var(--theme-hero-readable-muted)' }}
            >
              {eventTypeLabel}
            </p>
            <h1
              className="layout-reception-royal-title theme-hero-title mt-4 font-extrabold leading-[1.08]"
              style={{
                fontFamily: 'var(--theme-font-heading)',
                color: 'var(--theme-hero-readable)',
                fontSize: 'clamp(2.25rem, 8vw, 4.75rem)',
              }}
            >
              {title}
            </h1>
            {couplePhoto && (
              <CouplePhoto
                src={couplePhoto}
                title={title}
                className="layout-reception-royal-photo mx-auto mt-8 aspect-[3/4] w-full max-w-[280px] object-cover sm:max-w-xs"
              />
            )}
            <WatchMeta event={event} className="mt-6 justify-center" />
            <div className="mt-4 flex justify-center">
              <PhotographerBadge event={event} />
            </div>
            <WatchLiveButton style={style} heroRead={heroRead} className="mt-8" />
          </div>
        </ThemeGoldBorder>
      </header>

      <main className="layout-reception-royal-main relative z-10 mx-auto max-w-6xl px-4 py-8">
        <section id="watch-player" className="layout-reception-royal-stage space-y-4">
          <ThemeGoldBorder enabled>
            <WatchPlayerBlock {...rest} surfaceDark className="rounded-xl" />
          </ThemeGoldBorder>
          <WatchPlayerHeader {...ctx} />
          <WatchDescription event={event} surfaceDark />
        </section>
        <WatchChatBlock {...rest} surfaceDark className="mt-6 h-[50vh] sm:h-[55vh]" />
        <WatchGallerySection event={event} surfaceDark galleryVariant="reception-golden-stage" />
        <PhotographyStudio event={event} themed surfaceDark />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-reception-royal-footer" />
    </>
  );
}

/** Crystal Reception — white, silver & royal blue glassmorphism with full-width hero. */
export function ReceptionCrystalLayout(ctx) {
  const { snap, style, event, title, eventTypeLabel, heroRead, surfaceRead, themeBg, couplePhoto, ...rest } = ctx;
  const bannerSrc = couplePhoto || themeBg;

  return (
    <>
      <header className="layout-reception-crystal-banner relative isolate min-h-[48vh] overflow-hidden sm:min-h-[56vh]">
        {bannerSrc && (
          <img
            src={bannerSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
        <div className="layout-reception-crystal-banner-overlay absolute inset-0" aria-hidden />
        <CrystalSparkleOverlay />
        <HeroEffects style={style} />
        <div className="relative z-10 flex min-h-[48vh] items-center justify-center px-4 py-10 sm:min-h-[56vh] sm:py-14">
          <div className="layout-reception-crystal-glass mx-auto w-full max-w-2xl rounded-2xl p-8 text-center backdrop-blur-xl sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.45em] text-blue-100/80">{eventTypeLabel}</p>
            <h1
              className="layout-reception-crystal-title theme-hero-title mt-3 font-extrabold text-white"
              style={{
                fontFamily: 'var(--theme-font-heading)',
                fontSize: 'clamp(2rem, 7vw, 4.25rem)',
              }}
            >
              {title}
            </h1>
            <WatchMeta event={event} className="mt-4 justify-center text-blue-50/90" />
            <div className="mt-4 flex justify-center">
              <PhotographerBadge event={event} />
            </div>
            <WatchLiveButton style={style} heroRead={heroRead} className="mt-8" />
          </div>
        </div>
      </header>

      <main className="layout-reception-crystal-main relative z-10 mx-auto max-w-6xl px-4 py-8">
        <section id="watch-player" className="layout-reception-crystal-player space-y-4">
          <GlassCard className="layout-reception-crystal-player-frame overflow-hidden p-0" dark={surfaceRead.isDark} solid>
            <WatchPlayerBlock {...rest} surfaceDark={surfaceRead.isDark} bare />
          </GlassCard>
          <WatchPlayerHeader {...ctx} />
          <WatchDescription event={event} surfaceDark={surfaceRead.isDark} />
        </section>
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <WatchChatBlock
            {...rest}
            surfaceDark={surfaceRead.isDark}
            className="h-[50vh] lg:col-span-2 lg:h-[55vh]"
          />
        </div>
        <WatchGallerySection
          event={event}
          surfaceDark={surfaceRead.isDark}
          galleryVariant="reception-crystal-prism"
        />
        <PhotographyStudio event={event} themed surfaceDark={surfaceRead.isDark} />
      </main>
      <WatchFooter snap={snap} title={title} event={event} className="layout-reception-crystal-footer" />
    </>
  );
}
