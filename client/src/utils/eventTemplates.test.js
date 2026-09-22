import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLEGE_ANNUAL_DAY_TEMPLATE } from './collegeAnnualDay.js';
import { normalizePageTemplate, resolveWatchWeddingTemplate } from './weddingTemplates.js';
import {
  EXTENDED_PAGE_TEMPLATE_IDS,
  EXTENDED_PAGE_TEMPLATE_OPTIONS,
  isExtendedPageTemplate,
  normalizeEventPageTemplate,
  resolveEventTemplateContent,
} from './eventTemplates.js';

test('extended template IDs are distinct from wedding, reception, and college templates', () => {
  assert.equal(EXTENDED_PAGE_TEMPLATE_IDS.length, 10);
  assert.equal(EXTENDED_PAGE_TEMPLATE_OPTIONS.length, 10);
  assert.equal(isExtendedPageTemplate('college-annual-day'), false);
  assert.equal(isExtendedPageTemplate('classic-wedding'), false);
  assert.equal(isExtendedPageTemplate('reception-template-1'), false);
  assert.equal(isExtendedPageTemplate('engagement-template-1'), false);
  assert.equal(isExtendedPageTemplate('birthday-template-1'), false);
  assert.equal(isExtendedPageTemplate('school-annual-day'), true);
  assert.ok(!EXTENDED_PAGE_TEMPLATE_IDS.includes(COLLEGE_ANNUAL_DAY_TEMPLATE));
});

test('admin form normalizer keeps wedding/college IDs and new template IDs', () => {
  assert.equal(normalizeEventPageTemplate(COLLEGE_ANNUAL_DAY_TEMPLATE), COLLEGE_ANNUAL_DAY_TEMPLATE);
  assert.equal(normalizeEventPageTemplate('wedding-template-1'), 'wedding-template-1');
  assert.equal(normalizeEventPageTemplate('classic-wedding'), 'classic-wedding');
  assert.equal(normalizeEventPageTemplate('engagement-nischitartham'), 'engagement-nischitartham');
  assert.equal(normalizeEventPageTemplate('birthday-party'), 'birthday-party');
  assert.equal(normalizeEventPageTemplate('unknown'), 'default');
  assert.equal(normalizePageTemplate('engagement-nischitartham'), 'default');
});

test('extended templates do not activate wedding watch templates', () => {
  for (const id of EXTENDED_PAGE_TEMPLATE_IDS) {
    assert.equal(resolveWatchWeddingTemplate({ pageTemplate: id }, { hasTheme: true }), '');
  }
});

test('engagement content maps names, family, and contact without streaming fields', () => {
  const content = resolveEventTemplateContent({
    title: 'Aarav & Priya Live',
    pageTemplate: 'engagement-nischitartham',
    venue: 'Hyderabad',
    description: 'Nischitartham ceremony',
    templatePhoto: '/uploads/couple.jpg',
    heroBackgroundImage: '/uploads/hero.jpg',
    liveIngestProvider: 'mux',
    youtubeVideoId: 'abc123',
    pageTemplateData: {
      coupleNames: 'Aarav & Priya',
      brideName: 'Priya',
      groomName: 'Aarav',
      familyNames: 'Both families',
      contact: '9876543210',
      whatsapp: '9876543210',
    },
  });
  assert.equal(content.templateId, 'engagement-nischitartham');
  assert.equal(content.headline, 'Aarav & Priya');
  assert.equal(content.familyBlock, 'Both families');
  assert.equal(content.venue, 'Hyderabad');
  assert.equal(content.photo, '/uploads/couple.jpg');
  assert.equal(content.banner, '/uploads/hero.jpg');
  assert.equal(content.whatsappHref, 'https://wa.me/919876543210');
  assert.equal(content.liveIngestProvider, undefined);
  assert.equal(content.youtubeVideoId, undefined);
});

test('school annual day stays independent of college template fields', () => {
  const content = resolveEventTemplateContent({
    title: 'Annual Day 2026',
    pageTemplate: 'school-annual-day',
    collegeName: 'Should not appear',
    collegeLogo: '/uploads/college.png',
    templateLogo: '/uploads/school.png',
    pageTemplateData: {
      schoolName: 'Greenwood Public School',
      annualDayName: 'Annual Day 2026',
      principalName: 'Mrs. Sharma',
      chiefGuestName: 'Dr. Rao',
      chiefGuestDesignation: 'Director',
      sections: {
        dance: { enabled: true, note: 'Classical' },
        drama: { enabled: false, note: 'hidden' },
        unknown: { enabled: true },
      },
    },
  });
  assert.equal(content.orgName, 'Greenwood Public School');
  assert.equal(content.headline, 'Annual Day 2026');
  assert.equal(content.logo, '/uploads/school.png');
  assert.equal(content.hasSections, true);
  assert.deepEqual(
    content.sections.map((item) => item.id),
    ['dance']
  );
  assert.ok(content.facts.some((fact) => fact.label === 'Chief Guest' && fact.value.includes('Dr. Rao')));
  assert.equal(
    content.facts.some((fact) => String(fact.value).includes('Should not appear')),
    false
  );
});

test('sports scoreboard and optional sections hide when disabled', () => {
  const content = resolveEventTemplateContent({
    title: 'City Cup',
    pageTemplate: 'sports-cricket-tournament',
    pageTemplateData: {
      tournamentName: 'City Cup',
      teamA: 'Lions',
      teamB: 'Tigers',
      liveScore: 'Lions 142/3',
      matchResults: 'Lions won',
      sections: {
        liveScore: { enabled: true },
        fixtures: { enabled: true, note: 'Semi-final 4pm' },
        sponsors: { enabled: false, note: 'hidden' },
      },
    },
  });
  assert.equal(content.hasScoreboard, true);
  assert.equal(content.scoreboard.liveScore, 'Lions 142/3');
  assert.deepEqual(
    content.sections.map((item) => item.id),
    ['fixtures']
  );
});

test('birthday and temple pages map public fields', () => {
  const birthday = resolveEventTemplateContent({
    title: 'Ananya Birthday',
    pageTemplate: 'birthday-party',
    pageTemplateData: { personName: 'Ananya', age: '5th Birthday', familyMessage: 'Join us' },
  });
  assert.equal(birthday.headline, 'Ananya');
  assert.equal(birthday.subtitle, '5th Birthday');
  assert.equal(birthday.familyBlock, 'Join us');

  const temple = resolveEventTemplateContent({
    title: 'Brahmotsavam',
    pageTemplate: 'temple-religious',
    pageTemplateData: {
      templeName: 'Sri Venkateswara Temple',
      eventName: 'Brahmotsavam',
      deityName: 'Lord Venkateswara',
      sections: { pooja: { enabled: true }, bhajan: { enabled: false } },
    },
  });
  assert.equal(temple.orgName, 'Sri Venkateswara Temple');
  assert.equal(temple.headline, 'Brahmotsavam');
  assert.deepEqual(
    temple.sections.map((item) => item.id),
    ['pooja']
  );
});
