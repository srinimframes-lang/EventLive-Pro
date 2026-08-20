import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrideWedsGroomTitle,
  buildExactWedsTitle,
  buildWeddingEventTitle,
  buildWedsTitle,
  isProvisionableCouplePair,
  normalizeWeddingPersonName,
  parseWeddingCardText,
  preserveEnteredPersonName,
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
  assert.equal(fields.eventTitle, 'Sai Kumar Reddy Weds Pranathi Reddy');
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
  assert.equal(fields.eventTitle, 'Aarav Sharma Weds Priya Patel');
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

test('buildWedsTitle is deterministic from normalized Chi. names', () => {
  assert.equal(
    normalizeWeddingPersonName('Chi. Sai Kumar Reddy'),
    'Sai Kumar Reddy'
  );
  assert.equal(
    normalizeWeddingPersonName('Chi.La.Sow. Pranathi Reddy'),
    'Pranathi Reddy'
  );
  assert.equal(
    buildWedsTitle('Chi. Sai Kumar Reddy', 'Chi.La.Sow. Pranathi Reddy'),
    'Sai Kumar Reddy Weds Pranathi Reddy'
  );
});

test('buildBrideWedsGroomTitle is bride first for manual wedding entry', () => {
  assert.equal(buildBrideWedsGroomTitle('Mounika', 'Srinivas'), 'Mounika Weds Srinivas');
  assert.equal(buildWedsTitle('Srinivas', 'Mounika'), 'Srinivas Weds Mounika');
});

test('quick-create title keeps exact user spelling and groom-first order', () => {
  assert.equal(buildExactWedsTitle('Srinivas', 'Mounika'), 'Srinivas Weds Mounika');
  assert.equal(buildExactWedsTitle('  McDonald  ', "O'Neil"), "McDonald Weds O'Neil");
  assert.equal(buildExactWedsTitle('sriNivas', 'MOUNIKA'), 'sriNivas Weds MOUNIKA');
  assert.equal(preserveEnteredPersonName('  Chi. Srinivas  '), 'Chi. Srinivas');
  assert.notEqual(normalizeWeddingPersonName('sriNivas'), 'sriNivas');
  assert.notEqual(buildExactWedsTitle('Srinivas', 'Mounika'), buildBrideWedsGroomTitle('Mounika', 'Srinivas'));
});

test('OCR invitation headings never become the event title', () => {
  for (const garbage of [
    'Wedding Invitation',
    'Shubhamastu',
    'Invitation',
    'Srinath Shubhamastu Avighnamastu',
  ]) {
    assert.equal(buildWedsTitle(garbage, garbage), '');
    assert.equal(parseWeddingCardText(garbage).eventTitle, '');
    assert.notEqual(parseWeddingCardText(garbage).eventTitle, garbage);
  }
});

test('buildWeddingEventTitle ignores OCR eventTitle and uses Weds form', () => {
  assert.equal(
    buildWeddingEventTitle({
      eventTitle: 'Wedding Invitation',
      groomName: 'Sai Kumar Reddy',
      brideName: 'Pranathi Reddy',
    }),
    'Sai Kumar Reddy Weds Pranathi Reddy'
  );
  assert.equal(buildWeddingEventTitle({}), '');
});

test('stripHonorifics removes CHI.SOW. and CHI. prefixes', () => {
  assert.equal(stripHonorifics('CHI.SOW. NIRUPAMA'), 'NIRUPAMA');
  assert.equal(stripHonorifics('CHI. RAHUL RAJ'), 'RAHUL RAJ');
  assert.equal(stripHonorifics('Chi.Sow. A'), 'A');
  assert.equal(stripHonorifics('Chi. B'), 'B');
});

test('Chi.Sow bride WITH Chi groom prefers names beside WITH', () => {
  const fields = parseWeddingCardText(`
    CHI.SOW. A
    WITH
    CHI. B
  `);
  assert.equal(fields.brideName, 'A');
  assert.equal(fields.groomName, 'B');
  assert.equal(fields.eventTitle, 'B Weds A');
});

test('Chi groom WITH Chi.Sow bride prefers names beside WITH', () => {
  const fields = parseWeddingCardText(`
    CHI. A
    WITH
    CHI.SOW. B
  `);
  assert.equal(fields.groomName, 'A');
  assert.equal(fields.brideName, 'B');
  assert.equal(fields.eventTitle, 'A Weds B');
});

test('groom weds bride without honorifics keeps left as groom', () => {
  const fields = parseWeddingCardText('Aarav Sharma weds Priya Patel');
  assert.equal(fields.groomName, 'Aarav Sharma');
  assert.equal(fields.brideName, 'Priya Patel');
  assert.equal(fields.eventTitle, 'Aarav Sharma Weds Priya Patel');
});

test('Chi.Sow bride weds Chi groom uses honorifics for direction', () => {
  const fields = parseWeddingCardText('Chi.Sow. Priya Patel weds Chi. Aarav Sharma');
  assert.equal(fields.brideName, 'Priya Patel');
  assert.equal(fields.groomName, 'Aarav Sharma');
  assert.equal(fields.eventTitle, 'Aarav Sharma Weds Priya Patel');
});

test('groom & bride without honorifics keeps left as groom', () => {
  const fields = parseWeddingCardText('Aarav Sharma & Priya Patel');
  assert.equal(fields.groomName, 'Aarav Sharma');
  assert.equal(fields.brideName, 'Priya Patel');
});

test('Chi.Sow bride & Chi groom uses honorifics for direction', () => {
  const fields = parseWeddingCardText('Chi.Sow. Priya Patel & Chi. Aarav Sharma');
  assert.equal(fields.brideName, 'Priya Patel');
  assert.equal(fields.groomName, 'Aarav Sharma');
  assert.equal(fields.eventTitle, 'Aarav Sharma Weds Priya Patel');
});

test('WITH pair ignores surrounding parent and family names', () => {
  const fields = parseWeddingCardText(`
    CHI.SOW. NIRUPAMA
    Grand Daughter of Late Sri. Valluru Subba Rao
    Smt. Lakshmi Devi
    WITH
    CHI. RAHUL RAJ
    Elder son of Sri. Modupalli Venu Gopal Naidu
    Smt. Veena
  `);
  assert.equal(fields.brideName, 'Nirupama');
  assert.equal(fields.groomName, 'Rahul Raj');
  assert.equal(fields.eventTitle, 'Rahul Raj Weds Nirupama');
  const dumped = `${fields.brideName} ${fields.groomName} ${fields.eventTitle}`;
  for (const forbidden of [
    'Valluru Rukmangada Rao',
    'Valluru Subba Rao',
    'Lakshmi Devi',
    'Modupalli Venu Gopal Naidu',
    'Veena',
    'Kasturiba',
  ]) {
    assert.doesNotMatch(dumped, new RegExp(forbidden, 'i'));
  }
});

test('daughter of / son of / grand daughter of / elder son of are not couple names', () => {
  const fields = parseWeddingCardText(`
    Wedding Invitation
    CHI.SOW. Ananya
    daughter of Sri. Ramesh
    WITH
    CHI. Karthik
    son of Sri. Naresh
    grand daughter of Late Sri. Valluru Subba Rao
    elder son of Sri. Modupalli Venu Gopal Naidu
  `);
  assert.equal(fields.brideName, 'Ananya');
  assert.equal(fields.groomName, 'Karthik');
  assert.notEqual(fields.groomName, 'Ramesh');
  assert.notEqual(fields.brideName, 'Ramesh');
  assert.notEqual(fields.groomName, 'Naresh');
  assert.notEqual(fields.groomName, 'Valluru Subba Rao');
  assert.notEqual(fields.groomName, 'Modupalli Venu Gopal Naidu');
});

test('OCR WlTH is treated as WITH', () => {
  const fields = parseWeddingCardText(`
    CHI.SOW. Nirupama
    WlTH
    CHI. Rahul Raj
  `);
  assert.equal(fields.brideName, 'Nirupama');
  assert.equal(fields.groomName, 'Rahul Raj');
});

test('Sri/Smt parent lines are not bride or groom candidates', () => {
  const fields = parseWeddingCardText(`
    Smt. Lakshmi Devi
    Sri. Venkateswara Rao
    CHI.SOW. Nirupama
    WITH
    CHI. Rahul Raj
  `);
  assert.equal(fields.brideName, 'Nirupama');
  assert.equal(fields.groomName, 'Rahul Raj');
  assert.notEqual(fields.brideName, 'Lakshmi Devi');
  assert.notEqual(fields.groomName, 'Venkateswara Rao');
});

test('isProvisionableCouplePair rejects family and OCR garbage names', () => {
  assert.equal(isProvisionableCouplePair('Rahul Raj', 'Nirupama'), true);
  assert.equal(isProvisionableCouplePair('Late Sri. Valluru Subba Rao', 'Kasturiba'), false);
  assert.equal(isProvisionableCouplePair('Smt. Lakshmi Devi', 'Veena'), false);
  assert.equal(isProvisionableCouplePair('Wedding Invitation', 'Shubhamastu'), false);
  assert.equal(isProvisionableCouplePair('daughter of Ramesh', 'son of Naresh'), false);
});

test('Chi.La.Sow. Dr. bride WITH Chi. Dr. groom skips profession lines', () => {
  const fields = parseWeddingCardText(`
    Chi. La. Sow. Dr. Mounika
    Scientist-CSB
    with
    Chi. Dr. Yaswanth
    MBBS, M.S. General Surgery
  `);
  assert.equal(fields.brideName, 'Mounika');
  assert.equal(fields.groomName, 'Yaswanth');
  assert.equal(fields.eventTitle, 'Yaswanth Weds Mounika');
  const dumped = `${fields.brideName} ${fields.groomName} ${fields.eventTitle}`;
  for (const forbidden of ['Scientist', 'CSB', 'MBBS', 'General Surgery', 'M.S.']) {
    assert.doesNotMatch(dumped, new RegExp(forbidden.replace('.', '\\.'), 'i'));
  }
});

test('profession and qualification lines are never couple names', () => {
  assert.equal(isProvisionableCouplePair('Scientist-CSB', 'MBBS'), false);
  assert.equal(isProvisionableCouplePair('Yaswanth', 'M.S. General Surgery'), false);
  assert.equal(isProvisionableCouplePair('Yaswanth', 'Mounika'), true);
});
