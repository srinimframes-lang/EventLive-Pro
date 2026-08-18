import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOgImage } from './seo.js';
import {
  SHARE_THUMB_BRAND,
  SHARE_THUMB_HEIGHT,
  SHARE_THUMB_SUBTITLE,
  SHARE_THUMB_WIDTH,
  thumbnailHeadline,
  thumbnailOverlayCopy,
  thumbnailShareUrl,
} from './shareThumbnail.js';

test('thumbnailHeadline uses Bride Weds Groom', () => {
  assert.equal(
    thumbnailHeadline({ brideName: 'Devi', groomName: 'Ramu', title: 'Wedding' }),
    'Devi Weds Ramu'
  );
});

test('thumbnailHeadline falls back to title', () => {
  assert.equal(thumbnailHeadline({ title: 'Royal Reception' }), 'Royal Reception');
});

test('overlay copy matches YouTube thumbnail spec', () => {
  const copy = thumbnailOverlayCopy(
    {
      brideName: 'Devi',
      groomName: 'Ramu',
      title: 'Wedding',
      shortCode: 'DV24X9',
      slug: 'wedding',
    },
    { seo: { siteUrl: 'https://eventlivepro.com' } }
  );
  assert.equal(copy.headline, 'Devi Weds Ramu');
  assert.equal(copy.subtitle, SHARE_THUMB_SUBTITLE);
  assert.equal(copy.subtitle, 'Wedding Live Streaming');
  assert.equal(copy.brand, SHARE_THUMB_BRAND);
  assert.equal(copy.url, 'eventlivepro.com/DV24X9');
  assert.equal(copy.width, SHARE_THUMB_WIDTH);
  assert.equal(copy.height, SHARE_THUMB_HEIGHT);
  assert.equal(copy.width / copy.height, 16 / 9);
});

test('thumbnailShareUrl prefers couple slug', () => {
  assert.equal(
    thumbnailShareUrl(
      { shortCode: 'AM5DJS', slug: 'devi-weds-ramu' },
      { seo: { siteUrl: 'https://eventlivepro.com' } }
    ),
    'eventlivepro.com/devi-weds-ramu'
  );
});

test('resolveOgImage prefers generated shareThumbnail then coverImage', () => {
  const settings = { seo: {} };
  assert.equal(
    resolveOgImage(
      { shareThumbnail: 'https://cdn.example/thumb.jpg', coverImage: 'https://cdn.example/cover.jpg' },
      settings,
      'https://api.example'
    ),
    'https://cdn.example/thumb.jpg'
  );
  assert.equal(
    resolveOgImage({ coverImage: 'https://cdn.example/cover.jpg' }, settings, 'https://api.example'),
    'https://cdn.example/cover.jpg'
  );
});
