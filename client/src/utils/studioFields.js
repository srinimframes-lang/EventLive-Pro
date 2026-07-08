/** Client-side studio field helpers (mirrors server/src/utils/studioFields.js). */
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

export function normalizeStudioForm(form) {
  const out = { ...form };
  for (const key of STUDIO_STRING_FIELDS) {
    if (out[key] !== undefined) out[key] = String(out[key] ?? '').trim();
  }
  return out;
}

export function hasStudioDetails(form) {
  return STUDIO_STRING_FIELDS.some((key) => Boolean(String(form[key] ?? '').trim()));
}

export function studioWhatsappError(form) {
  if (hasStudioDetails(form) && !String(form.studioWhatsapp ?? '').trim()) {
    return 'WhatsApp number is required when photography studio details are provided.';
  }
  return '';
}
