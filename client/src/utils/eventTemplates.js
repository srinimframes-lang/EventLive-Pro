/**
 * Additive public-page templates. Wedding / reception / college registries stay intact.
 */
import { normalizePageTemplate as normalizeWeddingPageTemplate } from './weddingTemplates.js';

export const EXTENDED_PAGE_TEMPLATE_IDS = [
  'engagement-nischitartham',
  'birthday-party',
  'baby-naming-barasala',
  'cradle-ceremony',
  'temple-religious',
  'housewarming-gruhapravesham',
  'school-annual-day',
  'sports-cricket-tournament',
  'corporate-event',
  'festival-cultural',
];

export const EXTENDED_PAGE_TEMPLATE_OPTIONS = [
  { id: 'engagement-nischitartham', label: 'Engagement / Nischitartham' },
  { id: 'birthday-party', label: 'Birthday Party' },
  { id: 'baby-naming-barasala', label: 'Baby Naming Ceremony / Barasala' },
  { id: 'cradle-ceremony', label: 'Cradle Ceremony' },
  { id: 'temple-religious', label: 'Temple / Religious Event' },
  { id: 'housewarming-gruhapravesham', label: 'Housewarming / Gruhapravesham' },
  { id: 'school-annual-day', label: 'School Annual Day' },
  { id: 'sports-cricket-tournament', label: 'Sports / Cricket Tournament' },
  { id: 'corporate-event', label: 'Corporate Event' },
  { id: 'festival-cultural', label: 'Festival / Cultural Event' },
];

export const TEMPLATE_SECTION_DEFS = {
  'temple-religious': [
    { id: 'pooja', label: 'Pooja' },
    { id: 'abhishekam', label: 'Abhishekam' },
    { id: 'harathi', label: 'Harathi' },
    { id: 'annadanam', label: 'Annadanam' },
    { id: 'bhajan', label: 'Bhajan' },
    { id: 'specialPrograms', label: 'Special Programs' },
  ],
  'school-annual-day': [
    { id: 'culturalPrograms', label: 'Cultural Programs' },
    { id: 'dance', label: 'Dance' },
    { id: 'music', label: 'Music' },
    { id: 'drama', label: 'Drama' },
    { id: 'prizeDistribution', label: 'Prize Distribution' },
    { id: 'studentPerformances', label: 'Student Performances' },
    { id: 'speeches', label: 'Speeches' },
    { id: 'felicitation', label: 'Felicitation' },
  ],
  'sports-cricket-tournament': [
    { id: 'liveScore', label: 'Live Score' },
    { id: 'matchResults', label: 'Match Results' },
    { id: 'pointsTable', label: 'Points Table' },
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'teams', label: 'Teams' },
    { id: 'sponsors', label: 'Sponsors' },
  ],
  'corporate-event': [
    { id: 'keynote', label: 'Keynote' },
    { id: 'panelDiscussion', label: 'Panel Discussion' },
    { id: 'networking', label: 'Networking' },
    { id: 'awards', label: 'Awards' },
    { id: 'productLaunch', label: 'Product Launch' },
  ],
  'festival-cultural': [
    { id: 'dance', label: 'Dance' },
    { id: 'music', label: 'Music' },
    { id: 'foodStalls', label: 'Food Stalls' },
    { id: 'procession', label: 'Procession' },
    { id: 'rituals', label: 'Traditional Rituals' },
    { id: 'culturalPrograms', label: 'Cultural Programs' },
  ],
};

export const TEMPLATE_FIELD_DEFS = {
  'engagement-nischitartham': [
    { name: 'coupleNames', label: 'Couple Names', placeholder: 'e.g. Aarav & Priya' },
    { name: 'brideName', label: 'Bride Name', placeholder: 'e.g. Priya' },
    { name: 'groomName', label: 'Groom Name', placeholder: 'e.g. Aarav' },
    { name: 'tagline', label: 'Tagline', placeholder: 'With the blessings of our families' },
    { name: 'familyNames', label: 'Family Names', type: 'textarea', placeholder: 'Both families' },
    { name: 'contact', label: 'Contact Details', placeholder: 'Phone or email' },
    { name: 'whatsapp', label: 'WhatsApp number', placeholder: 'e.g. 9876543210' },
  ],
  'birthday-party': [
    { name: 'personName', label: 'Birthday Person Name', placeholder: 'e.g. Ananya' },
    { name: 'age', label: 'Age', placeholder: 'e.g. 5th Birthday' },
    { name: 'tagline', label: 'Theme / Tagline', placeholder: 'e.g. Unicorn Party' },
    { name: 'familyMessage', label: 'Family Message', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'baby-naming-barasala': [
    { name: 'babyName', label: 'Baby Name', placeholder: 'e.g. Vihaan' },
    { name: 'parentsNames', label: 'Parents Names', placeholder: 'e.g. Rahul & Sneha' },
    { name: 'grandparentsNames', label: 'Grandparents Names' },
    { name: 'blessingMessage', label: 'Blessing Message', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'cradle-ceremony': [
    { name: 'babyName', label: 'Baby Name' },
    { name: 'parentsNames', label: 'Parents Names' },
    { name: 'familyNames', label: 'Family Names', type: 'textarea' },
    { name: 'blessingMessage', label: 'Blessing Message', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'temple-religious': [
    { name: 'templeName', label: 'Temple Name' },
    { name: 'eventName', label: 'Event Name' },
    { name: 'deityName', label: 'Deity Name' },
    { name: 'priestName', label: 'Chief Priest / Organizer Name' },
    { name: 'scheduleNote', label: 'Schedule', type: 'textarea', placeholder: 'Pooja timings' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'housewarming-gruhapravesham': [
    { name: 'familyName', label: 'Family Name' },
    { name: 'houseName', label: 'House Name (optional)' },
    { name: 'invitationMessage', label: 'Invitation Message', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'school-annual-day': [
    { name: 'schoolName', label: 'School Name' },
    { name: 'annualDayName', label: 'Annual Day Name' },
    { name: 'academicYear', label: 'Academic Year', placeholder: 'e.g. 2025–26' },
    { name: 'principalName', label: 'Principal Name' },
    { name: 'chiefGuestName', label: 'Chief Guest Name' },
    { name: 'chiefGuestDesignation', label: 'Chief Guest Designation' },
    { name: 'schoolAddress', label: 'School Address', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'sports-cricket-tournament': [
    { name: 'tournamentName', label: 'Tournament Name' },
    { name: 'sport', label: 'Sport', placeholder: 'e.g. Cricket' },
    { name: 'matchName', label: 'Match Name' },
    { name: 'teamA', label: 'Team A' },
    { name: 'teamB', label: 'Team B' },
    { name: 'organizerName', label: 'Organizer Name' },
    { name: 'liveScore', label: 'Live Score', placeholder: 'Shown when configured' },
    { name: 'matchResults', label: 'Match Results', type: 'textarea' },
    { name: 'pointsTable', label: 'Points Table', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'corporate-event': [
    { name: 'companyName', label: 'Company Name' },
    { name: 'eventName', label: 'Event Name' },
    { name: 'organizerName', label: 'Organizer Name' },
    { name: 'tagline', label: 'Tagline' },
    { name: 'scheduleNote', label: 'Agenda', type: 'textarea' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
  'festival-cultural': [
    { name: 'festivalName', label: 'Festival Name' },
    { name: 'culturalTheme', label: 'Cultural Theme' },
    { name: 'organizerName', label: 'Organizer Name' },
    { name: 'tagline', label: 'Tagline' },
    { name: 'contact', label: 'Contact Details' },
    { name: 'whatsapp', label: 'WhatsApp number' },
  ],
};

export const TEMPLATE_IMAGE_DEFS = {
  'engagement-nischitartham': [
    { kind: 'template-photo', field: 'templatePhoto', label: 'Couple Photo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Background / Hero Image' },
  ],
  'birthday-party': [
    { kind: 'template-photo', field: 'templatePhoto', label: 'Birthday Photo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Banner' },
  ],
  'baby-naming-barasala': [
    { kind: 'template-photo', field: 'templatePhoto', label: 'Baby Photo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
  'cradle-ceremony': [
    { kind: 'template-photo', field: 'templatePhoto', label: 'Baby Photo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
  'temple-religious': [
    { kind: 'template-logo', field: 'templateLogo', label: 'Temple Logo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
  'housewarming-gruhapravesham': [
    { kind: 'template-photo', field: 'templatePhoto', label: 'Family Photo' },
    { kind: 'template-extra', field: 'templateExtraPhoto', label: 'House Photo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
  'school-annual-day': [
    { kind: 'template-logo', field: 'templateLogo', label: 'School Logo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'School Photo / Hero Banner' },
  ],
  'sports-cricket-tournament': [
    { kind: 'template-logo', field: 'templateLogo', label: 'Tournament Logo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
  'corporate-event': [
    { kind: 'template-logo', field: 'templateLogo', label: 'Company Logo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
  'festival-cultural': [
    { kind: 'template-logo', field: 'templateLogo', label: 'Festival Logo' },
    { kind: 'hero', field: 'heroBackgroundImage', label: 'Hero Image' },
  ],
};

const COPY = {
  'engagement-nischitartham': {
    kicker: 'Engagement / Nischitartham',
    player: 'Live Engagement',
    familyTitle: 'Family',
  },
  'birthday-party': { kicker: 'Birthday Party', player: 'Birthday Live', familyTitle: 'Message' },
  'baby-naming-barasala': {
    kicker: 'Naming Ceremony / Barasala',
    player: 'Live Ceremony',
    familyTitle: 'Family',
    blessingTitle: 'Blessings',
  },
  'cradle-ceremony': {
    kicker: 'Cradle Ceremony',
    player: 'Live Ceremony',
    familyTitle: 'Family',
    blessingTitle: 'Blessings',
  },
  'temple-religious': { kicker: 'Temple / Religious Event', player: 'Live Darshan', familyTitle: 'Schedule' },
  'housewarming-gruhapravesham': {
    kicker: 'Gruhapravesham',
    player: 'Live Ceremony',
    familyTitle: 'Invitation',
  },
  'school-annual-day': { kicker: 'School Annual Day', player: 'Live Stream', familyTitle: 'Programme' },
  'sports-cricket-tournament': { kicker: 'Sports Live', player: 'Live Match', familyTitle: 'Match Centre' },
  'corporate-event': { kicker: 'Corporate Event', player: 'Live Event', familyTitle: 'Agenda' },
  'festival-cultural': { kicker: 'Festival / Cultural Event', player: 'Live Festival', familyTitle: 'Programme' },
};

export function isExtendedPageTemplate(id) {
  return EXTENDED_PAGE_TEMPLATE_IDS.includes(String(id || ''));
}

export function normalizeEventPageTemplate(id) {
  const value = String(id || '');
  if (isExtendedPageTemplate(value)) return value;
  return normalizeWeddingPageTemplate(value);
}

export function emptyTemplateSections(templateId) {
  const defs = TEMPLATE_SECTION_DEFS[String(templateId || '')] || [];
  return Object.fromEntries(defs.map((item) => [item.id, { enabled: false, note: '' }]));
}

export function normalizeTemplateSections(templateId, input) {
  const defs = TEMPLATE_SECTION_DEFS[String(templateId || '')] || [];
  const source = input && typeof input === 'object' ? input : {};
  const out = emptyTemplateSections(templateId);
  for (const def of defs) {
    const raw = source[def.id];
    out[def.id] = {
      enabled: raw === true || Boolean(raw?.enabled),
      note: String(raw?.note || '').trim().slice(0, 300),
    };
  }
  return out;
}

export function emptyPageTemplateData(templateId = '') {
  return { sections: emptyTemplateSections(templateId) };
}

export function normalizePageTemplateData(templateId, input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = { ...source };
  out.sections = normalizeTemplateSections(templateId, source.sections);
  for (const key of Object.keys(out)) {
    if (key === 'sections') continue;
    if (typeof out[key] === 'string') out[key] = out[key].trim();
  }
  return out;
}

function text(data, key) {
  return String(data?.[key] || '').trim();
}

function whatsappHref(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

/**
 * Visual-layer fields for additive event templates. Streaming fields omitted.
 */
export function resolveEventTemplateContent(event) {
  const templateId = normalizeEventPageTemplate(event?.pageTemplate);
  const data = normalizePageTemplateData(templateId, event?.pageTemplateData);
  const copy = COPY[templateId] || COPY['festival-cultural'];
  const defs = TEMPLATE_SECTION_DEFS[templateId] || [];
  const SCOREBOARD_IDS = new Set(['liveScore', 'matchResults', 'pointsTable']);
  const sections = defs
    .map((def) => ({
      id: def.id,
      label: def.label,
      enabled: Boolean(data.sections?.[def.id]?.enabled),
      note: String(data.sections?.[def.id]?.note || '').trim(),
    }))
    .filter((item) => item.enabled)
    .filter((item) => !SCOREBOARD_IDS.has(item.id));

  const brideName = text(data, 'brideName') || String(event?.brideName || '').trim();
  const groomName = text(data, 'groomName') || String(event?.groomName || '').trim();
  const coupleNames =
    text(data, 'coupleNames') || (brideName && groomName ? `${groomName} & ${brideName}` : brideName || groomName);
  const venue = String(event?.venue || '').trim() || text(data, 'address');
  const description = String(event?.description || '').trim();
  const banner = String(event?.heroBackgroundImage || event?.coverImage || '').trim();
  const photo = String(event?.templatePhoto || '').trim();
  const extraPhoto = String(event?.templateExtraPhoto || '').trim();
  const logo = String(event?.templateLogo || '').trim();
  const contact = text(data, 'contact');
  const whatsapp = text(data, 'whatsapp') || String(event?.studioWhatsapp || '').trim();

  const headline =
    coupleNames ||
    text(data, 'personName') ||
    text(data, 'babyName') ||
    text(data, 'eventName') ||
    text(data, 'festivalName') ||
    text(data, 'tournamentName') ||
    text(data, 'annualDayName') ||
    text(data, 'familyName') ||
    String(event?.title || '').trim();

  const orgName =
    text(data, 'templeName') ||
    text(data, 'schoolName') ||
    text(data, 'companyName') ||
    text(data, 'tournamentName') ||
    text(data, 'festivalName') ||
    text(data, 'familyName') ||
    String(event?.title || '').trim();

  const familyBlock =
    text(data, 'familyNames') ||
    text(data, 'parentsNames') ||
    text(data, 'familyMessage') ||
    text(data, 'invitationMessage');

  const blessing = text(data, 'blessingMessage');
  const subtitle =
    text(data, 'tagline') ||
    text(data, 'culturalTheme') ||
    text(data, 'age') ||
    text(data, 'deityName') ||
    text(data, 'houseName') ||
    text(data, 'academicYear') ||
    text(data, 'sport');

  const facts = [
    text(data, 'age') ? { label: 'Age', value: text(data, 'age') } : null,
    text(data, 'parentsNames') ? { label: 'Parents', value: text(data, 'parentsNames') } : null,
    text(data, 'grandparentsNames') ? { label: 'Grandparents', value: text(data, 'grandparentsNames') } : null,
    text(data, 'deityName') ? { label: 'Deity', value: text(data, 'deityName') } : null,
    text(data, 'priestName') ? { label: 'Chief Priest / Organizer', value: text(data, 'priestName') } : null,
    text(data, 'houseName') ? { label: 'House', value: text(data, 'houseName') } : null,
    text(data, 'address') && text(data, 'address') !== venue
      ? { label: 'Address', value: text(data, 'address') }
      : null,
    venue ? { label: templateId === 'housewarming-gruhapravesham' ? 'Address' : 'Venue', value: venue } : null,
    text(data, 'principalName') ? { label: 'Principal', value: text(data, 'principalName') } : null,
    text(data, 'chiefGuestName')
      ? {
          label: 'Chief Guest',
          value: [text(data, 'chiefGuestName'), text(data, 'chiefGuestDesignation')].filter(Boolean).join(' · '),
        }
      : null,
    text(data, 'schoolAddress') ? { label: 'School address', value: text(data, 'schoolAddress') } : null,
    text(data, 'academicYear') ? { label: 'Year', value: text(data, 'academicYear') } : null,
    text(data, 'teamA') || text(data, 'teamB')
      ? { label: 'Teams', value: [text(data, 'teamA'), text(data, 'teamB')].filter(Boolean).join(' vs ') }
      : null,
    text(data, 'matchName') ? { label: 'Match', value: text(data, 'matchName') } : null,
    text(data, 'sport') ? { label: 'Sport', value: text(data, 'sport') } : null,
    text(data, 'organizerName') && templateId !== 'school-annual-day'
      ? { label: 'Organizer', value: text(data, 'organizerName') }
      : null,
    contact ? { label: 'Contact', value: contact } : null,
  ].filter(Boolean);

  const scoreboard = {
    liveScore: text(data, 'liveScore') || (data.sections?.liveScore?.enabled ? String(data.sections.liveScore.note || '').trim() : ''),
    matchResults:
      text(data, 'matchResults') ||
      (data.sections?.matchResults?.enabled ? String(data.sections.matchResults.note || '').trim() : ''),
    pointsTable:
      text(data, 'pointsTable') ||
      (data.sections?.pointsTable?.enabled ? String(data.sections.pointsTable.note || '').trim() : ''),
  };

  return {
    templateId,
    kicker: copy.kicker,
    playerTitle: copy.player,
    familyTitle: copy.familyTitle,
    blessingTitle: copy.blessingTitle || 'Blessings',
    headline,
    orgName,
    subtitle,
    coupleNames,
    brideName,
    groomName,
    personName: text(data, 'personName'),
    babyName: text(data, 'babyName'),
    venue,
    description,
    banner,
    photo,
    extraPhoto,
    logo,
    contact,
    whatsapp,
    whatsappHref: whatsappHref(whatsapp),
    familyBlock,
    blessing,
    scheduleNote: text(data, 'scheduleNote'),
    sections,
    facts,
    scoreboard,
    hasSections: sections.length > 0,
    hasFamily: Boolean(familyBlock),
    hasBlessing: Boolean(blessing),
    hasSchedule: Boolean(text(data, 'scheduleNote')),
    hasScoreboard: Boolean(scoreboard.liveScore || scoreboard.matchResults || scoreboard.pointsTable),
    hasInfo: Boolean(description || facts.length || text(data, 'scheduleNote')),
    hasPhoto: Boolean(photo),
    hasExtraPhoto: Boolean(extraPhoto),
  };
}
