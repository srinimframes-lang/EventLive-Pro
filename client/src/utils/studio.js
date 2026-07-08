import { resolveMediaUrl, whatsappLink } from './format.js';

/** Ensure external links open with a scheme. */
export function externalUrl(url) {
  if (!url) return '';
  const t = String(url).trim();
  if (!t) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
  return `https://${t}`;
}

/**
 * Normalized studio branding from an event document.
 * Backward compatible: legacy events with only photographerName/logo still work.
 */
export function getStudioInfo(event) {
  if (!event) return { hasContent: false };

  const logo = event.photographerLogo || '';
  const studioName = (event.studioName || '').trim();
  const photographerName = (event.photographerName || '').trim();
  const displayStudio = studioName || photographerName;
  const displayPhotographer =
    studioName && photographerName && studioName !== photographerName ? photographerName : '';

  const phone = (event.studioPhone || '').trim();
  const whatsapp = (event.studioWhatsapp || '').trim();
  const email = (event.studioEmail || '').trim();
  const website = externalUrl(event.studioWebsite);
  const instagram = externalUrl(event.studioInstagram);
  const facebook = externalUrl(event.studioFacebook);
  const youtube = externalUrl(event.studioYoutube);
  const maps = externalUrl(event.studioMapsUrl);

  const hasContent = Boolean(
    displayStudio ||
      logo ||
      displayPhotographer ||
      phone ||
      whatsapp ||
      email ||
      website ||
      instagram ||
      facebook ||
      youtube ||
      maps
  );

  return {
    hasContent,
    logoUrl: logo ? resolveMediaUrl(logo) : '',
    studioName: displayStudio,
    photographerName: displayPhotographer,
    phone,
    phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '',
    whatsapp,
    whatsappHref: whatsappLink(whatsapp),
    email,
    emailHref: email ? `mailto:${email}` : '',
    website,
    instagram,
    facebook,
    youtube,
    maps,
  };
}
