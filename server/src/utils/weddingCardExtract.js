/**
 * Parse OCR text from a wedding invitation into editable event fields.
 * Never persists — callers must show a confirmation form before saving.
 * Returns empty strings when a field cannot be read; never invents sample names.
 */

export const EMPTY_WEDDING_FIELDS = {
  brideName: '',
  groomName: '',
  weddingDate: '',
  weddingTime: '',
  venue: '',
  eventTitle: '',
};

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_ALT = Object.keys(MONTHS).join('|');
const WEEKDAY_ALT = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

const TITLE_NOISE =
  /^(wedding invitation|invitation(?:\s+card)?|you are (cordially )?invited|save the date|together with their families|with the blessings of|request the (honou?r|pleasure))$/i;

const CONNECTOR = '(?:weds|with|and|&|marries)';

/** Honorifics that may appear before a person name (Indian invitation style). */
const HONORIFIC =
  '(?:chi\\.?\\s*la\\.?\\s*sow\\.?|kum(?:ari)?\\.?\\s*la\\.?\\s*sow\\.?|chi\\.?\\s*sow\\.?|kum\\.?\\s*sow\\.?|chiranjeevi|sowbhagyavath[iy]|kumari|sri|shri|smt|sow|chi|mr|mrs|ms|miss|dr)';

const NAME_STOP =
  'weds|wed|with|and|marries|on|at|venue|reception|invitation|wedding|marriage|bride|groom|date|time|onwards|sunday|monday|tuesday|wednesday|thursday|friday|saturday|shubhamastu|avighnamastu|sumuhurtham|muhurtham|lagna';

const NAME_WORD = `(?!(?:${NAME_STOP})\\b)[A-Za-z][A-Za-z.'\\-]*`;

const NAME_CORE = `(${NAME_WORD}(?:\\s+${NAME_WORD}){0,5})`;

const PERSON = `(?:${HONORIFIC}\\.?\\s+)?${NAME_CORE}`;

const BOILERPLATE_LINE =
  /^(wedding invitation|invitation(?:\s+card)?|you are (cordially )?invited|save the date|together with their families|with the blessings|request the (honou?r|pleasure)|rsvp|dinner|lunch|muhurtham|onwards)$/i;

function collapseSpaces(value) {
  return String(value || '').replace(/[ \t]+/g, ' ').trim();
}

function normalize(raw) {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|•·∙]/g, '\n')
    .replace(/[♥❤💕💞💗💖]/g, ' & ')
    .replace(/\r\n?/g, '\n')
    .replace(/[，]/g, ',')
    .replace(/\b(a)\s*\.\s*(m)\s*\.?/gi, '$1.m.')
    .replace(/\b(p)\s*\.\s*(m)\s*\.?/gi, '$1.m.')
    .replace(/\b(a)\s+(m)\b/gi, '$1.m.')
    .replace(/\b(p)\s+(m)\b/gi, '$1.m.')
    .replace(/chi\s*\.\s*la\s*\.\s*sow\s*\.?/gi, 'Chi.La.Sow.')
    .replace(/chi\s*\.\s*sow\s*\.?/gi, 'Chi.Sow.')
    .replace(/kum(?:ari)?\s*\.\s*la\s*\.\s*sow\s*\.?/gi, 'Kum.La.Sow.')
    .replace(/\bw[il1]th\b/gi, 'with')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function linesOf(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^[\s\-–—*]+|[\s\-–—*]+$/g, '').trim())
    .filter(Boolean);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const fullYear = y < 100 ? 2000 + y : y;
  if (fullYear < 2000 || fullYear > 2100) return '';
  const dt = new Date(Date.UTC(fullYear, m - 1, d));
  if (dt.getUTCFullYear() !== fullYear || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return '';
  }
  return `${fullYear}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Strip Indian / English honorifics from a captured name. Does not treat
 * "Kumar" as an honorific — it is a common given/middle name.
 */
export function stripHonorifics(value) {
  let name = collapseSpaces(value);
  name = name.replace(/^(chi\.sow|chi\.la\.sow|kum\.la\.sow|chilasow|kumlasow)\.?\s*/i, '');
  let prev = '';
  while (name !== prev) {
    prev = name;
    name = name.replace(
      /^(chi\.?\s*la\.?\s*sow|kum(?:ari)?\.?\s*la\.?\s*sow|chi\.?\s*sow|kum\.?\s*sow|chiranjeevi|sowbhagyavath[iy])\.?\s+/i,
      ''
    );
    name = name.replace(/^(chi\.sow|chi\.la\.sow)\.?(?=[A-Za-z])/i, '');
    name = name.replace(/^(mr|mrs|ms|miss|sri|shri|smt|sow|chi|dr|kumari)\.(?=[A-Za-z])/i, '');
    name = name.replace(/^(mr|mrs|ms|miss|sri|shri|smt|sow|chi|dr|kumari)\.?\s+/i, '');
  }
  return collapseSpaces(name);
}

const NAME_NOISE_WORDS = new Set([
  'with',
  'weds',
  'wed',
  'wedding',
  'invitation',
  'invite',
  'invited',
  'marriage',
  'venue',
  'reception',
  'sumuhurtham',
  'muhurtham',
  'lagna',
  'shubhamastu',
  'avighnamastu',
  'card',
  'save',
  'date',
]);

const BLESSING_WORDS = new Set([
  'shubhamastu',
  'avighnamastu',
  'sumuhurtham',
  'muhurtham',
  'swagatam',
]);

const FAMILY_LINE_RE =
  /grand\s*daughters?|granddaughters?|grand\s*sons?|grandsons?|daughters?\s+of|sons?\s+of|elder\s+sons?|younger\s+sons?|\bdaughter\b|\bson\b|\blate\b|\bparents?\b|\bfather\b|\bmother\b|\bfamily\b|invited\s+by|compliments|near\s*&\s*dear|with\s+best\s+compliments|\bsri\.|\bsmt\.|\bshri\./i;

/** Job titles, degrees, and department lines — never bride/groom names. */
const PROFESSION_LINE_RE =
  /scientist(?:\s*[-–]\s*[A-Za-z0-9]+)?|\bmbbs\b|\bbds\b|\bmds\b|\bmba\b|\bph\.?\s*d\b|\bb\.?\s*tech\b|\bm\.?\s*tech\b|m\.\s*s\.|general\s+surgery|general\s+medicine|\bengineer\b|\badvocate\b|\bprofessor\b|\blecturer\b|\bphysician\b|\bsurgeon\b|\bcsb\b|\bicsr\b|\bicmr\b|\bcsir\b|\bisro\b|\bdrdo\b|designation|qualification|software\s+engineer/i;

const PROFESSION_NAME_BLOCK =
  /^(scientist(?:-[a-z0-9]+)?|engineer|advocate|professor|lecturer|surgeon|physician|mbbs|bds|mds|mba|phd|csb|ms)$/i;

function isProfessionLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return false;
  const stripped = stripHonorifics(raw);
  if (PROFESSION_NAME_BLOCK.test(stripped)) return true;
  if (honorificRole(raw)) return PROFESSION_LINE_RE.test(stripped);
  return PROFESSION_LINE_RE.test(raw);
}

const FAMILY_SPLIT_RE =
  /(?=\b(?:grand(?:\s+daughters?|\s+sons?|daughters?|sons?)|daughters?\s+of|sons?\s+of|elder\s+sons?|younger\s+sons?|late\b|invited\s+by|compliments|smt\.|sri\.|shri\.))/i;

/**
 * Normalize a captured person name: honorifics, invitation keywords,
 * extra spaces, and duplicated words. Never invents a name.
 */
function toNameCase(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
        )
        .join('-')
    )
    .join(' ');
}

export function normalizeWeddingPersonName(value) {
  let name = stripHonorifics(value);
  name = name
    .replace(/[^A-Za-z .'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !NAME_NOISE_WORDS.has(word.toLowerCase()));
  const deduped = [];
  for (const word of words) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.toLowerCase() === word.toLowerCase()) continue;
    deduped.push(word);
  }
  return toNameCase(deduped.join(' ').slice(0, 80).trim());
}

export function isValidWeddingPersonName(value) {
  const raw = String(value || '');
  if ([...BLESSING_WORDS].some((word) => new RegExp(`\\b${word}\\b`, 'i').test(raw))) {
    return false;
  }
  if (FAMILY_LINE_RE.test(raw)) return false;
  if (isProfessionLine(raw)) return false;
  const name = normalizeWeddingPersonName(value);
  if (!name || name.length < 1) return false;
  if (PROFESSION_NAME_BLOCK.test(name)) return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6) return false;
  if (words.some((word) => BLESSING_WORDS.has(word.toLowerCase()))) return false;
  if (words.every((word) => NAME_NOISE_WORDS.has(word.toLowerCase()))) return false;
  if (!/^[A-Za-z][A-Za-z .'\-]*$/.test(name)) return false;
  return true;
}

/** Keep Quick Create spelling exactly as typed. Does not title-case or strip honorifics. */
export function preserveEnteredPersonName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Title is ALWAYS `${groom} Weds ${bride}` from normalized names — never OCR text. */
export function buildWedsTitle(groomName, brideName) {
  if (!isValidWeddingPersonName(groomName) || !isValidWeddingPersonName(brideName)) return '';
  const groom = normalizeWeddingPersonName(groomName);
  const bride = normalizeWeddingPersonName(brideName);
  if (!groom || !bride) return '';
  return `${groom} Weds ${bride}`.slice(0, 120);
}

/** Quick Create title from the exact names the user typed. Does not use OCR. */
export function buildExactWedsTitle(groomName, brideName) {
  const groom = preserveEnteredPersonName(groomName);
  const bride = preserveEnteredPersonName(brideName);
  if (!groom || !bride) return '';
  return `${groom} Weds ${bride}`.slice(0, 120);
}

/** Manual wedding entry title: `${bride} Weds ${groom}`. Does not change OCR/card titles. */
export function buildBrideWedsGroomTitle(brideName, groomName) {
  if (!isValidWeddingPersonName(groomName) || !isValidWeddingPersonName(brideName)) return '';
  const groom = normalizeWeddingPersonName(groomName);
  const bride = normalizeWeddingPersonName(brideName);
  if (!groom || !bride) return '';
  return `${bride} Weds ${groom}`.slice(0, 120);
}

export function isLikelyFamilyOrGarbageName(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (FAMILY_LINE_RE.test(raw) || TITLE_NOISE.test(raw) || BOILERPLATE_LINE.test(raw)) return true;
  if (isProfessionLine(raw)) return true;
  if ([...BLESSING_WORDS].some((word) => new RegExp(`\\b${word}\\b`, 'i').test(raw))) return true;
  if (/^(sri|smt|shri|late|mr|mrs)$/i.test(normalizeWeddingPersonName(raw))) return true;
  return !isValidWeddingPersonName(raw);
}

/** Block YouTube provisioning when the pair looks like parents/OCR garbage. */
export function isProvisionableCouplePair(groomName, brideName) {
  if (isLikelyFamilyOrGarbageName(groomName) || isLikelyFamilyOrGarbageName(brideName)) {
    return false;
  }
  return Boolean(buildWedsTitle(groomName, brideName));
}

function cleanPersonName(value) {
  let name = stripHonorifics(value);
  name = name.split(/\s+(?:s\/o|d\/o|c\/o|son of|daughter of|w\/o)\b/i)[0];
  name = name.replace(/[,;]\s*(?:mbbs|bds|mds|mba|ph\.?\s*d|m\.\s*s\.|b\.?\s*tech|m\.?\s*tech).*$/i, '');
  name = name.replace(/[,.:;]+\s*$/g, '').replace(/\s+/g, ' ').trim();
  if (name.length > 80) name = name.slice(0, 80).trim();
  if (name.length < 1) return '';
  if (
    /^(and|&|weds|with|the|venue|date|time|on|at|reception|invitation|wedding|onwards|from)$/i.test(
      name
    )
  ) {
    return '';
  }
  if (TITLE_NOISE.test(name) || BOILERPLATE_LINE.test(name) || isProfessionLine(name)) return '';
  return name;
}

function isConnectorKind(line) {
  const token = String(line || '')
    .trim()
    .replace(/[^A-Za-z&]/g, '');
  if (!token) return '';
  if (/^w[il1]th$/i.test(token)) return 'with';
  if (/^(weds|marries)$/i.test(token)) return 'weds';
  if (/^(and)$/i.test(token) || token === '&') return 'and';
  return '';
}

function isConnectorLine(line) {
  return Boolean(isConnectorKind(line));
}

function isStopperLine(line) {
  return /^(reception|rsvp|contact|phone|mobile|whatsapp|www\.|http|email|muhurtham)\b/i.test(
    String(line || '').trim()
  );
}

function looksLikeTimeToken(value) {
  return /\b\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)\b/i.test(value);
}

const BRIDE_HONORIFIC_RE =
  /chi\.?\s*la\.?\s*sow|chi\.?la\.?sow|chi\.?\s*sow|chi\.sow|kum(?:ari)?\.?\s*(?:la\.?\s*)?sow|chilasow|sowbhagyavath/i;

function honorificRole(line) {
  const raw = String(line || '').trim();
  if (BRIDE_HONORIFIC_RE.test(raw)) return 'bride';
  if (/^(sow|kumari)\b/i.test(raw)) return 'bride';
  if (/\bchiranjeevi\b/i.test(raw)) return 'groom';
  if (/\bchi\b(?!\s*\.?\s*sow)/i.test(raw)) return 'groom';
  return '';
}

function isFamilyLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return false;
  if (FAMILY_LINE_RE.test(raw)) return true;
  if (
    /^(late\s+)?(sri|smt|shri)\.?\s+/i.test(raw) &&
    !BRIDE_HONORIFIC_RE.test(raw) &&
    !/\bchi\b(?!\s*\.?\s*sow)/i.test(raw)
  ) {
    return true;
  }
  return false;
}

function looksLikePersonName(line) {
  if (isFamilyLine(line) || isProfessionLine(line)) return false;
  const cleaned = cleanPersonName(line);
  if (!cleaned) return false;
  if (/\d/.test(cleaned)) return false;
  if (isConnectorLine(cleaned) || isStopperLine(cleaned)) return false;
  if (/^(venue|reception|date|time|on|at)$/i.test(cleaned)) return false;
  if (new RegExp(`^(${WEEKDAY_ALT}|${MONTH_ALT})$`, 'i').test(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) return false;
  if (words.some((word) => /^(of|the|for|on|at|and|with|invitation|wedding|late)$/i.test(word))) {
    return false;
  }
  return /^[A-Za-z][A-Za-z .'\-]*$/.test(cleaned);
}

function isCoupleCandidateLine(line) {
  if (!line || isFamilyLine(line) || isProfessionLine(line) || isConnectorLine(line) || isStopperLine(line)) {
    return false;
  }
  if (TITLE_NOISE.test(line) || BOILERPLATE_LINE.test(line)) return false;
  if (/^(venue|reception|date|time|on)\b/i.test(line)) return false;
  if (looksLikeTimeToken(line) || extractDateFromChunk(line)) return false;
  if (honorificRole(line)) return looksLikePersonName(line) || Boolean(cleanPersonName(line));
  return looksLikePersonName(line);
}

function nearestCoupleLine(lines, start, step) {
  for (let i = start + step; i >= 0 && i < lines.length; i += step) {
    if (isConnectorLine(lines[i])) continue;
    if (isFamilyLine(lines[i]) || isProfessionLine(lines[i])) continue;
    const fromChunk = coupleNameFromChunk(lines[i]);
    if (fromChunk) return fromChunk;
    if (isCoupleCandidateLine(lines[i])) return lines[i];
  }
  return '';
}

function firstHonorificName(raw) {
  const source = String(raw || '');
  const re =
    /((?:chi\.?\s*la\.?\s*sow|chi\.?\s*sow|chiranjeevi|chi)\.?\s*[A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,2})/gi;
  let match = re.exec(source);
  while (match) {
    const piece = match[1].trim();
    const next = source.slice(match.index + match[0].length, match.index + match[0].length + 12);
    if (/\s+(?:son|daughter|elder|younger|late)\b/i.test(` ${piece} ${next}`)) {
      const clipped = piece.replace(/\s+(?:son|daughter|elder|younger|late)\b.*/i, '').trim();
      if (clipped && (isCoupleCandidateLine(clipped) || looksLikePersonName(clipped))) return clipped;
    }
    if (!isFamilyLine(piece) && (isCoupleCandidateLine(piece) || looksLikePersonName(piece))) {
      return piece;
    }
    match = re.exec(source);
  }
  return '';
}

function coupleNameFromChunk(chunk) {
  const raw = String(chunk || '').trim();
  if (!raw) return '';
  const honorific = firstHonorificName(raw);
  if (honorific) return honorific;
  const pieces = raw
    .split(/\n+/)
    .flatMap((part) => part.split(FAMILY_SPLIT_RE))
    .map((part) => part.replace(/^[\s,.;:]+|[\s,.;:]+$/g, '').trim())
    .filter(Boolean);
  let fallback = '';
  for (const piece of pieces) {
    if (isFamilyLine(piece) || isProfessionLine(piece) || isConnectorLine(piece) || isStopperLine(piece)) {
      continue;
    }
    if (!isCoupleCandidateLine(piece) && !looksLikePersonName(piece)) continue;
    if (honorificRole(piece)) return piece;
    if (!fallback) fallback = piece;
  }
  if (fallback) return fallback;
  if (!isFamilyLine(raw) && isCoupleCandidateLine(raw)) return raw;
  return '';
}

function assignCoupleRoles(leftRaw, rightRaw) {
  const leftLine = coupleNameFromChunk(leftRaw);
  const rightLine = coupleNameFromChunk(rightRaw);
  if (!leftLine || !rightLine) return null;
  const leftName = normalizeWeddingPersonName(leftLine);
  const rightName = normalizeWeddingPersonName(rightLine);
  if (!isValidWeddingPersonName(leftName) || !isValidWeddingPersonName(rightName)) return null;
  if (isLikelyFamilyOrGarbageName(leftName) || isLikelyFamilyOrGarbageName(rightName)) return null;
  const leftRole = honorificRole(leftLine);
  const rightRole = honorificRole(rightLine);
  if (leftRole === 'bride' && rightRole !== 'bride') {
    return { brideName: leftName, groomName: rightName };
  }
  if (leftRole === 'groom' && rightRole !== 'groom') {
    return { groomName: leftName, brideName: rightName };
  }
  if (rightRole === 'bride' && leftRole !== 'bride') {
    return { brideName: rightName, groomName: leftName };
  }
  if (rightRole === 'groom' && leftRole !== 'groom') {
    return { groomName: rightName, brideName: leftName };
  }
  return { groomName: leftName, brideName: rightName };
}

function splitConnectorParts(raw, kind) {
  if (kind === 'with') return String(raw).split(/\b(?:with|wlth|w1th)\b/i);
  if (kind === 'weds') return String(raw).split(/\b(?:weds|marries)\b/i);
  return String(raw).split(/\s+(?:&|and)\s+/i);
}

function connectorKindInText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (TITLE_NOISE.test(raw) || BOILERPLATE_LINE.test(raw)) return '';
  if (/\b(blessings|cordially|families|request the)\b/i.test(raw) && !honorificRole(raw)) {
    return '';
  }
  if (isFamilyLine(raw) && !isConnectorKind(raw)) return '';
  if (/\b(?:with|wlth|w1th)\b/i.test(raw)) return 'with';
  if (/\b(?:weds|marries)\b/i.test(raw)) return 'weds';
  if (/\s+&\s+/.test(raw) || /\s+and\s+/i.test(raw)) return 'and';
  return isConnectorKind(raw);
}

function pairFromConnectorLine(lines, index, kind) {
  const line = lines[index];
  const tokenOnly = Boolean(isConnectorKind(line));
  if (tokenOnly) {
    return assignCoupleRoles(nearestCoupleLine(lines, index, -1), nearestCoupleLine(lines, index, 1));
  }
  const parts = splitConnectorParts(line, kind);
  const leftChunk = (parts[0] || '').trim();
  const rightChunk = (parts[1] || '').trim();
  const left = coupleNameFromChunk(leftChunk) || nearestCoupleLine(lines, index, -1);
  const right = coupleNameFromChunk(rightChunk) || nearestCoupleLine(lines, index, 1);
  return assignCoupleRoles(left, right);
}

function extractLabeledName(text, labels) {
  const re = new RegExp(`(?:${labels})\\s*[:\\-–]\\s*${PERSON}`, 'i');
  for (const line of linesOf(text)) {
    if (isFamilyLine(line)) continue;
    const match = line.match(re);
    if (match) return cleanPersonName(match[1]);
  }
  return '';
}

function extractScoredPair(lines, text) {
  let wedsPair = null;
  let andPair = null;

  for (let i = 0; i < lines.length; i += 1) {
    const kind = connectorKindInText(lines[i]);
    if (!kind) continue;
    const pair = pairFromConnectorLine(lines, i, kind);
    if (!pair) continue;
    if (kind === 'with') return pair;
    if (kind === 'weds' && !wedsPair) wedsPair = pair;
    if (kind === 'and' && !andPair) andPair = pair;
  }

  const collapsed = String(text || '').replace(/\n/g, ' ');
  const withSplit = collapsed.split(/\b(?:with|wlth|w1th)\b/i);
  if (withSplit.length === 2) {
    const withPair = assignCoupleRoles(withSplit[0], withSplit[1]);
    if (withPair) return withPair;
  }

  return wedsPair || andPair || null;
}

function extractNames(text, lines) {
  const scored = extractScoredPair(lines, text);
  if (scored) return scored;

  const groomName = extractLabeledName(text, 'groom(?:\\s*name)?');
  const brideName = extractLabeledName(text, 'bride(?:\\s*name)?');
  return { brideName, groomName };
}

function extractDateFromChunk(text) {
  const source = String(text || '');
  if (!source.trim()) return '';

  const dayMonthYear = source.match(
    new RegExp(
      `(?:(?:${WEEKDAY_ALT}),?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT}),?\\s*(\\d{4})`,
      'i'
    )
  );
  if (dayMonthYear) {
    return toIsoDate(dayMonthYear[3], MONTHS[dayMonthYear[2].toLowerCase()], dayMonthYear[1]);
  }

  const monthDayYear = source.match(
    new RegExp(
      `\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`,
      'i'
    )
  );
  if (monthDayYear) {
    return toIsoDate(monthDayYear[3], MONTHS[monthDayYear[1].toLowerCase()], monthDayYear[2]);
  }

  const numeric = source.match(/\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = numeric[3];
    if (a > 12 && b <= 12) return toIsoDate(year, b, a);
    return toIsoDate(year, b, a);
  }

  return '';
}

function extractTimeFromChunk(text) {
  const source = String(text || '');
  const meridem = source.match(
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/i
  );
  if (meridem) {
    let hour = Number(meridem[1]);
    const minute = Number(meridem[2] || 0);
    const ap = meridem[3].replace(/[.\s]/g, '').toLowerCase();
    if (hour > 12 || minute > 59) return '';
    if (hour === 12) hour = ap.startsWith('a') ? 0 : 12;
    else if (ap.startsWith('p')) hour += 12;
    if (hour > 23) return '';
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  const twentyFour = source.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hrs?|hours)?\b/i);
  if (twentyFour && !/\b(?:a\.?\s*m\.?|p\.?\s*m\.?)\b/i.test(source)) {
    return `${pad2(twentyFour[1])}:${pad2(twentyFour[2])}`;
  }

  return '';
}

/**
 * Ceremony / muhurtham text only. Reception blocks often have a different
 * date and time and must not overwrite the wedding fields.
 */
function ceremonySection(text) {
  const source = String(text || '');
  const cut = source.search(/\breception\b/i);
  return cut >= 0 ? source.slice(0, cut) : source;
}

function extractDate(text) {
  const ceremony = ceremonySection(text);
  return extractDateFromChunk(ceremony) || extractDateFromChunk(text);
}

function extractTime(text) {
  const ceremony = ceremonySection(text);
  const labeled = ceremony.match(
    /(?:time|starts?(?:\s*at)?)\s*[:\-–]\s*([0-9:. ]{1,8}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?)/i
  );
  if (labeled) {
    const fromLabel = extractTimeFromChunk(labeled[1]);
    if (fromLabel) return fromLabel;
  }
  return extractTimeFromChunk(ceremony) || extractTimeFromChunk(text);
}

function looksLikeVenue(line) {
  return /(venue|hotel|palace|mandap|temple|hall|lawn|resort|banquet|kalyanamandapam|kalyana|garden|club|church|gurudwara|community|convention|function)/i.test(
    line
  );
}

function isAddressLine(line) {
  const raw = String(line || '').trim();
  if (!raw || isStopperLine(raw) || isConnectorLine(raw)) return false;
  if (/^(venue|reception|date|time|groom|bride)\b/i.test(raw)) return false;
  if (looksLikeTimeToken(raw) && !looksLikeVenue(raw)) return false;
  if (extractDateFromChunk(raw) && !looksLikeVenue(raw)) return false;
  if (honorificRole(raw) && looksLikePersonName(raw)) return false;
  return (
    looksLikeVenue(raw) ||
    /(road|rd\.?|street|st\.?|nagar|colony|dist\.?|district|village|town|city|andhra|pradesh|a\/c)/i.test(
      raw
    ) ||
    (/,/.test(raw) && raw.length >= 8 && raw.length <= 80)
  );
}

function extractVenue(text, lines) {
  const ceremonyLines = [];
  for (const line of lines) {
    if (/^reception\b/i.test(line)) break;
    ceremonyLines.push(line);
  }

  const venueIdx = ceremonyLines.findIndex((line) => /^venue\b/i.test(line));
  if (venueIdx >= 0) {
    const head = ceremonyLines[venueIdx].replace(/^venue\s*[:\-–]?\s*/i, '').trim();
    const parts = [];
    if (head) parts.push(head.replace(/[,.:;]+$/g, '').trim());
    for (let i = venueIdx + 1; i < ceremonyLines.length; i += 1) {
      if (!isAddressLine(ceremonyLines[i]) && !ceremonyLines[i]) break;
      if (!isAddressLine(ceremonyLines[i])) break;
      parts.push(ceremonyLines[i].replace(/[,.:;]+$/g, '').trim());
    }
    const joined = parts.filter(Boolean).join(', ');
    if (joined.length >= 3) return joined.slice(0, 200);
  }

  const labeled = ceremonySection(text).match(/venue\s*[:\-–]?\s*([^\n]{3,200})/i);
  if (labeled) {
    return labeled[1].replace(/\s+/g, ' ').replace(/[,.:;]+$/g, '').trim().slice(0, 200);
  }

  const atLine = ceremonySection(text).match(
    /\bat\s+(?!\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))([^\n]{3,200})/i
  );
  if (atLine && looksLikeVenue(atLine[1])) {
    return atLine[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  for (const line of ceremonyLines) {
    if (looksLikeVenue(line) && !/^(date|time|groom|bride)\b/i.test(line)) {
      return line.replace(/^(?:venue|at)\s*[:\-–]?\s*/i, '').trim().slice(0, 200);
    }
  }

  return '';
}

function extractTitle(names) {
  return buildWedsTitle(names.groomName, names.brideName);
}

/**
 * @param {string} rawText
 * @returns {{ brideName: string, groomName: string, weddingDate: string, weddingTime: string, venue: string, eventTitle: string }}
 */
export function parseWeddingCardText(rawText) {
  const text = normalize(rawText);
  if (!text) return { ...EMPTY_WEDDING_FIELDS };

  const lines = linesOf(text);
  const extracted = extractNames(text, lines);
  const groomName = normalizeWeddingPersonName(extracted.groomName);
  const brideName = normalizeWeddingPersonName(extracted.brideName);
  const names = {
    groomName: isValidWeddingPersonName(groomName) ? groomName : '',
    brideName: isValidWeddingPersonName(brideName) ? brideName : '',
  };
  return {
    brideName: names.brideName,
    groomName: names.groomName,
    weddingDate: extractDate(text),
    weddingTime: extractTime(text),
    venue: extractVenue(text, lines),
    eventTitle: extractTitle(names),
  };
}

export function buildWeddingEventTitle(fields) {
  return buildWedsTitle(fields?.groomName, fields?.brideName);
}
