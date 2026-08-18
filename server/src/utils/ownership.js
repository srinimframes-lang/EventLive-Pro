/**
 * Event manage / create / list ownership.
 *
 * Super Admin and legacy platform admin (role=admin, createdBy empty) may
 * manage every event. Tenant admins (role=admin, createdBy set) may manage
 * only events they created. Customers / organizers keep organizer-id checks.
 *
 * No Tenant model and no tenantId — reuse User.createdBy / Event.createdBy /
 * Event.organizer.
 */
import { createdByFilter, isAdminPanelUser, isPlatformAdmin, isTenantAdmin } from './tenantScope.js';

function idOf(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value._id != null) return String(value._id);
  return String(value);
}

/**
 * Returns true when the user may mutate this event (edit, stream, gallery,
 * recording). Public playback does not use this helper.
 */
export function canManageEvent(event, user) {
  if (!event || !user) return false;
  if (isPlatformAdmin(user)) return true;
  if (isTenantAdmin(user)) {
    const owner = idOf(event.createdBy);
    return Boolean(owner && owner === idOf(user._id));
  }
  const organizerId = idOf(event.organizer);
  return Boolean(organizerId && organizerId === idOf(user._id));
}

/**
 * Throws a 403 unless the user can manage the event.
 */
export function assertCanManageEvent(event, user, res) {
  if (!canManageEvent(event, user)) {
    res.status(403);
    throw new Error('You do not have permission to manage this event');
  }
}

/**
 * Owner fields to persist on Event.create. Tenant admins never inherit
 * organizer from the client body.
 */
export function resolveEventCreateOwners(user, body = {}) {
  if (isPlatformAdmin(user)) {
    return {
      createdBy: user._id,
      organizer: body.organizer || user._id,
    };
  }
  if (isTenantAdmin(user)) {
    return {
      createdBy: user._id,
      organizer: user._id,
    };
  }
  return {
    organizer: user._id,
    createdBy: user.createdBy || null,
  };
}

/**
 * Extra Mongo filter for GET /api/events when the caller is an admin-panel
 * user. Always applied for tenant admins — do not trust ?adminScope=true.
 * Super / platform admin → no extra filter (see all events).
 * Non-admin callers → {}.
 */
export function adminEventListFilter(user) {
  if (!user || !isAdminPanelUser(user)) return {};
  return createdByFilter(user);
}
