import FloralBackdrop from './FloralBackdrop.jsx';
import {
  eventTypeCopy,
  formatWeddingDate,
  formatWeddingTime,
  isCoupleEventType,
  isManualWeddingEntry,
  normalizeEventCategory,
} from '../../utils/weddingTemplates.js';

export default function CeremonyHero({ event }) {
  const type = normalizeEventCategory(event?.category) || 'other';
  const copy = eventTypeCopy(type);
  const groom = String(event?.groomName || '').trim();
  const bride = String(event?.brideName || '').trim();
  const venue = String(event?.venue || '').trim();
  const dateLabel = formatWeddingDate(event?.startTime);
  const timeLabel = formatWeddingTime(event?.startTime);
  const title = String(event?.title || '').trim();
  const brideFirst = isManualWeddingEntry(event);
  const topName = brideFirst ? bride : groom;
  const bottomName = brideFirst ? groom : bride;
  const hasCouple = Boolean(groom && bride) && isCoupleEventType(type);

  return (
    <header className="wt-hero">
      <FloralBackdrop />
      <div className="wt-hero-inner">
        <div className="wt-hero-card">
          <p className="wt-kicker">{copy.kicker}</p>
          <div className="wt-ornament" aria-hidden>
            ❦
          </div>
          {hasCouple ? (
            <>
              <h1 className="wt-name">{topName}</h1>
              {copy.conjunction ? <p className="wt-weds">{copy.conjunction}</p> : null}
              <p className="wt-name">{bottomName}</p>
            </>
          ) : (
            <h1 className="wt-name">{title || groom || bride}</h1>
          )}
          {copy.eventTitle ? <p className="wt-event-type">{copy.eventTitle}</p> : null}
          <div className="wt-meta">
            {dateLabel ? <div>{dateLabel}</div> : null}
            {timeLabel ? <div>{timeLabel}</div> : null}
            {venue ? <div className="wt-meta-muted">📍 {venue}</div> : null}
          </div>
          <a href="#watch-player" className="wt-watch-btn">
            <span className="wt-watch-dot" aria-hidden />
            Watch Live
          </a>
        </div>
      </div>
    </header>
  );
}
