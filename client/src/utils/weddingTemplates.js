export const WEDDING_PAGE_TEMPLATES = [
  'wedding-template-1',
  'wedding-template-2',
  'wedding-template-3',
];

export const DEFAULT_WEDDING_CARD_TEMPLATE = 'wedding-template-1';

export const MANUAL_WEDDING_CATEGORIES = [
  { id: 'wedding', label: 'Wedding' },
  { id: 'reception', label: 'Reception' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'sangeet', label: 'Sangeet' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'other', label: 'Other' },
];

export const EVENT_TYPE_TEMPLATES = {
  wedding: DEFAULT_WEDDING_CARD_TEMPLATE,
  reception: 'reception-template-1',
  engagement: 'engagement-template-1',
  sangeet: 'sangeet-template-1',
  birthday: 'birthday-template-1',
  other: 'other-template-1',
};

export const TYPE_PAGE_TEMPLATES = [
  EVENT_TYPE_TEMPLATES.reception,
  EVENT_TYPE_TEMPLATES.engagement,
  EVENT_TYPE_TEMPLATES.sangeet,
  EVENT_TYPE_TEMPLATES.birthday,
  EVENT_TYPE_TEMPLATES.other,
];

export const EVENT_TYPE_COPY = {
  wedding: { kicker: 'Wedding Live', conjunction: 'Weds', eventTitle: '', player: 'Live Ceremony' },
  reception: { kicker: 'Reception Live', conjunction: '&', eventTitle: 'Reception', player: 'Live Reception' },
  engagement: { kicker: 'Engagement Live', conjunction: '&', eventTitle: 'Engagement', player: 'Live Engagement' },
  sangeet: { kicker: 'Sangeet Live', conjunction: '&', eventTitle: 'Sangeet', player: 'Live Sangeet' },
  birthday: { kicker: 'Birthday Live', conjunction: '', eventTitle: 'Birthday', player: 'Live Birthday' },
  other: { kicker: 'Live Event', conjunction: '', eventTitle: '', player: 'Watch Live' },
};

export function normalizeEventCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  return MANUAL_WEDDING_CATEGORIES.some((item) => item.id === raw) ? raw : '';
}

export function isManualWeddingEntry(event) {
  return (
    String(event?.source || '') === 'wedding-card' &&
    String(event?.weddingEntryMode || '') === 'manual'
  );
}

export function isCoupleEventType(category) {
  const type = normalizeEventCategory(category);
  return type === 'wedding' || type === 'reception' || type === 'engagement' || type === 'sangeet';
}

export function eventTypeCopy(category) {
  const type = normalizeEventCategory(category) || 'wedding';
  return EVENT_TYPE_COPY[type] || EVENT_TYPE_COPY.wedding;
}

export const WEDDING_TEMPLATE_OPTIONS = [
  { id: 'wedding-template-1', label: 'Wedding Template 1 — Ivory & Gold' },
  { id: 'wedding-template-2', label: 'Wedding Template 2 — Blush & Emerald' },
  { id: 'wedding-template-3', label: 'Wedding Template 3 — Midnight & Gold' },
];

export function isWeddingPageTemplate(id) {
  return WEDDING_PAGE_TEMPLATES.includes(String(id || ''));
}

export function isTypePageTemplate(id) {
  return TYPE_PAGE_TEMPLATES.includes(String(id || ''));
}

export function isPremiumCeremonyTemplate(id) {
  return isWeddingPageTemplate(id) || isTypePageTemplate(id);
}

export function weddingCardPageTemplate(existing) {
  const current = String(existing || '');
  if (isWeddingPageTemplate(current)) return current;
  return DEFAULT_WEDDING_CARD_TEMPLATE;
}

export function ceremonyPageTemplate(category, existing) {
  const type = normalizeEventCategory(category) || 'wedding';
  if (type === 'wedding') return weddingCardPageTemplate(existing);
  return EVENT_TYPE_TEMPLATES[type];
}

export function normalizePageTemplate(id) {
  const value = String(id || '');
  if (value === 'classic-wedding' || isPremiumCeremonyTemplate(value)) return value;
  return 'default';
}

/**
 * Which wedding live template to render on Watch.
 * Uploaded wedding-card events and manual Wedding events keep the text-only
 * wedding template. Manual entries of other types use the matching premium
 * template. coverImage is never shown. Create-live-link / themed pages are
 * unchanged unless they already store a ceremony template id.
 */
export function resolveWatchWeddingTemplate(event, { hasTheme = false } = {}) {
  const current = String(event?.pageTemplate || '');
  const source = String(event?.source || '');

  if (source === 'wedding-card') {
    if (!isManualWeddingEntry(event)) {
      return weddingCardPageTemplate(current);
    }
    const type = normalizeEventCategory(event?.category) || 'wedding';
    return ceremonyPageTemplate(type, current);
  }

  if (isPremiumCeremonyTemplate(current)) return current;
  if (current === 'classic-wedding') return '';
  if (hasTheme) return '';
  return '';
}

const IST_TIME_ZONE = 'Asia/Kolkata';

export function formatWeddingDate(startTime) {
  if (!startTime) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    timeZone: IST_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatWeddingTime(startTime) {
  if (!startTime) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
