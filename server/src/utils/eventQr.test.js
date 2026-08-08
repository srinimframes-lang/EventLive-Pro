import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventPublicWatchUrl, generateQrPngBuffer } from './eventQr.js';

test('buildEventPublicWatchUrl uses short code root path', async () => {
  const url = await buildEventPublicWatchUrl(
    {
      shortCode: 'AP24X9',
      brideName: 'Priya',
      groomName: 'Aarav',
    },
    { seo: { siteUrl: 'https://eventlivepro.com' }, companyName: 'Test' }
  );
  assert.equal(url, 'https://eventlivepro.com/AP24X9');
});

test('buildEventPublicWatchUrl uses brand domain when provided', async () => {
  const url = await buildEventPublicWatchUrl(
    { shortCode: 'AP24X9' },
    { seo: { siteUrl: 'https://eventlivepro.com' } },
    'live.customer.com'
  );
  assert.equal(url, 'https://live.customer.com/AP24X9');
});

test('generateQrPngBuffer returns a PNG', async () => {
  const buf = await generateQrPngBuffer('https://eventlivepro.com/TEST');
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
});
