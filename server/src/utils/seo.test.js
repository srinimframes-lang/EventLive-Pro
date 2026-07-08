import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventDescription,
  buildEventTitle,
  buildSitemapXml,
  coupleTitle,
  truncate,
  watchPath,
} from './seo.js';

test('coupleTitle joins bride and groom', () => {
  assert.equal(coupleTitle({ brideName: 'Priya', groomName: 'Aarav' }), 'Aarav & Priya');
});

test('watchPath uses short code and couple slug', () => {
  const path = watchPath({
    shortCode: 'AP24X9',
    brideName: 'Priya',
    groomName: 'Aarav',
  });
  assert.equal(path, '/live/AP24X9/aarav-weds-priya');
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
