/**
 * Extracts a YouTube video ID from a full URL or bare ID.
 * Mirrors client/src/utils/format.js — keep in sync.
 *
 * Supported:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/live/VIDEO_ID
 *   https://youtube.com/live/VIDEO_ID
 *   VIDEO_ID itself
 */
const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YT_ID_TOKEN = '[a-zA-Z0-9_-]{11}';

function cleanYoutubeInput(input) {
  return String(input || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

function validYoutubeId(value) {
  const id = String(value || '').trim();
  return YT_ID_RE.test(id) ? id : '';
}

function hostOf(hostname) {
  return String(hostname || '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

function isYoutubeHost(host) {
  return (
    host === 'youtu.be' ||
    host.endsWith('youtube.com') ||
    host.endsWith('youtube-nocookie.com')
  );
}

function coerceYoutubeUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?(m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(value)) {
    return `https://${value}`;
  }
  return '';
}

function idFromYoutubeUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  const host = hostOf(parsed.hostname);
  if (!isYoutubeHost(host)) return '';

  if (host === 'youtu.be') {
    const id = (parsed.pathname.split('/').filter(Boolean)[0] || '').slice(0, 11);
    return validYoutubeId(id);
  }

  const pathMatch = parsed.pathname.match(
    new RegExp(`\\/(?:live|embed|shorts|v)\\/(${YT_ID_TOKEN})`, 'i')
  );
  if (pathMatch) return validYoutubeId(pathMatch[1]);

  const v = parsed.searchParams.get('v');
  if (v) return validYoutubeId(v.slice(0, 11));

  return '';
}

function idFromYoutubeText(value) {
  const live = value.match(
    new RegExp(`(?:youtube\\.com|youtube-nocookie\\.com)\\/(?:live|embed|shorts|v)\\/(${YT_ID_TOKEN})`, 'i')
  );
  if (live) return live[1];
  const watch = value.match(new RegExp(`[?&]v=(${YT_ID_TOKEN})`));
  if (watch) return watch[1];
  const short = value.match(new RegExp(`youtu\\.be\\/(${YT_ID_TOKEN})`, 'i'));
  if (short) return short[1];
  return '';
}

export function extractYouTubeId(input) {
  if (!input) return '';
  const value = cleanYoutubeInput(input);
  if (!value) return '';
  if (YT_ID_RE.test(value)) return value;

  const fromParsed = idFromYoutubeUrl(value) || idFromYoutubeUrl(coerceYoutubeUrl(value));
  if (fromParsed) return fromParsed;

  const fromText = idFromYoutubeText(value);
  if (fromText) return fromText;

  const loose = value.match(new RegExp(YT_ID_TOKEN));
  return loose ? loose[0] : '';
}
