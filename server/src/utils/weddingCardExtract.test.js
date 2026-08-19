import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeddingEventTitle,
  parseWeddingCardText,
} from './weddingCardExtract.js';

test('parseWeddingCardText extracts a classic Indian invitation', () => {
  const fields = parseWeddingCardText(`
    Wedding Invitation
    Aarav Sharma
    weds
    Priya Patel
    Sunday, 12th April 2026
    10:30 AM
    Venue: Taj Krishna, Hyderabad
  `);
  assert.equal(fields.groomName, 'Aarav Sharma');
  assert.equal(fields.brideName, 'Priya Patel');
  assert.equal(fields.weddingDate, '2026-04-12');
  assert.equal(fields.weddingTime, '10:30');
  assert.equal(fields.venue, 'Taj Krishna, Hyderabad');
  assert.equal(fields.eventTitle, 'Aarav Sharma & Priya Patel Wedding');
});

test('parseWeddingCardText reads compact couple, date, time, and hall lines', () => {
  const fields = parseWeddingCardText(`
    Ravi & Meena
    12/04/2026 | 6:30 PM
    Grand Palace Banquet Hall, Chennai
  `);
  assert.equal(fields.groomName, 'Ravi');
  assert.equal(fields.brideName, 'Meena');
  assert.equal(fields.weddingDate, '2026-04-12');
  assert.equal(fields.weddingTime, '18:30');
  assert.match(fields.venue, /Grand Palace Banquet Hall/i);
});

test('parseWeddingCardText reads labeled groom/bride/date/time/at fields', () => {
  const fields = parseWeddingCardText(`
    Groom: Karthik
    Bride: Divya
    Date: 01-01-2027
    Time: 11.00 AM
    At: Sri Venkateswara Temple
  `);
  assert.equal(fields.groomName, 'Karthik');
  assert.equal(fields.brideName, 'Divya');
  assert.equal(fields.weddingDate, '2027-01-01');
  assert.equal(fields.weddingTime, '11:00');
  assert.equal(fields.venue, 'Sri Venkateswara Temple');
});

test('parseWeddingCardText treats DD.MM.YYYY as an Indian date', () => {
  const fields = parseWeddingCardText('Wedding of Ananya\n15.08.2026\n7:00 PM');
  assert.equal(fields.weddingDate, '2026-08-15');
  assert.equal(fields.weddingTime, '19:00');
});

test('parseWeddingCardText returns empty fields when OCR text is blank', () => {
  const fields = parseWeddingCardText('   ');
  assert.equal(fields.brideName, '');
  assert.equal(fields.groomName, '');
  assert.equal(fields.weddingDate, '');
  assert.equal(fields.weddingTime, '');
  assert.equal(fields.venue, '');
  assert.equal(fields.eventTitle, '');
});

test('parseWeddingCardText never invents names from invitation boilerplate', () => {
  const fields = parseWeddingCardText('You are cordially invited\nSave the date');
  assert.equal(fields.brideName, '');
  assert.equal(fields.groomName, '');
});

test('buildWeddingEventTitle prefers an explicit title, then couple names', () => {
  assert.equal(buildWeddingEventTitle({ eventTitle: 'Royal Reception' }), 'Royal Reception');
  assert.equal(
    buildWeddingEventTitle({ groomName: 'Aarav', brideName: 'Priya' }),
    'Aarav & Priya Wedding'
  );
  assert.equal(buildWeddingEventTitle({}), 'Wedding Invitation');
});
