const BOT_UA =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot|Pinterest|Embedly/i;

const API_ORIGIN = process.env.VITE_API_URL?.replace(/\/+$/, '').replace(/\/api$/i, '') ||
  'https://eventlive-pro.onrender.com';

/** App routes that must not be treated as event short-codes for bot OG previews. */
const RESERVED_ROOTS = new Set([
  'login',
  'register',
  'book',
  'events',
  'districts',
  'dashboard',
  'admin',
  'reseller',
  'api',
  'uploads',
  'assets',
  'live',
  'watch',
  'sitemap.xml',
  'robots.txt',
]);

function isSeoPath(pathname) {
  if (
    pathname.startsWith('/live/') ||
    pathname.startsWith('/watch/') ||
    pathname.startsWith('/events/') ||
    pathname.startsWith('/districts/')
  ) {
    return true;
  }
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 1 || parts.length === 2) {
    const root = parts[0].toLowerCase();
    if (RESERVED_ROOTS.has(root)) return false;
    if (root.includes('.')) return false;
    return true;
  }
  return false;
}

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return;

  const { pathname } = new URL(request.url);
  if (!isSeoPath(pathname)) return;

  try {
    const previewUrl = `${API_ORIGIN}/api/seo/preview?path=${encodeURIComponent(pathname)}`;
    const res = await fetch(previewUrl, { headers: { Accept: 'text/html' } });
    if (!res.ok) return;
    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return;
  }
}

export const config = {
  matcher: [
    '/live/:path*',
    '/watch/:path*',
    '/events/:path*',
    '/districts/:path*',
    '/:eventCode',
    '/:eventCode/:slug',
  ],
};
