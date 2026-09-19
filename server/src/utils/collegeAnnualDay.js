/** Persist helpers for the College Fest / Annual Day template. Visual layer only. */

export const COLLEGE_SECTION_IDS = [
  'culturalEvents',
  'dance',
  'music',
  'drama',
  'competitions',
  'prizeDistribution',
  'guestLectures',
  'graduation',
  'seminars',
];

export function normalizeCollegeEventKind(value) {
  return String(value || '').trim() === 'fest' ? 'fest' : 'annual_day';
}

export function normalizeCollegeSections(input) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const id of COLLEGE_SECTION_IDS) {
    const raw = source[id];
    out[id] = {
      enabled: raw === true || Boolean(raw?.enabled),
      note: String(raw?.note || '').trim().slice(0, 300),
    };
  }
  return out;
}

export function applyCollegeTemplateFields(target, body) {
  if (!target || !body) return target;
  if (body.collegeEventKind !== undefined) {
    target.collegeEventKind = normalizeCollegeEventKind(body.collegeEventKind);
  }
  if (body.collegeTagline !== undefined) {
    target.collegeTagline = String(body.collegeTagline || '').trim();
  }
  if (body.collegeContact !== undefined) {
    target.collegeContact = String(body.collegeContact || '').trim();
  }
  if (body.collegeSections !== undefined) {
    target.collegeSections = normalizeCollegeSections(body.collegeSections);
  }
  return target;
}
