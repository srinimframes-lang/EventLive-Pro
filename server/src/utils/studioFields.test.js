import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStudioWhatsapp,
  hasStudioDetails,
  normalizeStudioFields,
} from './studioFields.js';

test('normalizeStudioFields trims and clears optional URLs', () => {
  const payload = normalizeStudioFields({
    studioInstagram: '  ',
    studioEmail: ' hello@studio.com ',
    studioWhatsapp: ' 919876543210 ',
  });
  assert.equal(payload.studioInstagram, '');
  assert.equal(payload.studioEmail, 'hello@studio.com');
  assert.equal(payload.studioWhatsapp, '919876543210');
});

test('hasStudioDetails is false when all studio fields empty', () => {
  assert.equal(
    hasStudioDetails({
      studioInstagram: '',
      studioFacebook: '',
      studioEmail: '',
      studioWhatsapp: '',
    }),
    false
  );
});

test('hasStudioDetails is true when only optional URL is set', () => {
  assert.equal(hasStudioDetails({ studioInstagram: 'https://instagram.com/x' }), true);
});

test('assertStudioWhatsapp allows fully empty studio section', () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; } };
  assert.doesNotThrow(() =>
    assertStudioWhatsapp({ studioInstagram: '', studioWhatsapp: '' }, res)
  );
});

test('assertStudioWhatsapp blocks studio name without WhatsApp', () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; } };
  assert.throws(
    () => assertStudioWhatsapp({ studioName: 'Moments Studio', studioWhatsapp: '' }, res),
    /WhatsApp number is required/
  );
});

test('assertStudioWhatsapp allows WhatsApp-only studio contact', () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; } };
  assert.doesNotThrow(() =>
    assertStudioWhatsapp({ studioWhatsapp: '919876543210' }, res)
  );
});
