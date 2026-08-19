/**
 * Parse OCR text from a wedding invitation into editable event fields.
 * Never persists — callers must show a confirmation form before saving.
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
const TITLE_NOISE =
  /^(wedding invitation|invitation|you are (cordially )?invited|save the date|together with their families|with the blessings of)$/i;
const NAME_PREFIX =
  /^(mr|mrs|ms|miss|sri|smt|shri|kumari|kumar|dr|sow|chi)\.?\s+/i;

function normalize(raw) {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|•·]/g, '\n')
    .replace(/[♥❤💕💞💗💖]/g, ' & ')
    .replace(/\r\n?/g, '\n')
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

function cleanPersonName(value) {
  let name = String(value || '').replace(/\s+/g, ' ').trim();
  name = name.replace(NAME_PREFIX, '').replace(NAME_PREFIX, '');
  name = name.split(/\s+(?:s\/o|d\/o|son of|daughter of|w\/o)\b/i)[0];
  name = name.replace(/[,.]+\s*$/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return name.length > 80 ? name.slice(0, 80).trim() : name;
  if (/^(and|&|weds|with|the|venue|date|time|on|at)$/i.test(name)) return '';
  return name;
}

function extractLabeledName(text, labels) {
  const re = new RegExp(`(?:${labels})\\s*[:\\-–]\\s*([A-Za-z][A-Za-z .']{1,79})`, 'i');
  const match = text.match(re);
  return match ? cleanPersonName(match[1]) : '';
}

function extractNames(text, lines) {
  let groomName = extractLabeledName(text, 'groom(?:\\s*name)?');
  let brideName = extractLabeledName(text, 'bride(?:\\s*name)?');

  if (!groomName || !brideName) {
    const weds = text.match(
      /([A-Za-z][A-Za-z .']{1,40})\s+(?:weds|wedding|marries)\s+([A-Za-z][A-Za-z .']{1,40})/i
    );
    if (weds) {
      groomName = groomName || cleanPersonName(weds[1]);
      brideName = brideName || cleanPersonName(weds[2]);
    }
  }

  if (!groomName || !brideName) {
    for (const line of lines) {
      if (line.length > 80) continue;
      const pair = line.match(
        /^([A-Za-z][A-Za-z .']{1,40})\s+(?:&|and)\s+([A-Za-z][A-Za-z .']{1,40})$/i
      );
      if (!pair) continue;
      const left = cleanPersonName(pair[1]);
      const right = cleanPersonName(pair[2]);
      if (!left || !right) continue;
      groomName = groomName || left;
      brideName = brideName || right;
      break;
    }
  }

  return { brideName, groomName };
}

function extractDate(text) {
  const numeric = text.match(/\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = numeric[3];
    // Indian invitations use DD/MM/YYYY. If the first number cannot be a month, it is the day.
    if (a > 12 && b <= 12) return toIsoDate(year, b, a);
    return toIsoDate(year, b, a);
  }

  const dayMonthYear = text.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\s*,?\\s*(\\d{4})\\b`,
      'i'
    )
  );
  if (dayMonthYear) {
    return toIsoDate(dayMonthYear[3], MONTHS[dayMonthYear[2].toLowerCase()], dayMonthYear[1]);
  }

  const monthDayYear = text.match(
    new RegExp(
      `\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`,
      'i'
    )
  );
  if (monthDayYear) {
    return toIsoDate(monthDayYear[3], MONTHS[monthDayYear[1].toLowerCase()], monthDayYear[2]);
  }

  const labeled = text.match(
    /(?:date|on)\s*[:\-–]\s*([A-Za-z0-9,./\- ]{6,40})/i
  );
  if (labeled) return extractDate(labeled[1]);

  return '';
}

function extractTime(text) {
  const labeled = text.match(
    /(?:time|starts?(?:\s*at)?)\s*[:\-–]\s*([0-9:. ]{1,8}\s*(?:a\.?m\.?|p\.?m\.?)?)/i
  );
  const source = labeled ? labeled[1] : text;

  const meridem = source.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (meridem) {
    let hour = Number(meridem[1]);
    const minute = Number(meridem[2] || 0);
    const ap = meridem[3].replace(/\./g, '').toLowerCase();
    if (hour === 12) hour = ap.startsWith('a') ? 0 : 12;
    else if (ap.startsWith('p')) hour += 12;
    if (hour > 23 || minute > 59) return '';
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  const twentyFour = source.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hrs?|hours)?\b/i);
  if (twentyFour) return `${pad2(twentyFour[1])}:${pad2(twentyFour[2])}`;

  return '';
}

function looksLikeVenue(line) {
  return /(venue|hotel|palace|mandap|temple|hall|lawn|resort|banquet|kalyanamandapam|garden|club|church|gurudwara|community)/i.test(
    line
  );
}

function extractVenue(text, lines) {
  const labeled = text.match(/venue\s*[:\-–]\s*([^\n]{3,200})/i);
  if (labeled) return labeled[1].replace(/\s+/g, ' ').trim().slice(0, 200);

  const atLine = text.match(/\bat\s*[:\-–]\s*([^\n]{3,200})/i);
  if (atLine && looksLikeVenue(atLine[1])) {
    return atLine[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  for (const line of lines) {
    if (/^venue\b/i.test(line) && line.length > 8) {
      return line.replace(/^venue\s*[:\-–]?\s*/i, '').trim().slice(0, 200);
    }
    if (looksLikeVenue(line) && !/^(date|time|groom|bride)\b/i.test(line)) {
      return line.replace(/^venue\s*[:\-–]?\s*/i, '').trim().slice(0, 200);
    }
  }

  return '';
}

function extractTitle(lines, names) {
  for (const line of lines.slice(0, 8)) {
    if (TITLE_NOISE.test(line)) continue;
    if (/wedding/i.test(line) && line.length >= 3 && line.length <= 120) {
      return line.slice(0, 120);
    }
  }

  const groom = names.groomName;
  const bride = names.brideName;
  if (groom && bride) return `${groom} & ${bride} Wedding`.slice(0, 120);
  if (groom || bride) return `${groom || bride} Wedding`.slice(0, 120);

  const invitation = lines.find((line) => TITLE_NOISE.test(line));
  if (invitation) return invitation.slice(0, 120);

  return '';
}

/**
 * @param {string} rawText
 * @returns {{ brideName: string, groomName: string, weddingDate: string, weddingTime: string, venue: string, eventTitle: string }}
 */
export function parseWeddingCardText(rawText) {
  const text = normalize(rawText);
  if (!text) return { ...EMPTY_WEDDING_FIELDS };

  const lines = linesOf(text);
  const names = extractNames(text, lines);
  const fields = {
    brideName: names.brideName,
    groomName: names.groomName,
    weddingDate: extractDate(text),
    weddingTime: extractTime(text),
    venue: extractVenue(text, lines),
    eventTitle: extractTitle(lines, names),
  };

  return fields;
}

export function buildWeddingEventTitle(fields) {
  const title = String(fields?.eventTitle || fields?.title || '').trim();
  if (title.length >= 3) return title.slice(0, 120);
  const groom = String(fields?.groomName || '').trim();
  const bride = String(fields?.brideName || '').trim();
  if (groom && bride) return `${groom} & ${bride} Wedding`.slice(0, 120);
  if (groom || bride) return `${groom || bride} Wedding`.slice(0, 120);
  return 'Wedding Invitation';
}
