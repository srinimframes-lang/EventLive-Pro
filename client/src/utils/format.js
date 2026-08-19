import { MEDIA_ORIGIN } from '../config.js';

/**
 * Formats a number as currency (INR by default).
 */
export function formatCurrency(amount, currency = 'INR') {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹${value.toLocaleString('en-IN')}`;
  }
}

/**
 * Builds a wa.me deep link for a phone number. Returns '' if no number.
 */
export function whatsappLink(number, text = '') {
  if (!number) return '';
  const digits = String(number).replace(/[^\d]/g, '');
  if (!digits) return '';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Converts an ISO date string into the value format expected by
 * <input type="datetime-local"> (YYYY-MM-DDTHH:mm) in local time.
 */
export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Extracts a YouTube video ID from a full URL or returns the input if it
 * already looks like a bare ID. Supports watch?v=, youtu.be/, /live/,
 * /embed/ and /shorts/ formats. Returns '' when nothing usable is found.
 * Keep in sync with server/src/utils/youtube.js.
 */
const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YT_ID_TOKEN = '[a-zA-Z0-9_-]{11}';

function cleanYoutubeInput(input) {
  return String(input || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

function validYoutubeId(value) {
  const id = String(value || '').trim();
  return YT_ID_RE.test(id) ? id : '';
}

function hostOf(hostname) {
  return String(hostname || '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

function isYoutubeHost(host) {
  return (
    host === 'youtu.be' ||
    host.endsWith('youtube.com') ||
    host.endsWith('youtube-nocookie.com')
  );
}

function coerceYoutubeUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?(m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(value)) {
    return `https://${value}`;
  }
  return '';
}

function idFromYoutubeUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  const host = hostOf(parsed.hostname);
  if (!isYoutubeHost(host)) return '';

  if (host === 'youtu.be') {
    const id = (parsed.pathname.split('/').filter(Boolean)[0] || '').slice(0, 11);
    return validYoutubeId(id);
  }

  const pathMatch = parsed.pathname.match(
    new RegExp(`\\/(?:live|embed|shorts|v)\\/(${YT_ID_TOKEN})`, 'i')
  );
  if (pathMatch) return validYoutubeId(pathMatch[1]);

  const v = parsed.searchParams.get('v');
  if (v) return validYoutubeId(v.slice(0, 11));

  return '';
}

function idFromYoutubeText(value) {
  const live = value.match(
    new RegExp(`(?:youtube\\.com|youtube-nocookie\\.com)\\/(?:live|embed|shorts|v)\\/(${YT_ID_TOKEN})`, 'i')
  );
  if (live) return live[1];
  const watch = value.match(new RegExp(`[?&]v=(${YT_ID_TOKEN})`));
  if (watch) return watch[1];
  const short = value.match(new RegExp(`youtu\\.be\\/(${YT_ID_TOKEN})`, 'i'));
  if (short) return short[1];
  return '';
}

export function extractYouTubeId(input) {
  if (!input) return '';
  const value = cleanYoutubeInput(input);
  if (!value) return '';
  if (YT_ID_RE.test(value)) return value;

  const fromParsed = idFromYoutubeUrl(value) || idFromYoutubeUrl(coerceYoutubeUrl(value));
  if (fromParsed) return fromParsed;

  const fromText = idFromYoutubeText(value);
  if (fromText) return fromText;

  const loose = value.match(new RegExp(YT_ID_TOKEN));
  return loose ? loose[0] : '';
}

/**
 * Slugifies free text for use in a URL (lowercase, hyphenated, ascii-only).
 * Telugu / other scripts without latin letters become ''.
 */
export function slugifyText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const WEDDING_NOISE_TOKEN = /(?:^|-)(wedding|weddings|live|stream|streaming|ceremony)(?=-|$)/g;

export const LIVE_LINK_TYPE_SLUG = {
  wedding: 'wedding',
  engagement: 'engagement',
  reception: 'reception',
  sangeet: 'sangeet',
  haldi: 'haldi',
  mehendi: 'mehendi',
  birthday: 'birthday',
  house_warming: 'housewarming',
  housewarming: 'housewarming',
  upanayanam: 'upanayanam',
  half_saree: 'half-saree',
  baby_shower: 'baby-shower',
  corporate: 'live',
  temple: 'live',
  memorial: 'live',
  conference: 'live',
  workshop: 'live',
  webinar: 'live',
  concert: 'live',
  meetup: 'live',
  sports: 'live',
  other: 'live',
};

export function liveLinkTypeSlug(category) {
  const key = String(category || 'wedding').toLowerCase().trim();
  return LIVE_LINK_TYPE_SLUG[key] || 'live';
}

export function isCoupleWatchSlug(slug) {
  return /(?:^|-)weds(?:-|$)/.test(String(slug || '').toLowerCase());
}

/**
 * Public path slug: bride-weds-groom.
 * If the event title already names the couple and includes "weds", reuse it
 * without stacking extra wedding/live words.
 */
export function coupleSlug(event) {
  if (!event) return '';
  const bride = slugifyText(event.brideName);
  const groom = slugifyText(event.groomName);
  let title = slugifyText(event.title).replace(WEDDING_NOISE_TOKEN, '');
  title = title.replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (bride && groom) {
    if (title.includes(bride) && title.includes(groom) && isCoupleWatchSlug(title)) {
      return title;
    }
    return `${bride}-weds-${groom}`;
  }
  return bride || groom || '';
}

/** New live-link slug: ravi-priya-wedding. Existing stored slugs are never rewritten. */
export function buildLivePageSlug(event) {
  if (!event) return '';
  const typeToken = liveLinkTypeSlug(event.category);
  const groom = slugifyText(event.groomName);
  const bride = slugifyText(event.brideName);
  if (groom && bride) return `${groom}-${bride}-${typeToken}`;
  if (groom || bride) return `${groom || bride}-${typeToken}`;
  const title = slugifyText(event.title);
  if (!title) return '';
  if (title === typeToken || title.endsWith(`-${typeToken}`)) return title;
  return `${title}-${typeToken}`;
}

/**
 * Canonical public watch path.
 * New live-link events → /live/ravi-priya-wedding
 * Couple-slug events → /deekha-reddy-weds-tarun-reddy
 * Legacy shortCode events → /AM5DJS
 */
export function watchPath(event) {
  if (!event) return '';
  const slug = event.slug || '';
  if (event.publicUrlStyle === 'live' && slug) return `/live/${slug}`;
  if (isCoupleWatchSlug(slug)) return `/${slug}`;
  const code = event.shortCode || slug || event.id;
  return code ? `/${code}` : '';
}

/**
 * Builds a shareable absolute (short) URL for the in-app watch page.
 * White-label aware: uses `originOverride` if given, else the event's
 * `brandDomain` (the organizer's active custom domain), else the current origin.
 */
export function buildWatchUrl(event, originOverride) {
  if (!event) return '';
  let origin = originOverride;
  if (!origin && event.brandDomain) origin = `https://${event.brandDomain}`;
  if (!origin && typeof window !== 'undefined') origin = window.location.origin;
  if (!origin) return '';
  return `${origin}${watchPath(event)}`;
}

/** Resolve share origin (brand domain → override → window). Does not change watchPath. */
function resolveShareOrigin(event, originOverride) {
  let origin = originOverride;
  if (!origin && event?.brandDomain) origin = `https://${event.brandDomain}`;
  if (!origin && typeof window !== 'undefined') origin = window.location.origin;
  return origin ? String(origin).replace(/\/+$/, '') : '';
}

/**
 * Marketing / share live path: /live/{shortCode}/{slug}
 * Additive — does not replace the canonical short watchPath.
 */
export function liveSharePath(event) {
  if (!event) return '';
  const code = event.shortCode || event.slug || event.id;
  if (!code) return '';
  const slug = coupleSlug(event) || event.slug || '';
  return slug ? `/live/${code}/${slug}` : `/live/${code}`;
}

/** Absolute Live URL for Share & Embed (existing short URLs unchanged). */
export function buildLiveShareUrl(event, originOverride) {
  const origin = resolveShareOrigin(event, originOverride);
  const path = liveSharePath(event);
  return origin && path ? `${origin}${path}` : '';
}

/** Embed player path: /embed/{shortCode} */
export function embedPath(event) {
  if (!event) return '';
  const code = event.shortCode || event.slug || event.id;
  return code ? `/embed/${code}` : '';
}

/** Absolute embed URL for iframes. */
export function buildEmbedUrl(event, originOverride) {
  const origin = resolveShareOrigin(event, originOverride);
  const path = embedPath(event);
  return origin && path ? `${origin}${path}` : '';
}

/**
 * White-label embed origin when the event has an active custom domain.
 * Returns '' when no brand domain is configured.
 */
export function whiteLabelEmbedOrigin(event) {
  const host = String(event?.brandDomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  return host ? `https://${host}` : '';
}

/** White-label embed URL, or '' when no custom domain. */
export function buildWhiteLabelEmbedUrl(event) {
  const origin = whiteLabelEmbedOrigin(event);
  return origin ? buildEmbedUrl(event, origin) : '';
}

export const EMBED_SIZE_OPTIONS = [
  { id: 'responsive', label: 'Responsive (default)', width: null, height: null },
  { id: '1920x1080', label: '1920×1080', width: 1920, height: 1080 },
  { id: '1280x720', label: '1280×720', width: 1280, height: 720 },
  { id: '854x480', label: '854×480', width: 854, height: 480 },
];

function resolveEmbedSize(sizeId) {
  return EMBED_SIZE_OPTIONS.find((s) => s.id === sizeId) || EMBED_SIZE_OPTIONS[0];
}

/** Bare iframe tag (no wrapper). */
export function buildIframeCode(event, { originOverride, sizeId = 'responsive' } = {}) {
  const src = buildEmbedUrl(event, originOverride);
  if (!src) return '';
  const size = resolveEmbedSize(sizeId);
  if (size.width && size.height) {
    return `<iframe
  src="${src}"
  width="${size.width}"
  height="${size.height}"
  style="border:0;max-width:100%;"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen>
</iframe>`;
  }
  return `<iframe
  src="${src}"
  style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen>
</iframe>`;
}

/** Full embed snippet (responsive wrapper or fixed-size iframe). */
export function buildEmbedCode(event, originOrOpts, maybeSizeId) {
  // Backward compatible: buildEmbedCode(event, originOverride)
  let originOverride;
  let sizeId = 'responsive';
  if (originOrOpts && typeof originOrOpts === 'object' && !Array.isArray(originOrOpts)) {
    originOverride = originOrOpts.originOverride;
    sizeId = originOrOpts.sizeId || 'responsive';
  } else {
    originOverride = originOrOpts;
    if (maybeSizeId) sizeId = maybeSizeId;
  }

  const src = buildEmbedUrl(event, originOverride);
  if (!src) return '';
  const size = resolveEmbedSize(sizeId);
  if (size.width && size.height) {
    return buildIframeCode(event, { originOverride, sizeId });
  }
  return `<div style="position:relative;padding-top:56.25%;width:100%;">
  <iframe
    src="${src}"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>`;
}

/**
 * Resolves a media URL for display. Uploaded files are stored as relative
 * `/uploads/...` paths that live on the backend, not the frontend origin —
 * so we prefix the backend origin. Absolute URLs (Cloudinary, Unsplash, etc.)
 * and data/blob URLs are returned unchanged.
 */
export function resolveMediaUrl(url) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  // Backend-served assets (uploads + recording play/download APIs).
  if (path.startsWith('/uploads') || path.startsWith('/api/')) {
    return `${MEDIA_ORIGIN}${path}`;
  }
  return path;
}

/**
 * Prefer WebP/auto format when the host supports on-the-fly transforms.
 * Cloudinary: inject f_auto,q_auto. R2 / local uploads / signed URLs unchanged
 * (never mutate R2 keys or replay URLs).
 */
export function preferWebpUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://local');
    const host = u.hostname.toLowerCase();
    if (host.includes('cloudinary.com') && u.pathname.includes('/upload/')) {
      if (/\/upload\/(?:[^/]+,)*f_/.test(u.pathname)) return url;
      u.pathname = u.pathname.replace('/upload/', '/upload/f_auto,q_auto/');
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return url;
}
