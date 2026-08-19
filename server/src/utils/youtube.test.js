import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractYouTubeId } from './youtube.js';

const ID = '882LagGGVM4';

test('extractYouTubeId reads watch, youtu.be, /live/, and bare IDs', () => {
  assert.equal(extractYouTubeId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(extractYouTubeId(`https://youtu.be/${ID}`), ID);
  assert.equal(extractYouTubeId(`https://www.youtube.com/live/${ID}`), ID);
  assert.equal(extractYouTubeId(`https://youtube.com/live/${ID}`), ID);
  assert.equal(extractYouTubeId(ID), ID);
});

test('extractYouTubeId handles share params, missing protocol, and mobile hosts', () => {
  assert.equal(extractYouTubeId(`https://www.youtube.com/live/${ID}?si=abcDEF12345`), ID);
  assert.equal(extractYouTubeId(`https://youtube.com/live/${ID}/`), ID);
  assert.equal(extractYouTubeId(`www.youtube.com/live/${ID}`), ID);
  assert.equal(extractYouTubeId(`https://m.youtube.com/watch?v=${ID}`), ID);
  assert.equal(extractYouTubeId(`https://www.youtube.com/embed/${ID}`), ID);
});
