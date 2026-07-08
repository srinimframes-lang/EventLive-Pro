const BOT_UA =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot|Pinterest|Embedly/i;

const API_ORIGIN = process.env.VITE_API_URL?.replace(/\/+$/, '').replace(/\/api$/i, '') ||
  'https://eventlive-pro.onrender.com';

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return;

  const { pathname } = new URL(request.url);
  const isSeoPath =
    pathname.startsWith('/live/') ||
    pathname.startsWith('/watch/') ||
    pathname.startsWith('/events/') ||
    pathname.startsWith('/districts/');

  if (!isSeoPath) return;

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
  matcher: ['/live/:path*', '/watch/:path*', '/events/:path*', '/districts/:path*'],
};
