import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoupleWatchSlug,
  buildEventDescription,
  buildEventTitle,
  buildOgHtml,
  buildShareEventDescription,
  buildShareEventTitle,
  buildSitemapXml,
  coupleTitle,
  parsePublicEventCodeFromPath,
  slugifyName,
  truncate,
  watchPath,
} from './seo.js';

test('coupleTitle joins bride and groom', () => {
  assert.equal(coupleTitle({ brideName: 'Priya', groomName: 'Aarav' }), 'Aarav & Priya');
});

test('watchPath uses short code when slug is not a couple slug', () => {
  const path = watchPath({
    shortCode: 'AP24X9',
    slug: 'wedding',
    brideName: 'Priya',
    groomName: 'Aarav',
  });
  assert.equal(path, '/AP24X9');
});

test('watchPath prefers couple slug for new public URLs', () => {
  assert.equal(
    watchPath({
      shortCode: 'AM5DJS',
      slug: 'deekha-reddy-weds-tarun-reddy',
    }),
    '/deekha-reddy-weds-tarun-reddy'
  );
});

test('watchPath falls back to slug when short code missing', () => {
  assert.equal(watchPath({ slug: 'aarav-weds-priya' }), '/aarav-weds-priya');
});

test('buildCoupleWatchSlug is bride-weds-groom', () => {
  assert.equal(
    buildCoupleWatchSlug({
      brideName: 'Deekha Reddy',
      groomName: 'Tarun Reddy',
      title: 'Wedding',
    }),
    'deekha-reddy-weds-tarun-reddy'
  );
});

test('buildCoupleWatchSlug does not duplicate weds from title', () => {
  assert.equal(
    buildCoupleWatchSlug({
      brideName: 'Deekha Reddy',
      groomName: 'Tarun Reddy',
      title: 'Deekha Reddy Weds Tarun Reddy Wedding Live',
    }),
    'deekha-reddy-weds-tarun-reddy'
  );
});

test('buildCoupleWatchSlug strips special characters', () => {
  assert.equal(
    buildCoupleWatchSlug({
      brideName: 'Deekha (Reddy)',
      groomName: "Tarun Reddy!",
      title: 'Wedding',
    }),
    'deekha-reddy-weds-tarun-reddy'
  );
});

test('buildCoupleWatchSlug is empty for Telugu-only names', () => {
  assert.equal(
    buildCoupleWatchSlug({
      brideName: 'దీక్ష',
      groomName: 'తరుణ్',
      title: 'వివాహం',
    }),
    ''
  );
  assert.equal(slugifyName('దీక్ష'), '');
});

test('parsePublicEventCodeFromPath supports couple slugs', () => {
  assert.equal(
    parsePublicEventCodeFromPath('/deekha-reddy-weds-tarun-reddy'),
    'deekha-reddy-weds-tarun-reddy'
  );
});

test('parsePublicEventCodeFromPath supports short and legacy URLs', () => {
  assert.equal(parsePublicEventCodeFromPath('/AP24X9'), 'AP24X9');
  assert.equal(parsePublicEventCodeFromPath('/AP24X9/aarav-weds-priya'), 'AP24X9');
  assert.equal(parsePublicEventCodeFromPath('/live/AP24X9'), 'AP24X9');
  assert.equal(parsePublicEventCodeFromPath('/live/AP24X9/aarav-weds-priya'), 'AP24X9');
  assert.equal(parsePublicEventCodeFromPath('/watch/AP24X9'), 'AP24X9');
  assert.equal(parsePublicEventCodeFromPath('/events/AP24X9/live'), 'AP24X9');
  assert.equal(parsePublicEventCodeFromPath('/events/old-slug'), 'old-slug');
  assert.equal(parsePublicEventCodeFromPath('/login'), null);
  assert.equal(parsePublicEventCodeFromPath('/districts/telangana'), null);
  assert.equal(parsePublicEventCodeFromPath('/'), null);
});

test('buildEventTitle includes live status', () => {
  const title = buildEventTitle(
    { brideName: 'Priya', groomName: 'Aarav', title: 'Wedding', status: 'live' },
    { companyName: 'MaaEvents9' }
  );
  assert.match(title, /Live Now/);
  assert.match(title, /MaaEvents9/);
});

test('buildEventDescription is unique per event', () => {
  const desc = buildEventDescription(
    {
      brideName: 'Priya',
      groomName: 'Aarav',
      title: 'Wedding',
      venue: 'Taj Krishna',
      startTime: '2026-12-01T10:00:00.000Z',
      description: 'A beautiful ceremony.',
      themeSnapshot: { region: 'telangana' },
    },
    { companyName: 'MaaEvents9', tagline: 'Premium streams' }
  );
  assert.match(desc, /Priya/);
  assert.match(desc, /Taj Krishna/);
  assert.match(desc, /Telangana/);
});

test('buildShareEventTitle uses bride heart groom', () => {
  assert.equal(
    buildShareEventTitle({ brideName: 'Deekha Reddy', groomName: 'Tarun Reddy', title: 'Wedding' }),
    'Deekha Reddy ❤️ Tarun Reddy'
  );
});

test('buildShareEventTitle keeps event title when it already names the couple', () => {
  assert.equal(
    buildShareEventTitle({
      brideName: 'Deekha Reddy',
      groomName: 'Tarun Reddy',
      title: 'Deekha Reddy Weds Tarun Reddy',
    }),
    'Deekha Reddy Weds Tarun Reddy'
  );
});

test('buildShareEventTitle falls back to generic platform title', () => {
  assert.equal(
    buildShareEventTitle({ title: '', brideName: '', groomName: '' }),
    'EventLive Pro — Premium Wedding Live Streaming'
  );
});

test('buildShareEventDescription is Wedding Live Streaming', () => {
  assert.equal(buildShareEventDescription(), 'Wedding Live Streaming');
});

test('buildOgHtml emits og/twitter tags without bouncing crawlers to the SPA', () => {
  const html = buildOgHtml({
    title: 'Deekha Reddy ❤️ Tarun Reddy',
    description: 'Wedding Live Streaming',
    url: 'https://eventlivepro.com/AM5DJS',
    image: 'https://example.com/og.jpg',
    siteName: 'EventLive Pro',
  });
  assert.match(html, /property="og:title" content="Deekha Reddy ❤️ Tarun Reddy"/);
  assert.match(html, /property="og:description" content="Wedding Live Streaming"/);
  assert.match(html, /name="twitter:title" content="Deekha Reddy ❤️ Tarun Reddy"/);
  assert.match(html, /name="twitter:description" content="Wedding Live Streaming"/);
  assert.match(html, /property="og:url" content="https:\/\/eventlivepro.com\/AM5DJS"/);
  assert.match(html, /property="og:image" content="https:\/\/example.com\/og.jpg"/);
  assert.match(html, /property="og:image:width" content="1280"/);
  assert.match(html, /property="og:image:height" content="720"/);
  assert.equal(html.includes('http-equiv="refresh"'), false);
});

test('truncate respects max length', () => {
  const long = 'a'.repeat(200);
  assert.equal(truncate(long, 50).length, 50);
});

test('buildSitemapXml emits valid urlset', () => {
  const xml = buildSitemapXml([{ loc: 'https://eventlivepro.com/', priority: '1.0' }]);
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<urlset/);
  assert.match(xml, /eventlivepro\.com/);
});
