import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCollegeTemplateFields,
  normalizeCollegeEventKind,
  normalizeCollegeSections,
} from './collegeAnnualDay.js';

test('college event kind defaults to annual_day so existing events stay unchanged', () => {
  assert.equal(normalizeCollegeEventKind(undefined), 'annual_day');
  assert.equal(normalizeCollegeEventKind('annual_day'), 'annual_day');
  assert.equal(normalizeCollegeEventKind('fest'), 'fest');
  assert.equal(normalizeCollegeEventKind('other'), 'annual_day');
});

test('college sections only persist known programme ids', () => {
  const sections = normalizeCollegeSections({
    dance: { enabled: true, note: 'Folk' },
    music: false,
    extra: { enabled: true },
  });
  assert.equal(sections.dance.enabled, true);
  assert.equal(sections.dance.note, 'Folk');
  assert.equal(sections.music.enabled, false);
  assert.equal(sections.extra, undefined);
  assert.equal(sections.graduation.enabled, false);
});

test('applyCollegeTemplateFields sanitizes kind and sections without touching stream fields', () => {
  const target = { liveIngestProvider: 'mediamtx', streamProvider: 'rtmp' };
  applyCollegeTemplateFields(target, {
    collegeEventKind: 'fest',
    collegeTagline: ' Colour & culture ',
    collegeContact: ' 98765 43210 ',
    collegeSections: { competitions: { enabled: true, note: 'Quiz' } },
  });
  assert.equal(target.collegeEventKind, 'fest');
  assert.equal(target.collegeTagline, 'Colour & culture');
  assert.equal(target.collegeContact, '98765 43210');
  assert.equal(target.collegeSections.competitions.enabled, true);
  assert.equal(target.liveIngestProvider, 'mediamtx');
  assert.equal(target.streamProvider, 'rtmp');
});
