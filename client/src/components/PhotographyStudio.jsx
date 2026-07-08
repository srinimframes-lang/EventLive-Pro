import { getStudioInfo } from '../utils/studio.js';
import GlassCard from './theme/GlassCard.jsx';

function IconInstagram({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function IconFacebook({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function IconYoutube({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function IconWebsite({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function SocialIconLink({ href, label, children }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="studio-social-icon"
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
}

function ActionButton({ href, label, emoji }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target={href.startsWith('tel:') || href.startsWith('mailto:') ? undefined : '_blank'}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="studio-action-btn"
    >
      <span aria-hidden>{emoji}</span>
      {label}
    </a>
  );
}

/**
 * Photography studio branding — shown on public event/watch pages.
 */
export default function PhotographyStudio({ event, themed = false, surfaceDark = false }) {
  const studio = getStudioInfo(event);
  if (!studio.hasContent) return null;

  const socials = [
    { href: studio.instagram, label: 'Instagram', Icon: IconInstagram },
    { href: studio.facebook, label: 'Facebook', Icon: IconFacebook },
    { href: studio.youtube, label: 'YouTube', Icon: IconYoutube },
    { href: studio.website, label: 'Website', Icon: IconWebsite },
  ].filter((s) => s.href);

  const actions = [
    { href: studio.phoneHref, label: 'Call', emoji: '📞' },
    { href: studio.whatsappHref, label: 'WhatsApp', emoji: '💬' },
    { href: studio.instagram, label: 'Instagram', emoji: '📸' },
    { href: studio.facebook, label: 'Facebook', emoji: '👍' },
    { href: studio.youtube, label: 'YouTube', emoji: '▶️' },
    { href: studio.website, label: 'Website', emoji: '🌐' },
  ].filter((a) => a.href);

  const body = (
    <div className="studio-card-inner">
      <div className="studio-card-header">
        {studio.logoUrl && (
          <img src={studio.logoUrl} alt="" className="studio-logo" loading="lazy" decoding="async" />
        )}
        <div className="min-w-0 flex-1 text-left">
          {studio.studioName && <p className="studio-name">{studio.studioName}</p>}
          {studio.photographerName && (
            <p className="studio-photographer">{studio.photographerName}</p>
          )}
        </div>
      </div>

      <div className="studio-details">
        {studio.phone && (
          <p>
            <span className="studio-detail-label">Phone</span>
            <a href={studio.phoneHref} className="studio-detail-link">
              {studio.phone}
            </a>
          </p>
        )}
        {studio.whatsapp && (
          <p>
            <span className="studio-detail-label">WhatsApp</span>
            <a href={studio.whatsappHref} target="_blank" rel="noopener noreferrer" className="studio-detail-link">
              {studio.whatsapp}
            </a>
          </p>
        )}
        {studio.email && (
          <p>
            <span className="studio-detail-label">Email</span>
            <a href={studio.emailHref} className="studio-detail-link">
              {studio.email}
            </a>
          </p>
        )}
        {studio.maps && (
          <p>
            <span className="studio-detail-label">Location</span>
            <a href={studio.maps} target="_blank" rel="noopener noreferrer" className="studio-detail-link">
              View on Google Maps
            </a>
          </p>
        )}
      </div>

      {socials.length > 0 && (
        <div className="studio-social-row">
          {socials.map(({ href, label, Icon }) => (
            <SocialIconLink key={label} href={href} label={label}>
              <Icon />
            </SocialIconLink>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="studio-actions">
          {actions.map(({ href, label, emoji }) => (
            <ActionButton key={label} href={href} label={label} emoji={emoji} />
          ))}
        </div>
      )}
    </div>
  );

  if (themed) {
    return (
      <section className="theme-animate-fade-up mt-12">
        <h2
          className="mb-4 text-center text-sm font-bold uppercase tracking-[0.35em]"
          style={{ color: 'var(--theme-surface-readable-muted)' }}
        >
          Captured by
        </h2>
        <GlassCard className="studio-card-themed p-0" dark={surfaceDark} solid>
          {body}
        </GlassCard>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-center text-sm font-bold uppercase tracking-[0.35em] text-slate-500">
        Captured by
      </h2>
      <div className="studio-card">{body}</div>
    </section>
  );
}
