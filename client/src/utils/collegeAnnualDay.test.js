import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLEGE_ANNUAL_DAY_TEMPLATE,
  isCollegeAnnualDayTemplate,
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
  assert.equal(content.hasChiefGuest, true);
  assert.equal(content.hasInfo, true);
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
  assert.equal(content.hasChiefGuest, false);
});
