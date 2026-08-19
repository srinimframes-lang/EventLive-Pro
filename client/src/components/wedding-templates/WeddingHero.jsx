import FloralBackdrop from './FloralBackdrop.jsx';
import { formatWeddingDate, formatWeddingTime, isManualWeddingEntry } from '../../utils/weddingTemplates.js';

export default function WeddingHero({ event }) {
  const groom = String(event?.groomName || '').trim();
  const bride = String(event?.brideName || '').trim();
  const venue = String(event?.venue || '').trim();
  const dateLabel = formatWeddingDate(event?.startTime);
  const timeLabel = formatWeddingTime(event?.startTime);
  const title = String(event?.title || '').trim();
  const brideFirst = isManualWeddingEntry(event);
  const topName = brideFirst ? bride : groom;
  const bottomName = brideFirst ? groom : bride;

  return (
    <header className="wt-hero">
      <FloralBackdrop />
      <div className="wt-hero-inner">
        <div className="wt-hero-card">
          <p className="wt-kicker">Wedding Live</p>
          <div className="wt-ornament" aria-hidden>
            ❦
          </div>
          {groom && bride ? (
            <>
              <h1 className="wt-name">{topName}</h1>
              <p className="wt-weds">Weds</p>
              <p className="wt-name">{bottomName}</p>
            </>
          ) : (
            <h1 className="wt-name">{groom || bride || title}</h1>
          )}
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
