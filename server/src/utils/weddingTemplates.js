/** Reusable wedding live-page template IDs. Visual layer only. */

export const WEDDING_PAGE_TEMPLATES = [
  'wedding-template-1',
  'wedding-template-2',
  'wedding-template-3',
];

export const DEFAULT_WEDDING_CARD_TEMPLATE = 'wedding-template-1';

export const MANUAL_WEDDING_CATEGORIES = [
  'wedding',
  'reception',
  'engagement',
  'sangeet',
  'birthday',
  'other',
];

/** Type → premium public template. Wedding keeps the existing text-only design. */
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

export function normalizeManualWeddingCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  return MANUAL_WEDDING_CATEGORIES.includes(raw) ? raw : '';
}

export function isManualWeddingEntry(event) {
  return (
    String(event?.source || '') === 'wedding-card' &&
    String(event?.weddingEntryMode || '') === 'manual'
  );
}

export function isCoupleEventType(category) {
  const type = normalizeManualWeddingCategory(category);
  return type === 'wedding' || type === 'reception' || type === 'engagement' || type === 'sangeet';
}

const PAGE_TEMPLATE_ENUM = [
  'default',
  'classic-wedding',
  ...WEDDING_PAGE_TEMPLATES,
  ...TYPE_PAGE_TEMPLATES,
];

export function weddingPageTemplateEnum() {
  return PAGE_TEMPLATE_ENUM;
}

export function isWeddingPageTemplate(id) {
  return WEDDING_PAGE_TEMPLATES.includes(String(id || ''));
}

export function isTypePageTemplate(id) {
  return TYPE_PAGE_TEMPLATES.includes(String(id || ''));
}

export function isPremiumCeremonyTemplate(id) {
  return isWeddingPageTemplate(id) || isTypePageTemplate(id);
}

/**
 * New wedding-card events get template 1. Keep an explicit wedding-template-*
 * if the organizer already chose one. Classic/catalog themes are not used on
 * the public wedding-card live page (they would show the invitation image).
 */
export function weddingCardPageTemplate(existing) {
  const current = String(existing || '');
  if (isWeddingPageTemplate(current)) return current;
  return DEFAULT_WEDDING_CARD_TEMPLATE;
}

/**
 * Persist the premium template that matches the selected event type.
 * Wedding always uses the existing wedding-card template helper.
 */
export function ceremonyPageTemplate(category, existing) {
  const type = normalizeManualWeddingCategory(category) || 'wedding';
  if (type === 'wedding') return weddingCardPageTemplate(existing);
  return EVENT_TYPE_TEMPLATES[type];
}

/**
 * Public Watch resolver.
 * Uploaded wedding-card events and manual Wedding events keep the text-only
 * wedding template. Manual entries of other types use the matching premium
 * template. Existing events without a wedding-card source keep their current
 * design (catalog theme / default / classic).
 */
export function resolveWatchWeddingTemplate(event, { hasTheme = false } = {}) {
  const current = String(event?.pageTemplate || '');
  const source = String(event?.source || '');

  if (source === 'wedding-card') {
    if (!isManualWeddingEntry(event)) {
      return weddingCardPageTemplate(current);
    }
    const type = normalizeManualWeddingCategory(event?.category) || 'wedding';
    return ceremonyPageTemplate(type, current);
  }

  if (isPremiumCeremonyTemplate(current)) return current;
  if (current === 'classic-wedding') return '';
  if (hasTheme) return '';
  return '';
}

/**
 * Wedding-card date+time are entered as Indian Standard Time (Asia/Kolkata).
 * Does not rewrite existing stored Date values.
 */
export function combineWeddingCardStartTime(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  let time = String(timeStr || '').trim() || '10:00';
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) time = time.slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const start = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(start.getTime())) return null;
  return start;
}
