import { COLLEGE_ANNUAL_DAY_TEMPLATE } from './weddingTemplates.js';

export { COLLEGE_ANNUAL_DAY_TEMPLATE };

export const COLLEGE_EVENT_KINDS = [
  { id: 'annual_day', label: 'College Annual Day' },
  { id: 'fest', label: 'College Fest / Cultural Fest' },
];

export const COLLEGE_SECTION_DEFS = [
  { id: 'culturalEvents', label: 'Cultural Events' },
  { id: 'dance', label: 'Dance' },
  { id: 'music', label: 'Music' },
  { id: 'drama', label: 'Drama' },
  { id: 'competitions', label: 'Competitions' },
  { id: 'prizeDistribution', label: 'Prize Distribution' },
  { id: 'guestLectures', label: 'Guest Lectures' },
  { id: 'graduation', label: 'Graduation' },
  { id: 'seminars', label: 'Seminars' },
];

export function isCollegeAnnualDayTemplate(id) {
  return String(id || '') === COLLEGE_ANNUAL_DAY_TEMPLATE;
}

export function normalizeCollegeEventKind(value) {
  return String(value || '').trim() === 'fest' ? 'fest' : 'annual_day';
}

export function emptyCollegeSections() {
  return Object.fromEntries(
    COLLEGE_SECTION_DEFS.map((item) => [item.id, { enabled: false, note: '' }])
  );
}

export function normalizeCollegeSections(input) {
  const source = input && typeof input === 'object' ? input : {};
  const out = emptyCollegeSections();
  for (const def of COLLEGE_SECTION_DEFS) {
    const raw = source[def.id];
    const enabled = raw === true || Boolean(raw?.enabled);
    const note = String(raw?.note || '').trim().slice(0, 300);
    out[def.id] = { enabled, note };
  }
  return out;
}

function collegeCopy(kind) {
  if (kind === 'fest') {
    return {
      kicker: 'College Fest',
      fallbackTitle: 'College Fest',
      fallbackCollege: 'College Fest',
    };
  }
  return {
    kicker: 'College Annual Day',
    fallbackTitle: 'Annual Day',
    fallbackCollege: 'College Annual Day',
  };
}

/**
 * Visual-layer fields for the College Fest / Annual Day public page.
 * Streaming/provider fields are intentionally omitted.
 */
export function resolveCollegeAnnualDayContent(event) {
  const kind = normalizeCollegeEventKind(event?.collegeEventKind);
  const copy = collegeCopy(kind);
  const title = String(event?.title || '').trim();
  const collegeName = String(event?.collegeName || '').trim();
  const academicYear = String(event?.academicYear || '').trim();
  const tagline = String(event?.collegeTagline || '').trim();
  const venue = String(event?.venue || '').trim();
  const chiefGuestName = String(event?.chiefGuestName || '').trim();
  const chiefGuestDesignation = String(event?.chiefGuestDesignation || '').trim();
  const principalName = String(event?.principalName || '').trim();
  const collegeAddress = String(event?.collegeAddress || '').trim() || venue;
  const contact = String(event?.collegeContact || '').trim();
  const description = String(event?.description || '').trim();
  const collegeLogo = String(event?.collegeLogo || '').trim();
  const banner = String(event?.coverImage || event?.heroBackgroundImage || '').trim();
  const sectionMap = normalizeCollegeSections(event?.collegeSections);
  const sections = COLLEGE_SECTION_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    enabled: sectionMap[def.id].enabled,
    note: sectionMap[def.id].note,
  })).filter((item) => item.enabled);

  return {
    kind,
    kicker: copy.kicker,
    fallbackTitle: copy.fallbackTitle,
    fallbackCollege: copy.fallbackCollege,
    collegeName,
    collegeLogo,
    title,
    academicYear,
    tagline,
    venue,
    chiefGuestName,
    chiefGuestDesignation,
    principalName,
    collegeAddress,
    contact,
    description,
    banner,
    sections,
    heroPlace: venue || collegeAddress,
    hasChiefGuest: Boolean(chiefGuestName),
    hasSections: sections.length > 0,
    hasInfo: Boolean(
      description || principalName || collegeAddress || academicYear || venue || contact || tagline
    ),
  };
}
