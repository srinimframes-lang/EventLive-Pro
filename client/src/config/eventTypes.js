/**
 * Event Type catalogue for EventLive Pro.
 *
 * Stored values are lowercase slugs (backward-compatible with MongoDB `Event.category`).
 * Groups are UI-only. `themeCategoryKey` is reserved for a future Theme ↔ Event Type
 * mapping — it is NOT wired to themes yet.
 */

/** @typedef {{ id: string, label: string, themeCategoryKey?: string }} EventTypeDef */
/** @typedef {{ id: string, label: string, icon: string, types: EventTypeDef[] }} EventTypeGroup */

/** @type {EventTypeGroup[]} */
export const EVENT_TYPE_GROUPS = [
  {
    id: 'wedding_events',
    label: 'Wedding Events',
    icon: '💒',
    types: [
      { id: 'wedding', label: 'Wedding', themeCategoryKey: 'wedding' },
      { id: 'reception', label: 'Reception', themeCategoryKey: 'reception' },
      { id: 'engagement', label: 'Engagement', themeCategoryKey: 'engagement' },
      { id: 'haldi', label: 'Haldi', themeCategoryKey: 'haldi' },
      { id: 'mehendi', label: 'Mehendi', themeCategoryKey: 'mehendi' },
      { id: 'sangeet', label: 'Sangeet', themeCategoryKey: 'sangeet' },
      { id: 'pellikuthuru', label: 'Pellikuthuru', themeCategoryKey: 'wedding' },
      { id: 'pellikoduku', label: 'Pellikoduku', themeCategoryKey: 'wedding' },
    ],
  },
  {
    id: 'family_events',
    label: 'Family Events',
    icon: '👨‍👩‍👧‍👦',
    types: [
      { id: 'birthday', label: 'Birthday', themeCategoryKey: 'birthday' },
      { id: 'anniversary', label: 'Anniversary', themeCategoryKey: 'wedding' },
      { id: 'baby_shower', label: 'Baby Shower', themeCategoryKey: 'baby_shower' },
      { id: 'naming_ceremony', label: 'Naming Ceremony', themeCategoryKey: 'upanayanam' },
      { id: 'half_saree', label: 'Half Saree', themeCategoryKey: 'half_saree' },
      { id: 'house_warming', label: 'House Warming', themeCategoryKey: 'house_warming' },
    ],
  },
  {
    id: 'religious_events',
    label: 'Religious Events',
    icon: '🙏',
    types: [
      { id: 'temple_event', label: 'Temple Event', themeCategoryKey: 'temple' },
      { id: 'homam', label: 'Homam', themeCategoryKey: 'temple' },
      { id: 'pooja', label: 'Pooja', themeCategoryKey: 'temple' },
      { id: 'church_event', label: 'Church Event', themeCategoryKey: 'temple' },
      { id: 'bhajan', label: 'Bhajan', themeCategoryKey: 'temple' },
    ],
  },
  {
    id: 'business_events',
    label: 'Business Events',
    icon: '💼',
    types: [
      { id: 'conference', label: 'Conference', themeCategoryKey: 'corporate' },
      { id: 'webinar', label: 'Webinar', themeCategoryKey: 'corporate' },
      { id: 'workshop', label: 'Workshop', themeCategoryKey: 'corporate' },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: '🎭',
    types: [
      { id: 'concert', label: 'Concert', themeCategoryKey: 'corporate' },
      { id: 'sports', label: 'Sports', themeCategoryKey: 'corporate' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    icon: '✨',
    types: [{ id: 'other', label: 'Other', themeCategoryKey: '' }],
  },
];

/**
 * Legacy values that may still exist on older Event documents.
 * Kept valid in the schema / picker when already selected so editing never breaks.
 */
export const LEGACY_EVENT_TYPES = [
  { id: 'meetup', label: 'Meetup', themeCategoryKey: 'corporate' },
];

const ALL_DEFS = [
  ...EVENT_TYPE_GROUPS.flatMap((g) => g.types),
  ...LEGACY_EVENT_TYPES,
];

/** Flat list of valid category slugs (schema + API filter). */
export const EVENT_CATEGORIES = ALL_DEFS.map((t) => t.id);

/** Default for new events. */
export const DEFAULT_EVENT_TYPE = 'wedding';

const LABEL_BY_ID = Object.fromEntries(ALL_DEFS.map((t) => [t.id, t.label]));

/** Human label for a stored category slug. Falls back gracefully for unknown values. */
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

/** Whether this slug is in the current (non-legacy) catalogue. */
export function isCurrentEventType(category) {
  const key = String(category || '').toLowerCase().trim();
  return EVENT_TYPE_GROUPS.some((g) => g.types.some((t) => t.id === key));
}

/**
 * Groups for a <select> with <optgroup>.
 * If `currentValue` is a legacy/unknown slug, it is prepended so the control stays valid.
 * Pass `includeLegacy: true` (e.g. public filters) to always list legacy types.
 */
export function getEventTypeSelectGroups(currentValue = '', { includeLegacy = false } = {}) {
  const key = String(currentValue || '').toLowerCase().trim();
  const groups = EVENT_TYPE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    icon: g.icon,
    optionLabel: `${g.icon} ${g.label}`.trim(),
    types: g.types,
  }));

  const needLegacyOption =
    includeLegacy || (key && !isCurrentEventType(key));

  if (needLegacyOption) {
    const legacyTypes = includeLegacy
      ? LEGACY_EVENT_TYPES
      : [
          {
            id: key,
            label:
              LEGACY_EVENT_TYPES.find((t) => t.id === key)?.label || eventTypeLabel(key),
            themeCategoryKey:
              LEGACY_EVENT_TYPES.find((t) => t.id === key)?.themeCategoryKey || '',
          },
        ];

    // Avoid duplicating if somehow already present.
    const existing = new Set(groups.flatMap((g) => g.types.map((t) => t.id)));
    const extra = legacyTypes.filter((t) => !existing.has(t.id));
    if (extra.length) {
      groups.push({
        id: 'legacy',
        label: 'Legacy',
        icon: '📌',
        optionLabel: '📌 Legacy',
        types: extra,
      });
    }
  }

  return groups;
}

/**
 * Future hook: preferred Theme category key for an event type.
 * Not used by theme pickers yet — reserved for a later mapping feature.
 */
export function themeCategoryKeyForEventType(category) {
  const key = String(category || '').toLowerCase().trim();
  const def = ALL_DEFS.find((t) => t.id === key);
  return def?.themeCategoryKey || '';
}

/** Public watch-page hero labels (e.g. "WEDDING LIVE"). */
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
