const API = process.env.API || 'https://eventlive-pro.onrender.com';
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@maaevents9.com';
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'MaaEvents9@Admin';

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
}

(async () => {
  const login = await call('/api/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const token = login.body?.token;
  console.log('admin login:', login.status);
  if (!token) throw new Error('admin login failed');

  // Create an admin event (free) to verify short code generation
  const ev = await call('/api/events', {
    method: 'POST', token,
    body: {
      title: 'Aarav & Priya Wedding', description: 'Short code verification event.',
      category: 'other', status: 'draft', isOnline: true,
      brideName: 'Priya', groomName: 'Aarav',
      startTime: new Date(Date.now()+86400000).toISOString(),
      endTime: new Date(Date.now()+90000000).toISOString(),
      youtubeVideoId: 'dQw4w9WgXcQ', streamProvider: 'youtube',
    },
  });
  const created = ev.body?.data;
  console.log('\ncreated event -> status', ev.status);
  console.log('  shortCode:', created?.shortCode, '| slug:', created?.slug, '| id:', created?.id);
  const { shortCode, slug, id } = created || {};

  // Resolve by shortCode
  const byCode = await call(`/api/events/${shortCode}`);
  console.log('\nGET by shortCode ->', byCode.status, '| id matches:', byCode.body?.data?.id === id);

  // Resolve by lowercase shortCode (case-insensitive)
  const byCodeLower = await call(`/api/events/${String(shortCode).toLowerCase()}`);
  console.log('GET by lowercased shortCode ->', byCodeLower.status, '| id matches:', byCodeLower.body?.data?.id === id);

  // Resolve by legacy slug (backward compatible)
  const bySlug = await call(`/api/events/${slug}`);
  console.log('GET by legacy slug ->', bySlug.status, '| id matches:', bySlug.body?.data?.id === id);

  // List events and confirm every one has a shortCode (backfill)
  const list = await call('/api/events?limit=50');
  const items = list.body?.data || [];
  const missing = items.filter((e) => !e.shortCode);
  console.log(`\nevents listed: ${items.length} | missing shortCode: ${missing.length}`);
  console.log('sample codes:', items.slice(0, 5).map((e) => e.shortCode).join(', '));

  // Cleanup
  if (id) {
    const del = await call(`/api/events/${id}`, { method: 'DELETE', token });
    console.log('\ncleanup delete ->', del.status);
  }
  console.log('\nDONE');
})().catch((e) => { console.error(e); process.exit(1); });
