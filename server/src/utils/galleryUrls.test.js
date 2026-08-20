import assert from 'node:assert/strict';
import test from 'node:test';
import {
  galleryApiImagePath,
  isPrivateR2ObjectUrl,
  resolveGalleryDisplayUrl,
} from './galleryUrls.js';

test('galleryApiImagePath is a durable relative API path', () => {
  assert.equal(
    galleryApiImagePath('6a85dc5538d1d85bab7ea791', '6a85dce638d1d85bab7ea83e'),
    '/api/events/6a85dc5538d1d85bab7ea791/gallery/6a85dce638d1d85bab7ea83e/image'
  );
  assert.equal(galleryApiImagePath('', 'abc'), '');
  assert.equal(galleryApiImagePath('abc', ''), '');
});

test('resolveGalleryDisplayUrl uses API path when R2 public base is unset', () => {
  const url = resolveGalleryDisplayUrl(
    {
      id: 'photo1',
      r2Key: 'galleries/evt/photo.jpg',
      url: 'https://eventliveprorecordings.abc.r2.cloudflarestorage.com/galleries/evt/photo.jpg?X-Amz-Signature=expired',
    },
    'evt1'
  );
  assert.equal(url, '/api/events/evt1/gallery/photo1/image');
  assert.equal(isPrivateR2ObjectUrl(url), false);
});

test('resolveGalleryDisplayUrl keeps legacy Cloudinary / local urls without r2Key', () => {
  assert.equal(
    resolveGalleryDisplayUrl({ url: 'https://res.cloudinary.com/demo/image.jpg' }, 'evt'),
    'https://res.cloudinary.com/demo/image.jpg'
  );
  assert.equal(
    resolveGalleryDisplayUrl({ url: '/uploads/cover.jpg' }, 'evt'),
    '/uploads/cover.jpg'
  );
});

test('isPrivateR2ObjectUrl detects S3 API hosts', () => {
  assert.equal(
    isPrivateR2ObjectUrl(
      'https://eventliveprorecordings.f18454e5110f29d0857e3d607fef6cef.r2.cloudflarestorage.com/galleries/x.jpg'
    ),
    true
  );
  assert.equal(isPrivateR2ObjectUrl('/api/events/a/gallery/b/image'), false);
  assert.equal(isPrivateR2ObjectUrl('/uploads/x.jpg'), false);
});
