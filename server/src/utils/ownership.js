import { isPlatformAdmin } from './tenantScope.js';

/**
 * Returns true for a platform admin (any event), a tenant Admin who owns the
 * event via createdBy, or the user who created the event (its organizer).
 * Credits are charged at creation time, so the owner may fully manage their
 * own live link (embed, gallery, chat, stream).
 */
export function canManageEvent(event, user) {
  if (!event || !user) return false;
  if (isPlatformAdmin(user)) return true;
  if (user.role === 'admin') {
    const owner = event.createdBy?._id || event.createdBy;
    if (owner && owner.toString() === user._id.toString()) return true;
    // Legacy events: admin who is also the organizer.
    if (event.organizer?.toString() === user._id.toString()) return true;
    return false;
  }
  return event.organizer?.toString() === user._id.toString();
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
