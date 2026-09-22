/**
 * Additive public-page templates. Does not change wedding, reception, or college IDs.
 */
import { weddingPageTemplateEnum } from './weddingTemplates.js';

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

export const TEMPLATE_SECTION_IDS = {
  'temple-religious': ['pooja', 'abhishekam', 'harathi', 'annadanam', 'bhajan', 'specialPrograms'],
  'school-annual-day': [
    'culturalPrograms',
    'dance',
    'music',
    'drama',
    'prizeDistribution',
    'studentPerformances',
    'speeches',
    'felicitation',
  ],
  'sports-cricket-tournament': ['liveScore', 'matchResults', 'pointsTable', 'fixtures', 'teams', 'sponsors'],
  'corporate-event': ['keynote', 'panelDiscussion', 'networking', 'awards', 'productLaunch'],
  'festival-cultural': ['dance', 'music', 'foodStalls', 'procession', 'rituals', 'culturalPrograms'],
};

const STRING_LIMITS = {
  tagline: 200,
  familyNames: 400,
  contact: 300,
  whatsapp: 30,
  personName: 120,
  age: 40,
  familyMessage: 1000,
  babyName: 120,
  parentsNames: 240,
  grandparentsNames: 240,
  blessingMessage: 1000,
  templeName: 160,
  eventName: 200,
  deityName: 120,
  priestName: 120,
  familyName: 160,
  houseName: 160,
  address: 400,
  invitationMessage: 1000,
  schoolName: 160,
  annualDayName: 200,
  academicYear: 40,
  principalName: 120,
  schoolAddress: 400,
  tournamentName: 200,
  sport: 80,
  matchName: 200,
  teamA: 120,
  teamB: 120,
  organizerName: 160,
  liveScore: 300,
  matchResults: 2000,
  pointsTable: 2000,
  companyName: 160,
  festivalName: 160,
  culturalTheme: 200,
  coupleNames: 200,
  brideName: 80,
  groomName: 80,
  scheduleNote: 2000,
  chiefGuestName: 120,
  chiefGuestDesignation: 160,
};

export function isExtendedPageTemplate(id) {
  return EXTENDED_PAGE_TEMPLATE_IDS.includes(String(id || ''));
}

export function pageTemplateEnum() {
  return [...weddingPageTemplateEnum(), ...EXTENDED_PAGE_TEMPLATE_IDS];
}

export function emptyTemplateSections(templateId) {
  const ids = TEMPLATE_SECTION_IDS[String(templateId || '')] || [];
  return Object.fromEntries(ids.map((id) => [id, { enabled: false, note: '' }]));
}

export function normalizeTemplateSections(templateId, input) {
  const ids = TEMPLATE_SECTION_IDS[String(templateId || '')] || [];
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const id of ids) {
    const raw = source[id];
    out[id] = {
      enabled: raw === true || Boolean(raw?.enabled),
      note: String(raw?.note || '').trim().slice(0, 300),
    };
  }
  return out;
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function normalizePageTemplateData(templateId, input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const [key, max] of Object.entries(STRING_LIMITS)) {
    if (source[key] !== undefined) out[key] = clip(source[key], max);
  }
  out.sections = normalizeTemplateSections(templateId, source.sections);
  return out;
}

export function applyEventTemplateFields(target, body) {
  if (!target || !body) return target;
  const templateId = String(body.pageTemplate || target.pageTemplate || '');
  if (body.pageTemplateData !== undefined) {
    target.pageTemplateData = normalizePageTemplateData(templateId, body.pageTemplateData);
    if (typeof target.markModified === 'function') target.markModified('pageTemplateData');
  }
  if (body.templateLogo !== undefined) target.templateLogo = String(body.templateLogo || '').trim();
  if (body.templatePhoto !== undefined) target.templatePhoto = String(body.templatePhoto || '').trim();
  if (body.templateExtraPhoto !== undefined) {
    target.templateExtraPhoto = String(body.templateExtraPhoto || '').trim();
  }

  if (templateId === 'engagement-nischitartham') {
    const data = target.pageTemplateData || {};
    if (data.brideName && !String(target.brideName || '').trim()) target.brideName = data.brideName;
    if (data.groomName && !String(target.groomName || '').trim()) target.groomName = data.groomName;
  }
  return target;
}
