import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistrableDomain } from './dnsVerify.js';
import { txtLookupName } from './dnsRecords.js';

test('getRegistrableDomain never collapses to TLD-only zones', () => {
  assert.equal(getRegistrableDomain('livestreamonline.co.in'), 'livestreamonline.co.in');
  assert.equal(getRegistrableDomain('live.livestreamonline.co.in'), 'livestreamonline.co.in');
  assert.equal(getRegistrableDomain('live.customer.com'), 'customer.com');
  assert.equal(getRegistrableDomain('customer.com'), 'customer.com');
  assert.equal(getRegistrableDomain('shop.example.co.uk'), 'example.co.uk');
});

test('txtLookupName builds _eventlive-verify.<domain>', () => {
  assert.equal(
    txtLookupName('livestreamonline.co.in'),
    '_eventlive-verify.livestreamonline.co.in'
  );
  assert.equal(txtLookupName('live.customer.com'), '_eventlive-verify.live.customer.com');
});

test('txtLookupName sanitizes duplicated / prefixed hostnames', async () => {
  const { sanitizeHostname } = await import('./dnsRecords.js');
  assert.equal(sanitizeHostname('https://livestreamonline.co.in/'), 'livestreamonline.co.in');
  assert.equal(
    sanitizeHostname('_eventlive-verify.livestreamonline.co.in'),
    'livestreamonline.co.in'
  );
  assert.equal(
    txtLookupName('_eventlive-verify.livestreamonline.co.in'),
    '_eventlive-verify.livestreamonline.co.in'
  );
  assert.equal(
    txtLookupName('livestreamonline.co.in.livestreamonline.co.in'),
    '_eventlive-verify.livestreamonline.co.in'
  );
});
