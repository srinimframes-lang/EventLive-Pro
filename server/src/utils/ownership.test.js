import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminEventListFilter,
  assertCanManageEvent,
  canManageEvent,
  resolveEventCreateOwners,
} from './ownership.js';

const SUPER = { _id: 'super1', role: 'superadmin' };
const PLATFORM_ADMIN = { _id: 'legacyAdmin', role: 'admin' };
const ADMIN_A = { _id: 'adminA', role: 'admin', createdBy: 'super1' };
const ADMIN_B = { _id: 'adminB', role: 'admin', createdBy: 'super1' };
const CUSTOMER_A = { _id: 'custA', role: 'customer', createdBy: 'adminA' };
const CUSTOMER_B = { _id: 'custB', role: 'customer', createdBy: 'adminB' };
const ORGANIZER = { _id: 'org1', role: 'organizer' };
const SUBADMIN = { _id: 'sub1', role: 'subadmin', createdBy: 'adminA' };

const EVENT_A = { _id: 'evA', createdBy: 'adminA', organizer: 'adminA' };
const EVENT_B = { _id: 'evB', createdBy: 'adminB', organizer: 'adminB' };
const EVENT_A_POPULATED = {
  _id: 'evA2',
  createdBy: { _id: 'adminA' },
  organizer: { _id: 'adminA' },
};
const CUSTOMER_EVENT_A = { _id: 'evCA', createdBy: 'adminA', organizer: 'custA' };
const CUSTOMER_EVENT_B = { _id: 'evCB', createdBy: 'adminB', organizer: 'custB' };
const LEGACY_NO_CREATED_BY = { _id: 'evLegacy', organizer: 'custA' };

test('Super Admin can manage Admin A event', () => {
  assert.equal(canManageEvent(EVENT_A, SUPER), true);
});

test('Super Admin can manage Admin B event', () => {
  assert.equal(canManageEvent(EVENT_B, SUPER), true);
});

test('legacy platform admin can manage all events', () => {
  assert.equal(canManageEvent(EVENT_A, PLATFORM_ADMIN), true);
  assert.equal(canManageEvent(EVENT_B, PLATFORM_ADMIN), true);
  assert.equal(canManageEvent(LEGACY_NO_CREATED_BY, PLATFORM_ADMIN), true);
});

test('Admin A can manage Admin A event', () => {
  assert.equal(canManageEvent(EVENT_A, ADMIN_A), true);
  assert.equal(canManageEvent(EVENT_A_POPULATED, ADMIN_A), true);
});

test('Admin A CANNOT manage Admin B event', () => {
  assert.equal(canManageEvent(EVENT_B, ADMIN_A), false);
});

test('Admin B CANNOT manage Admin A event', () => {
  assert.equal(canManageEvent(EVENT_A, ADMIN_B), false);
});

test('Customer can manage own event', () => {
  assert.equal(canManageEvent(CUSTOMER_EVENT_A, CUSTOMER_A), true);
});

test('Customer cannot manage another customer event', () => {
  assert.equal(canManageEvent(CUSTOMER_EVENT_B, CUSTOMER_A), false);
  assert.equal(canManageEvent(CUSTOMER_EVENT_A, CUSTOMER_B), false);
});

test('Customer ownership behavior remains unchanged for organizer/subadmin', () => {
  const own = { _id: 'e1', organizer: 'org1', createdBy: 'adminA' };
  const other = { _id: 'e2', organizer: 'custA', createdBy: 'adminA' };
  assert.equal(canManageEvent(own, ORGANIZER), true);
  assert.equal(canManageEvent(other, ORGANIZER), false);
  assert.equal(canManageEvent({ _id: 'e3', organizer: 'sub1' }, SUBADMIN), true);
  assert.equal(canManageEvent(other, SUBADMIN), false);
});

test('Tenant Admin cannot manage event with missing createdBy', () => {
  assert.equal(canManageEvent(LEGACY_NO_CREATED_BY, ADMIN_A), false);
});

test('Super Admin can manage event with missing createdBy', () => {
  assert.equal(canManageEvent(LEGACY_NO_CREATED_BY, SUPER), true);
});

test('Customer ownership is unchanged when createdBy is missing', () => {
  assert.equal(canManageEvent(LEGACY_NO_CREATED_BY, CUSTOMER_A), true);
  assert.equal(canManageEvent(LEGACY_NO_CREATED_BY, CUSTOMER_B), false);
});

test('canManageEvent rejects empty event or user', () => {
  assert.equal(canManageEvent(null, SUPER), false);
  assert.equal(canManageEvent(EVENT_A, null), false);
});

test('assertCanManageEvent throws 403 for Admin A on Admin B event', () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; } };
  assert.throws(
    () => assertCanManageEvent(EVENT_B, ADMIN_A, res),
    (err) => err instanceof Error && /permission/i.test(err.message)
  );
  assert.equal(res.statusCode, 403);
});

test('assertCanManageEvent allows Super Admin on Admin B event', () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; } };
  assert.doesNotThrow(() => assertCanManageEvent(EVENT_B, SUPER, res));
  assert.equal(res.statusCode, 200);
});

test('Tenant Admin create ignores body.organizer', () => {
  const owners = resolveEventCreateOwners(ADMIN_A, { organizer: ADMIN_B._id });
  assert.equal(owners.organizer, ADMIN_A._id);
  assert.notEqual(owners.organizer, ADMIN_B._id);
});

test('Tenant Admin create ignores customer organizer from body', () => {
  const owners = resolveEventCreateOwners(ADMIN_A, { organizer: CUSTOMER_A._id });
  assert.equal(owners.organizer, ADMIN_A._id);
  assert.equal(owners.createdBy, ADMIN_A._id);
});

test('Tenant Admin create always sets organizer=self', () => {
  const owners = resolveEventCreateOwners(ADMIN_A, {});
  assert.equal(owners.organizer, ADMIN_A._id);
});

test('Tenant Admin create always sets createdBy=self', () => {
  const owners = resolveEventCreateOwners(ADMIN_A, { organizer: 'someone-else' });
  assert.equal(owners.createdBy, ADMIN_A._id);
});

test('Super Admin can still specify organizer', () => {
  const owners = resolveEventCreateOwners(SUPER, { organizer: ADMIN_A._id });
  assert.equal(owners.organizer, ADMIN_A._id);
  assert.equal(owners.createdBy, SUPER._id);
});

test('Super Admin create defaults organizer to self', () => {
  const owners = resolveEventCreateOwners(SUPER, {});
  assert.equal(owners.organizer, SUPER._id);
  assert.equal(owners.createdBy, SUPER._id);
});

test('legacy platform admin can still specify organizer', () => {
  const owners = resolveEventCreateOwners(PLATFORM_ADMIN, { organizer: ADMIN_B._id });
  assert.equal(owners.organizer, ADMIN_B._id);
  assert.equal(owners.createdBy, PLATFORM_ADMIN._id);
});

test('customer create preserves existing ownership behavior', () => {
  const owners = resolveEventCreateOwners(CUSTOMER_A, { organizer: CUSTOMER_B._id });
  assert.equal(owners.organizer, CUSTOMER_A._id);
  assert.equal(owners.createdBy, CUSTOMER_A.createdBy);
});

test('customer without createdBy stores null createdBy', () => {
  const lone = { _id: 'custLone', role: 'customer' };
  const owners = resolveEventCreateOwners(lone, { organizer: 'ignored' });
  assert.equal(owners.organizer, lone._id);
  assert.equal(owners.createdBy, null);
});

test('Tenant Admin list filter is { createdBy: adminId }', () => {
  assert.deepEqual(adminEventListFilter(ADMIN_A), { createdBy: ADMIN_A._id });
  assert.deepEqual(adminEventListFilter(ADMIN_B), { createdBy: ADMIN_B._id });
});

test('Super Admin list filter is {}', () => {
  assert.deepEqual(adminEventListFilter(SUPER), {});
});

test('legacy platform admin list filter is {}', () => {
  assert.deepEqual(adminEventListFilter(PLATFORM_ADMIN), {});
});

test('non-admin list filter is {} (public / customer catalogs unchanged)', () => {
  assert.deepEqual(adminEventListFilter(CUSTOMER_A), {});
  assert.deepEqual(adminEventListFilter(null), {});
});
