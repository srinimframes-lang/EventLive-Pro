/** Photography studio fields on an event payload. */
const STUDIO_STRING_FIELDS = [
  'studioName',
  'photographerName',
  'studioPhone',
  'studioWhatsapp',
  'studioEmail',
  'studioWebsite',
  'studioInstagram',
  'studioFacebook',
  'studioYoutube',
  'studioMapsUrl',
];

/** Trim studio strings; empty optional values become ''. */
export function normalizeStudioFields(obj) {
  for (const key of STUDIO_STRING_FIELDS) {
    if (obj[key] !== undefined) {
      obj[key] = String(obj[key] ?? '').trim();
    }
  }
  return obj;
}

/** True when any studio branding / contact field is non-empty. */
export function hasStudioDetails(obj) {
  return STUDIO_STRING_FIELDS.some((key) => Boolean(String(obj[key] ?? '').trim()));
}

/**
 * WhatsApp is required only when other studio details are provided.
 * Optional social URLs never block save on their own.
 */
export function assertStudioWhatsapp(obj, res) {
  if (hasStudioDetails(obj) && !String(obj.studioWhatsapp ?? '').trim()) {
    res.status(400);
    throw new Error('WhatsApp number is required when photography studio details are provided');
  }
}
