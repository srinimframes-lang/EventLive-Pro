import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApexHostname,
  txtHostLabel,
  cnameHostLabel,
  toRelativeHostLabel,
  buildDnsInstructionRecords,
  txtLookupName,
  recommendedLiveHostname,
  normalizeCustomDomainHost,
  CNAME_TARGET,
  VERCEL_A_IP,
} from './dnsRecords.js';

test('isApexHostname handles standard and multi-part TLDs', () => {
  assert.equal(isApexHostname('livestreamonline.co.in'), true);
  assert.equal(isApexHostname('example.com'), true);
  assert.equal(isApexHostname('live.customer.com'), false);
  assert.equal(isApexHostname('live.livestreamonline.co.in'), false);
  assert.equal(isApexHostname('shop.example.co.uk'), false);
  assert.equal(isApexHostname('example.co.uk'), true);
  assert.equal(isApexHostname('maaevents9.in'), true);
  assert.equal(isApexHostname('live.maaevents9.in'), false);
});

test('cnameHostLabel uses @ for apex and left-most label for subdomains', () => {
  assert.equal(cnameHostLabel('livestreamonline.co.in'), '@');
  assert.equal(cnameHostLabel('example.com'), '@');
  assert.equal(cnameHostLabel('live.customer.com'), 'live');
  assert.equal(cnameHostLabel('live.livestreamonline.co.in'), 'live');
});

test('toRelativeHostLabel never returns the full domain', () => {
  assert.equal(
    toRelativeHostLabel('_eventlive-verify.livestreamonline.co.in', 'livestreamonline.co.in'),
    '_eventlive-verify'
  );
  assert.equal(toRelativeHostLabel('livestreamonline.co.in', 'livestreamonline.co.in'), '@');
  assert.equal(toRelativeHostLabel('live.customer.com', 'live.customer.com'), 'live');
  assert.equal(toRelativeHostLabel('_eventlive-verify', 'example.com'), '_eventlive-verify');
  assert.equal(toRelativeHostLabel('@', 'example.com'), '@');
});

test('txtHostLabel is relative verify label (apex vs live subdomain)', () => {
  assert.equal(txtHostLabel(), '_eventlive-verify');
  assert.equal(txtHostLabel('example.com'), '_eventlive-verify');
  assert.equal(txtHostLabel('live.customer.com'), '_eventlive-verify.live');
  assert.equal(txtHostLabel('live.maaevents9.in'), '_eventlive-verify.live');
});

test('recommendedLiveHostname / normalizeCustomDomainHost prefer live subdomain', () => {
  assert.equal(recommendedLiveHostname('maaevents9.in'), 'live.maaevents9.in');
  assert.equal(recommendedLiveHostname('live.maaevents9.in'), 'live.maaevents9.in');
  const rewritten = normalizeCustomDomainHost('maaevents9.in');
  assert.equal(rewritten.host, 'live.maaevents9.in');
  assert.equal(rewritten.rewrittenFromApex, true);
  assert.equal(rewritten.apex, 'maaevents9.in');
  const keep = normalizeCustomDomainHost('live.maaevents9.in');
  assert.equal(keep.host, 'live.maaevents9.in');
  assert.equal(keep.rewrittenFromApex, false);
});

test('buildDnsInstructionRecords uses A for apex and CNAME for subdomains', () => {
  const token = 'abc123token';
  const apex = buildDnsInstructionRecords('livestreamonline.co.in', token);
  assert.deepEqual(
    apex.map((r) => ({ type: r.type, host: r.host, value: r.value })),
    [
      { type: 'TXT', host: '_eventlive-verify', value: token },
      { type: 'A', host: '@', value: VERCEL_A_IP },
    ]
  );

  const sub = buildDnsInstructionRecords('live.customer.com', token);
  assert.deepEqual(
    sub.map((r) => ({ type: r.type, host: r.host, value: r.value })),
    [
      { type: 'TXT', host: '_eventlive-verify.live', value: token },
      { type: 'CNAME', host: 'live', value: CNAME_TARGET },
    ]
  );

  const maa = buildDnsInstructionRecords('live.maaevents9.in', token);
  assert.deepEqual(
    maa.map((r) => ({ type: r.type, host: r.host, value: r.value })),
    [
      { type: 'TXT', host: '_eventlive-verify.live', value: token },
      { type: 'CNAME', host: 'live', value: CNAME_TARGET },
    ]
  );

  assert.equal(txtLookupName('livestreamonline.co.in'), '_eventlive-verify.livestreamonline.co.in');
  assert.equal(txtLookupName('live.maaevents9.in'), '_eventlive-verify.live.maaevents9.in');
});
