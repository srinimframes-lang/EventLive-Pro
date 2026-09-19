import { COLLEGE_ANNUAL_DAY_TEMPLATE } from './weddingTemplates.js';

export { COLLEGE_ANNUAL_DAY_TEMPLATE };

export function isCollegeAnnualDayTemplate(id) {
  return String(id || '') === COLLEGE_ANNUAL_DAY_TEMPLATE;
}

/**
 * Visual-layer fields for the College Annual Day public page.
 * Streaming/provider fields are intentionally omitted.
 */
export function resolveCollegeAnnualDayContent(event) {
  const title = String(event?.title || '').trim();
  const collegeName = String(event?.collegeName || '').trim();
  const academicYear = String(event?.academicYear || '').trim();
  const chiefGuestName = String(event?.chiefGuestName || '').trim();
  const chiefGuestDesignation = String(event?.chiefGuestDesignation || '').trim();
  const principalName = String(event?.principalName || '').trim();
  const collegeAddress = String(event?.collegeAddress || event?.venue || '').trim();
  const description = String(event?.description || '').trim();
  const collegeLogo = String(event?.collegeLogo || '').trim();
  const banner = String(event?.coverImage || event?.heroBackgroundImage || '').trim();

  return {
    collegeName,
    collegeLogo,
    title,
    academicYear,
    chiefGuestName,
    chiefGuestDesignation,
    principalName,
    collegeAddress,
    description,
    banner,
    hasChiefGuest: Boolean(chiefGuestName),
    hasInfo: Boolean(description || principalName || collegeAddress || academicYear),
  };
}
