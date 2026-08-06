/**
 * Frontend-only wedding page templates.
 *
 * Persistence (no server enum change):
 * - All invitation templates use pageTemplate === 'classic-wedding' (already allowed).
 * - Specific variant is stored as a reserved tag: `__wt:<id>`.
 * - Original Classic Wedding = classic-wedding with no `__wt:` tag (unchanged).
 */

export const WEDDING_TEMPLATE_TAG_PREFIX = '__wt:';

/** Built-in Classic Wedding (existing component). */
export const CLASSIC_WEDDING_ID = 'classic-wedding';

/**
 * New invitation-style templates (frontend components + public ornaments).
 * themeCategoryKey reserved for a future Theme map — not wired.
 */
export const WEDDING_TEMPLATES = [
  {
    id: CLASSIC_WEDDING_ID,
    label: 'Classic Wedding',
    description: 'Full-screen invitation hero with elegant serif typography.',
    previewImage: '',
    ornament: '',
    themeCategoryKey: 'wedding',
  },
  {
    id: 'mandap-garden',
    label: 'Mandap Garden',
    description: 'Lush greens and antique gold — outdoor mandap atmosphere.',
    previewImage: '/templates/wedding/preview-mandap-garden.svg',
    ornament: '/templates/wedding/ornament-mandap.svg',
    themeCategoryKey: 'wedding',
  },
  {
    id: 'royal-ivory',
    label: 'Royal Ivory',
    description: 'Ivory parchment and deep wine accents — formal reception feel.',
    previewImage: '/templates/wedding/preview-royal-ivory.svg',
    ornament: '/templates/wedding/ornament-crest.svg',
    themeCategoryKey: 'reception',
  },
  {
    id: 'marigold-festive',
    label: 'Marigold Festive',
    description: 'Bright marigold and teal — celebration energy for Haldi & Sangeet.',
    previewImage: '/templates/wedding/preview-marigold.svg',
    ornament: '/templates/wedding/ornament-marigold.svg',
    themeCategoryKey: 'haldi',
  },
  {
    id: 'moonlight-palace',
    label: 'Moonlight Palace',
    description: 'Midnight navy and champagne silver — evening palace wedding.',
    previewImage: '/templates/wedding/preview-moonlight.svg',
    ornament: '/templates/wedding/ornament-moon.svg',
    themeCategoryKey: 'reception',
  },
  {
    id: 'temple-bells',
    label: 'Temple Bells',
    description: 'Temple red and sandalwood gold — traditional ceremony warmth.',
    previewImage: '/templates/wedding/preview-temple.svg',
    ornament: '/templates/wedding/ornament-bell.svg',
    themeCategoryKey: 'wedding',
  },
];

const BY_ID = Object.fromEntries(WEDDING_TEMPLATES.map((t) => [t.id, t]));

export function getWeddingTemplateMeta(id) {
  return BY_ID[id] || BY_ID[CLASSIC_WEDDING_ID];
}

/** Resolve active wedding template id from an event (null if not a wedding invitation page). */
export function resolveWeddingTemplateId(event) {
  if (event?.pageTemplate !== 'classic-wedding') return null;
  const tag = (event.tags || []).find((t) =>
    String(t || '').startsWith(WEDDING_TEMPLATE_TAG_PREFIX)
  );
  if (!tag) return CLASSIC_WEDDING_ID;
  const id = String(tag).slice(WEDDING_TEMPLATE_TAG_PREFIX.length);
  return BY_ID[id] ? id : CLASSIC_WEDDING_ID;
}

/** Strip reserved template tags (for public display / clean tag lists). */
export function stripWeddingTemplateTags(tags = []) {
  return (tags || []).filter((t) => !String(t || '').startsWith(WEDDING_TEMPLATE_TAG_PREFIX));
}

/**
 * Merge form tags + selected wedding template into payload tags + pageTemplate.
 * @returns {{ pageTemplate: string, tags: string[] }}
 */
export function weddingTemplateToPayload(templateId, tagsInput) {
  const baseTags = Array.isArray(tagsInput)
    ? tagsInput
    : String(tagsInput || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

  const cleaned = stripWeddingTemplateTags(baseTags);
  const id = String(templateId || 'default');

  if (id === 'default' || !id) {
    return { pageTemplate: 'default', tags: cleaned };
  }

  // All invitation templates share the allowed classic-wedding pageTemplate.
  if (id === CLASSIC_WEDDING_ID) {
    return { pageTemplate: 'classic-wedding', tags: cleaned };
  }

  if (BY_ID[id]) {
    return {
      pageTemplate: 'classic-wedding',
      tags: [...cleaned, `${WEDDING_TEMPLATE_TAG_PREFIX}${id}`],
    };
  }

  return { pageTemplate: 'default', tags: cleaned };
}
