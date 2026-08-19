import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeddingEventTitle,
  parseWeddingCardText,
  stripHonorifics,
} from './weddingCardExtract.js';

const SAMPLE_CARD = `
  Wedding Invitation
  Chi. Sai Kumar Reddy
  with
  Chi.La.Sow. Pranathi Reddy
  On Sunday, 30th August, 2026 at 10:15 a.m.
  Venue: Bojjiah Convention A/c.
  Tadipatri, Ananthapur Road.
  Reception: On Wednesday, 02-09-2026 from 7:00 p.m. Onwards
`;

test('stripHonorifics removes Chi. and Chi.La.Sow. without touching Kumar in the name', () => {
  assert.equal(stripHonorifics('Chi. Sai Kumar Reddy'), 'Sai Kumar Reddy');
  assert.equal(stripHonorifics('Chi.La.Sow. Pranathi Reddy'), 'Pranathi Reddy');
  assert.equal(stripHonorifics('Sri. Ramesh'), 'Ramesh');
  assert.equal(stripHonorifics('Smt. Lakshmi'), 'Lakshmi');
});

test('parseWeddingCardText extracts a Chi. / with / Chi.La.Sow. invitation', () => {
  const fields = parseWeddingCardText(SAMPLE_CARD);
  assert.equal(fields.groomName, 'Sai Kumar Reddy');
  assert.equal(fields.brideName, 'Pranathi Reddy');
  assert.equal(fields.weddingDate, '2026-08-30');
  assert.equal(fields.weddingTime, '10:15');
  assert.match(fields.venue, /Bojjiah Convention/i);
  assert.match(fields.venue, /Tadipatri/i);
  assert.equal(fields.eventTitle, 'Sai Kumar Reddy & Pranathi Reddy Wedding');
});

test('parseWeddingCardText reads "Sai Kumar Reddy with Pranathi Reddy"', () => {
  const fields = parseWeddingCardText('Sai Kumar Reddy with Pranathi Reddy');
  assert.equal(fields.groomName, 'Sai Kumar Reddy');
  assert.equal(fields.brideName, 'Pranathi Reddy');
});

test('parseWeddingCardText reads "Sai Kumar Reddy weds Pranathi Reddy"', () => {
  const fields = parseWeddingCardText('Sai Kumar Reddy weds Pranathi Reddy');
  assert.equal(fields.groomName, 'Sai Kumar Reddy');
  assert.equal(fields.brideName, 'Pranathi Reddy');
});

test('parseWeddingCardText reads "Sai Kumar Reddy & Pranathi Reddy"', () => {
  const fields = parseWeddingCardText('Sai Kumar Reddy & Pranathi Reddy');
  assert.equal(fields.groomName, 'Sai Kumar Reddy');
  assert.equal(fields.brideName, 'Pranathi Reddy');
});

test('parseWeddingCardText reads "Chi. Sai Kumar Reddy with Chi.La.Sow. Pranathi Reddy"', () => {
  const fields = parseWeddingCardText(
    'Chi. Sai Kumar Reddy with Chi.La.Sow. Pranathi Reddy'
  );
  assert.equal(fields.groomName, 'Sai Kumar Reddy');
  assert.equal(fields.brideName, 'Pranathi Reddy');
});

test('parseWeddingCardText reads Sunday, 30th August, 2026 at 10:15 a.m.', () => {
  const fields = parseWeddingCardText('On Sunday, 30th August, 2026 at 10:15 a.m.');
  assert.equal(fields.weddingDate, '2026-08-30');
  assert.equal(fields.weddingTime, '10:15');
});

test('parseWeddingCardText reads Venue: Bojjiah Convention A/c.', () => {
  const fields = parseWeddingCardText('Venue: Bojjiah Convention A/c.');
  assert.match(fields.venue, /Bojjiah Convention/i);
});

test('parseWeddingCardText reads DD-MM-YYYY and DD/MM/YYYY as Indian dates', () => {
  assert.equal(parseWeddingCardText('Wedding on 30-08-2026').weddingDate, '2026-08-30');
  assert.equal(parseWeddingCardText('Wedding on 30/08/2026').weddingDate, '2026-08-30');
  assert.equal(parseWeddingCardText('Wedding on 15.08.2026').weddingDate, '2026-08-15');
});

test('parseWeddingCardText keeps wedding date/time when a reception block follows', () => {
  const fields = parseWeddingCardText(`
    Sai Kumar Reddy with Pranathi Reddy
    On Sunday, 30th August, 2026 at 10:15 a.m.
    Venue: Bojjiah Convention A/c.
    Reception: On Wednesday, 02-09-2026 from 7:00 p.m. Onwards
  `);
  assert.equal(fields.weddingDate, '2026-08-30');
  assert.equal(fields.weddingTime, '10:15');
  assert.notEqual(fields.weddingDate, '2026-09-02');
  assert.notEqual(fields.weddingTime, '19:00');
});

test('parseWeddingCardText reads 7:00 p.m. and 7 PM onwards as times', () => {
  assert.equal(parseWeddingCardText('Muhurtham at 7:00 p.m.').weddingTime, '19:00');
  assert.equal(parseWeddingCardText('Starts 7 PM onwards').weddingTime, '19:00');
  assert.equal(parseWeddingCardText('10:15 AM').weddingTime, '10:15');
});

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
  assert.equal(fields.eventTitle, '');
});

test('parseWeddingCardText does not use Aarav/Priya as extraction defaults', () => {
  const fields = parseWeddingCardText('Wedding Invitation');
  assert.equal(fields.groomName, '');
  assert.equal(fields.brideName, '');
  assert.notEqual(fields.eventTitle, 'Aarav & Priya Wedding');
  assert.notEqual(fields.groomName, 'Aarav');
  assert.notEqual(fields.brideName, 'Priya');
});

test('buildWeddingEventTitle prefers an explicit title, then couple names', () => {
  assert.equal(buildWeddingEventTitle({ eventTitle: 'Royal Reception' }), 'Royal Reception');
  assert.equal(
    buildWeddingEventTitle({ groomName: 'Sai Kumar Reddy', brideName: 'Pranathi Reddy' }),
    'Sai Kumar Reddy & Pranathi Reddy Wedding'
  );
  assert.equal(buildWeddingEventTitle({}), 'Wedding Invitation');
});
