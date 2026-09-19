import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLEGE_ANNUAL_DAY_TEMPLATE,
  COLLEGE_SECTION_DEFS,
  isCollegeAnnualDayTemplate,
  normalizeCollegeEventKind,
  normalizeCollegeSections,
  resolveCollegeAnnualDayContent,
} from './collegeAnnualDay.js';
import { normalizePageTemplate, resolveWatchWeddingTemplate } from './weddingTemplates.js';

test('college annual day template id is recognized and kept by the admin form normalizer', () => {
  assert.equal(isCollegeAnnualDayTemplate(COLLEGE_ANNUAL_DAY_TEMPLATE), true);
  assert.equal(normalizePageTemplate(COLLEGE_ANNUAL_DAY_TEMPLATE), COLLEGE_ANNUAL_DAY_TEMPLATE);
  assert.equal(normalizePageTemplate('wedding-template-1'), 'wedding-template-1');
  assert.equal(normalizePageTemplate('classic-wedding'), 'classic-wedding');
  assert.equal(normalizePageTemplate('unknown'), 'default');
});

test('college annual day does not activate the wedding watch template', () => {
  assert.equal(
    resolveWatchWeddingTemplate({ pageTemplate: COLLEGE_ANNUAL_DAY_TEMPLATE }, { hasTheme: true }),
    ''
  );
});

test('college annual day content maps template fields without streaming data', () => {
  const content = resolveCollegeAnnualDayContent({
    title: 'Annual Day 2026',
    collegeName: 'St. Mary’s College',
    academicYear: '2025–26',
    chiefGuestName: 'Dr. Rao',
    chiefGuestDesignation: 'Vice Chancellor',
    principalName: 'Prof. Krishnan',
    collegeAddress: 'MG Road, Hyderabad',
    description: 'Celebrating student talent.',
    collegeLogo: '/uploads/logo.png',
    coverImage: '/uploads/banner.jpg',
    streamProvider: 'rtmp',
    liveIngestProvider: 'cloudflare_stream',
    youtubeVideoId: 'abc123',
  });

  assert.equal(content.title, 'Annual Day 2026');
  assert.equal(content.collegeName, 'St. Mary’s College');
  assert.equal(content.academicYear, '2025–26');
  assert.equal(content.chiefGuestName, 'Dr. Rao');
  assert.equal(content.chiefGuestDesignation, 'Vice Chancellor');
  assert.equal(content.principalName, 'Prof. Krishnan');
  assert.equal(content.collegeAddress, 'MG Road, Hyderabad');
  assert.equal(content.description, 'Celebrating student talent.');
  assert.equal(content.collegeLogo, '/uploads/logo.png');
  assert.equal(content.banner, '/uploads/banner.jpg');
  assert.equal(content.kind, 'annual_day');
  assert.equal(content.kicker, 'College Annual Day');
  assert.equal(content.hasChiefGuest, true);
  assert.equal(content.hasInfo, true);
  assert.equal(content.hasSections, false);
  assert.equal(content.streamProvider, undefined);
  assert.equal(content.liveIngestProvider, undefined);
  assert.equal(content.youtubeVideoId, undefined);
});

test('college address falls back to venue when dedicated address is empty', () => {
  const content = resolveCollegeAnnualDayContent({
    title: 'Annual Day',
    venue: 'Main Auditorium',
  });
  assert.equal(content.collegeAddress, 'Main Auditorium');
  assert.equal(content.venue, 'Main Auditorium');
  assert.equal(content.heroPlace, 'Main Auditorium');
  assert.equal(content.hasChiefGuest, false);
  assert.equal(content.kind, 'annual_day');
});

test('missing collegeEventKind keeps the existing Annual Day look and copy', () => {
  const content = resolveCollegeAnnualDayContent({ title: 'Annual Day 2026' });
  assert.equal(normalizeCollegeEventKind(undefined), 'annual_day');
  assert.equal(content.kind, 'annual_day');
  assert.equal(content.kicker, 'College Annual Day');
  assert.equal(content.fallbackTitle, 'Annual Day');
  assert.equal(content.hasSections, false);
  assert.equal(content.tagline, '');
});

test('fest kind uses fest copy and enabled programme sections only', () => {
  const content = resolveCollegeAnnualDayContent({
    title: 'Tarang 2026',
    collegeEventKind: 'fest',
    collegeTagline: 'A celebration of talent',
    collegeContact: '98765 43210',
    collegeSections: {
      dance: { enabled: true, note: 'Solo and group' },
      music: { enabled: true },
      drama: { enabled: false, note: 'hidden' },
      unknown: { enabled: true, note: 'drop me' },
    },
  });
  assert.equal(content.kind, 'fest');
  assert.equal(content.kicker, 'College Fest');
  assert.equal(content.tagline, 'A celebration of talent');
  assert.equal(content.contact, '98765 43210');
  assert.equal(content.hasSections, true);
  assert.deepEqual(
    content.sections.map((item) => item.id),
    ['dance', 'music']
  );
  assert.equal(content.sections[0].note, 'Solo and group');
  assert.equal(COLLEGE_SECTION_DEFS.length, 9);
});

test('college sections normalize unknown keys out and default to disabled', () => {
  const sections = normalizeCollegeSections({ dance: true, extra: true });
  assert.equal(sections.dance.enabled, true);
  assert.equal(sections.music.enabled, false);
  assert.equal(sections.extra, undefined);
});
