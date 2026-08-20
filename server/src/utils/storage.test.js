import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadsR2KeyFromPath, uploadsR2KeyFromUrl } from './storage.js';

test('uploadsR2KeyFromUrl maps public /uploads paths to R2 keys', () => {
  assert.equal(
    uploadsR2KeyFromUrl('/uploads/1787157596278-2ccb557e6efa3fd9.jpg'),
    'uploads/1787157596278-2ccb557e6efa3fd9.jpg'
  );
  assert.equal(uploadsR2KeyFromUrl('/uploads/foo.png?cache=1'), 'uploads/foo.png');
});

test('uploadsR2KeyFromUrl rejects unsafe or non-upload values', () => {
  assert.equal(uploadsR2KeyFromUrl(''), '');
  assert.equal(uploadsR2KeyFromUrl('blob:http://localhost/uuid'), '');
  assert.equal(uploadsR2KeyFromUrl('http://localhost:5000/uploads/x.jpg'), '');
  assert.equal(uploadsR2KeyFromUrl('/uploads/../secret.jpg'), '');
  assert.equal(uploadsR2KeyFromUrl('https://res.cloudinary.com/demo/x.jpg'), '');
});

test('uploadsR2KeyFromPath uses the mounted /uploads request path', () => {
  assert.equal(
    uploadsR2KeyFromPath('/1787157596278-2ccb557e6efa3fd9.jpg'),
    'uploads/1787157596278-2ccb557e6efa3fd9.jpg'
  );
  assert.equal(uploadsR2KeyFromPath('/../etc/passwd'), '');
});
