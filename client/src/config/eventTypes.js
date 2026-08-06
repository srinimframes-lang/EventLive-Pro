/**
 * Event Type catalogue for EventLive Pro (frontend).
 *
 * CREATE/EDIT picker shows FORM_EVENT_TYPES only.
 * Labels + legacy values remain so older MongoDB categories still display/edit.
 */

/** @typedef {{ id: string, label: string, themeCategoryKey?: string }} EventTypeDef */

/** Types shown in create/edit Event Type picker (and public filters). */
export const FORM_EVENT_TYPES = [
  { id: 'wedding', label: 'Wedding', themeCategoryKey: 'wedding' },
  { id: 'reception', label: 'Reception', themeCategoryKey: 'reception' },
  { id: 'engagement', label: 'Engagement', themeCategoryKey: 'engagement' },
  { id: 'birthday', label: 'Birthday', themeCategoryKey: 'birthday' },
  { id: 'naming_ceremony', label: 'Naming Ceremony', themeCategoryKey: 'upanayanam' },
  { id: 'half_saree', label: 'Half Saree', themeCategoryKey: 'half_saree' },
  { id: 'house_warming', label: 'House Warming', themeCategoryKey: 'house_warming' },
  { id: 'pooja', label: 'Pooja', themeCategoryKey: 'temple' },
  { id: 'sangeet', label: 'Sangeet', themeCategoryKey: 'sangeet' },
  { id: 'anniversary', label: 'Anniversary', themeCategoryKey: 'wedding' },
  { id: 'temple_event', label: 'Temple Event', themeCategoryKey: 'temple' },
  { id: 'other', label: 'Other', themeCategoryKey: '' },
];

/**
 * Older category values that may still exist on Event documents.
 * Not offered for new events; shown only when already selected (edit) or in filters with includeLegacy.
 */
export const LEGACY_EVENT_TYPES = [
  { id: 'conference', label: 'Conference', themeCategoryKey: 'corporate' },
  { id: 'workshop', label: 'Workshop', themeCategoryKey: 'corporate' },
  { id: 'webinar', label: 'Webinar', themeCategoryKey: 'corporate' },
  { id: 'concert', label: 'Concert', themeCategoryKey: 'corporate' },
  { id: 'meetup', label: 'Meetup', themeCategoryKey: 'corporate' },
  { id: 'sports', label: 'Sports', themeCategoryKey: 'corporate' },
  { id: 'haldi', label: 'Haldi', themeCategoryKey: 'haldi' },
  { id: 'mehendi', label: 'Mehendi', themeCategoryKey: 'mehendi' },
  { id: 'pellikuthuru', label: 'Pellikuthuru', themeCategoryKey: 'wedding' },
  { id: 'pellikoduku', label: 'Pellikoduku', themeCategoryKey: 'wedding' },
  { id: 'baby_shower', label: 'Baby Shower', themeCategoryKey: 'baby_shower' },
  { id: 'homam', label: 'Homam', themeCategoryKey: 'temple' },
  { id: 'church_event', label: 'Church Event', themeCategoryKey: 'temple' },
  { id: 'bhajan', label: 'Bhajan', themeCategoryKey: 'temple' },
];

/** @deprecated Use FORM_EVENT_TYPES — kept for callers expecting groups. */
export const EVENT_TYPE_GROUPS = [
  {
    id: 'events',
    label: 'Event types',
    icon: '🎉',
    types: FORM_EVENT_TYPES,
  },
];

const ALL_DEFS = [...FORM_EVENT_TYPES, ...LEGACY_EVENT_TYPES];

/** Flat list used for labels / known slugs (not the Mongo enum). */
export const EVENT_CATEGORIES = ALL_DEFS.map((t) => t.id);

/** Default for new events. */
export const DEFAULT_EVENT_TYPE = 'wedding';

const LABEL_BY_ID = Object.fromEntries(ALL_DEFS.map((t) => [t.id, t.label]));
const FORM_IDS = new Set(FORM_EVENT_TYPES.map((t) => t.id));

/** Human label for a stored category slug. */
export function eventTypeLabel(category) {
  if (!category) return '';
  const key = String(category).toLowerCase().trim();
  if (LABEL_BY_ID[key]) return LABEL_BY_ID[key];
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function isFormEventType(category) {
  return FORM_IDS.has(String(category || '').toLowerCase().trim());
}

/** @deprecated alias — form catalogue, not full history. */
export function isCurrentEventType(category) {
  return isFormEventType(category);
}

/**
 * Options for Event Type <select>.
 * Always includes FORM_EVENT_TYPES; adds current value if it is a legacy slug.
 */
export function getEventTypeSelectGroups(currentValue = '', { includeLegacy = false } = {}) {
  const key = String(currentValue || '').toLowerCase().trim();
  const groups = [
    {
      id: 'events',
      label: 'Event types',
      icon: '🎉',
      optionLabel: 'Event types',
      types: FORM_EVENT_TYPES,
    },
  ];

  const needLegacy =
    includeLegacy || (key && !isFormEventType(key));

  if (needLegacy) {
    const legacyTypes = includeLegacy
      ? LEGACY_EVENT_TYPES
      : [
          {
            id: key,
            label: LABEL_BY_ID[key] || eventTypeLabel(key),
            themeCategoryKey: LEGACY_EVENT_TYPES.find((t) => t.id === key)?.themeCategoryKey || '',
          },
        ];
    const existing = new Set(FORM_EVENT_TYPES.map((t) => t.id));
    const extra = legacyTypes.filter((t) => t.id && !existing.has(t.id));
    if (extra.length) {
      groups.push({
        id: 'legacy',
        label: 'Current value',
        icon: '📌',
        optionLabel: '📌 Current value',
        types: extra,
      });
    }
  }

  return groups;
}

export function themeCategoryKeyForEventType(category) {
  const key = String(category || '').toLowerCase().trim();
  const def = ALL_DEFS.find((t) => t.id === key);
  return def?.themeCategoryKey || '';
}

const PUBLIC_LIVE_OVERRIDES = {
  half_saree: 'HALF SAREE CEREMONY',
  corporate: 'CORPORATE LIVE',
  temple: 'TEMPLE LIVE',
  memorial: 'MEMORIAL LIVE',
  upanayanam: 'UPANAYANAM LIVE',
};

export function publicEventTypeLiveLabel(category) {
  if (!category) return 'LIVE';
  const key = String(category).toLowerCase().trim();
  if (PUBLIC_LIVE_OVERRIDES[key]) return PUBLIC_LIVE_OVERRIDES[key];
  const label = eventTypeLabel(key);
  if (!label) return 'LIVE';
  const upper = label.toUpperCase();
  if (upper.endsWith(' LIVE') || upper.endsWith(' CEREMONY')) return upper;
  return `${upper} LIVE`;
}
