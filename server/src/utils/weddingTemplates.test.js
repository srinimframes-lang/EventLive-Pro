import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEDDING_CARD_TEMPLATE,
  EVENT_TYPE_TEMPLATES,
  combineWeddingCardStartTime,
  isManualWeddingEntry,
  isWeddingPageTemplate,
  normalizeManualWeddingCategory,
  resolveWatchWeddingTemplate,
  weddingCardPageTemplate,
  weddingPageTemplateEnum,
} from './weddingTemplates.js';

test('wedding page template enum includes default, classic, wedding, and type templates', () => {
  const ids = weddingPageTemplateEnum();
  assert.deepEqual(ids, [
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
  ]);
});

test('new wedding-card events default to wedding-template-1', () => {
  assert.equal(weddingCardPageTemplate(''), DEFAULT_WEDDING_CARD_TEMPLATE);
  assert.equal(weddingCardPageTemplate('default'), 'wedding-template-1');
  assert.equal(weddingCardPageTemplate(undefined), 'wedding-template-1');
});

test('existing wedding templates are not overwritten; classic is not used for card events', () => {
  assert.equal(weddingCardPageTemplate('classic-wedding'), 'wedding-template-1');
  assert.equal(weddingCardPageTemplate('wedding-template-2'), 'wedding-template-2');
  assert.equal(weddingCardPageTemplate('wedding-template-3'), 'wedding-template-3');
});

test('isWeddingPageTemplate only matches wedding-template ids', () => {
  assert.equal(isWeddingPageTemplate('wedding-template-1'), true);
  assert.equal(isWeddingPageTemplate('classic-wedding'), false);
  assert.equal(isWeddingPageTemplate('default'), false);
});

test('themed wedding-card events still resolve to the text-only wedding template', () => {
  assert.equal(
    resolveWatchWeddingTemplate(
      { source: 'wedding-card', pageTemplate: 'default', theme: 'abc' },
      { hasTheme: true }
    ),
    'wedding-template-1'
  );
  assert.equal(
    resolveWatchWeddingTemplate(
      { source: 'wedding-card', pageTemplate: 'classic-wedding' },
      { hasTheme: true }
    ),
    'wedding-template-1'
  );
});

test('premium wedding-card template id is kept', () => {
  assert.equal(
    resolveWatchWeddingTemplate(
      { source: 'wedding-card', pageTemplate: 'wedding-template-2' },
      { hasTheme: true }
    ),
    'wedding-template-2'
  );
});

test('manual live-link events with a catalog theme are unchanged', () => {
  assert.equal(
    resolveWatchWeddingTemplate(
      { source: 'manual', pageTemplate: 'default', theme: 'abc' },
      { hasTheme: true }
    ),
    ''
  );
  assert.equal(
    resolveWatchWeddingTemplate({ pageTemplate: 'classic-wedding' }, { hasTheme: false }),
    ''
  );
});

test('combineWeddingCardStartTime treats entered clock time as IST, not UTC', () => {
  const start = combineWeddingCardStartTime('2026-09-02', '10:15');
  assert.ok(start);
  assert.equal(start.toISOString(), '2026-09-02T04:45:00.000Z');
  const istTime = start.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  assert.equal(istTime, '10:15 AM');
  assert.equal(combineWeddingCardStartTime('bad', '10:15'), null);
});

test('manual wedding date/time 12 December 2026 10:30 AM is stored as IST', () => {
  const start = combineWeddingCardStartTime('2026-12-12', '10:30');
  assert.ok(start);
  assert.equal(start.toISOString(), '2026-12-12T05:00:00.000Z');
  const dateLabel = start.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeLabel = start.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  assert.equal(dateLabel, '12 December 2026');
  assert.equal(timeLabel, '10:30 AM');
  assert.equal(combineWeddingCardStartTime('2026-12-12', '10:30:00').toISOString(), start.toISOString());
});

test('manual wedding-card events still resolve to the text-only wedding template', () => {
  assert.equal(
    resolveWatchWeddingTemplate(
      { source: 'wedding-card', weddingEntryMode: 'manual', pageTemplate: 'default' },
      { hasTheme: true }
    ),
    'wedding-template-1'
  );
  assert.equal(isManualWeddingEntry({ source: 'wedding-card', weddingEntryMode: 'manual' }), true);
  assert.equal(isManualWeddingEntry({ source: 'wedding-card' }), false);
  assert.equal(normalizeManualWeddingCategory('Wedding'), 'wedding');
  assert.equal(normalizeManualWeddingCategory('sangeet'), 'sangeet');
  assert.equal(normalizeManualWeddingCategory('haldi'), '');
});

test('manual event type selects the matching premium public template', () => {
  const base = { source: 'wedding-card', weddingEntryMode: 'manual', pageTemplate: 'default' };
  assert.equal(
    resolveWatchWeddingTemplate({ ...base, category: 'wedding' }),
    EVENT_TYPE_TEMPLATES.wedding
  );
  assert.equal(
    resolveWatchWeddingTemplate({ ...base, category: 'reception' }),
    EVENT_TYPE_TEMPLATES.reception
  );
  assert.equal(
    resolveWatchWeddingTemplate({ ...base, category: 'engagement' }),
    EVENT_TYPE_TEMPLATES.engagement
  );
  assert.equal(
    resolveWatchWeddingTemplate({ ...base, category: 'sangeet' }),
    EVENT_TYPE_TEMPLATES.sangeet
  );
  assert.equal(
    resolveWatchWeddingTemplate({ ...base, category: 'birthday' }),
    EVENT_TYPE_TEMPLATES.birthday
  );
  assert.equal(
    resolveWatchWeddingTemplate({ ...base, category: 'other' }),
    EVENT_TYPE_TEMPLATES.other
  );
});

test('existing event without a type keeps the current default design', () => {
  assert.equal(resolveWatchWeddingTemplate({}), '');
  assert.equal(resolveWatchWeddingTemplate({ pageTemplate: 'default' }), '');
  assert.equal(resolveWatchWeddingTemplate({ category: 'other', pageTemplate: 'default' }), '');
  assert.equal(
    resolveWatchWeddingTemplate({ source: 'manual', category: 'reception', pageTemplate: 'default' }, { hasTheme: true }),
    ''
  );
});

test('uploaded wedding-card events stay on the wedding template even if category differs', () => {
  assert.equal(
    resolveWatchWeddingTemplate({
      source: 'wedding-card',
      category: 'reception',
      pageTemplate: 'default',
    }),
    DEFAULT_WEDDING_CARD_TEMPLATE
  );
});

test('quick-create wedding-card events stay groom-first on the wedding template', () => {
  assert.equal(isManualWeddingEntry({ source: 'wedding-card', weddingEntryMode: 'quick' }), false);
  assert.equal(
    resolveWatchWeddingTemplate({
      source: 'wedding-card',
      weddingEntryMode: 'quick',
      pageTemplate: 'default',
    }),
    DEFAULT_WEDDING_CARD_TEMPLATE
  );
  const start = combineWeddingCardStartTime('2026-12-12', '10:30');
  assert.equal(start.toISOString(), '2026-12-12T05:00:00.000Z');
});
