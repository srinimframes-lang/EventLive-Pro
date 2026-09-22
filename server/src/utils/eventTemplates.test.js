import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weddingPageTemplateEnum } from './weddingTemplates.js';
import {
  EXTENDED_PAGE_TEMPLATE_IDS,
  applyEventTemplateFields,
  isExtendedPageTemplate,
  normalizePageTemplateData,
  pageTemplateEnum,
} from './eventTemplates.js';

test('page template enum keeps existing wedding/college IDs and appends new templates', () => {
  const wedding = weddingPageTemplateEnum();
  const all = pageTemplateEnum();
  assert.deepEqual(wedding, [
    'default',
    'classic-wedding',
    'wedding-template-1',
    'wedding-template-2',
    'wedding-template-3',
    'reception-template-1',
    'engagement-template-1',
    'sangeet-template-1',
    'birthday-template-1',
    'other-template-1',
    'college-annual-day',
  ]);
  assert.equal(all.slice(0, wedding.length).join(','), wedding.join(','));
  assert.deepEqual(all.slice(wedding.length), EXTENDED_PAGE_TEMPLATE_IDS);
  assert.equal(isExtendedPageTemplate('college-annual-day'), false);
  assert.equal(isExtendedPageTemplate('engagement-template-1'), false);
  assert.equal(isExtendedPageTemplate('birthday-template-1'), false);
  assert.equal(isExtendedPageTemplate('school-annual-day'), true);
  assert.equal(isExtendedPageTemplate('engagement-nischitartham'), true);
});

test('applyEventTemplateFields stores mixed pageTemplateData without touching college fields', () => {
  const target = { collegeName: 'St. Mary’s College', brideName: '', groomName: '' };
  applyEventTemplateFields(target, {
    pageTemplate: 'school-annual-day',
    pageTemplateData: {
      schoolName: 'Greenwood Public School',
      annualDayName: 'Annual Day 2026',
      chiefGuestName: 'Dr. Rao',
      unknown: 'drop me',
      sections: {
        dance: { enabled: true, note: 'Folk dance' },
        extra: { enabled: true },
      },
    },
    templateLogo: '/uploads/school.png',
  });
  assert.equal(target.collegeName, 'St. Mary’s College');
  assert.equal(target.templateLogo, '/uploads/school.png');
  assert.equal(target.pageTemplateData.schoolName, 'Greenwood Public School');
  assert.equal(target.pageTemplateData.unknown, undefined);
  assert.equal(target.pageTemplateData.sections.dance.enabled, true);
  assert.equal(target.pageTemplateData.sections.extra, undefined);
  assert.equal(target.pageTemplateData.sections.music.enabled, false);
});

test('engagement template copies bride and groom names when event couple fields are empty', () => {
  const target = { brideName: '', groomName: '' };
  applyEventTemplateFields(target, {
    pageTemplate: 'engagement-nischitartham',
    pageTemplateData: { brideName: 'Priya', groomName: 'Aarav', coupleNames: 'Aarav & Priya' },
  });
  assert.equal(target.brideName, 'Priya');
  assert.equal(target.groomName, 'Aarav');
  assert.equal(normalizePageTemplateData('engagement-nischitartham', { tagline: '  Blessings  ' }).tagline, 'Blessings');
});
