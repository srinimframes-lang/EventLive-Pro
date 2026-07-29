/**
 * Returns true for Super Admin / Admin (full event manage for livestream &
 * recordings), or the user who created the event (its organizer).
 *
 * Tenant isolation for listing/dashboard data lives in admin query filters
 * (`createdByFilter` + `adminScope`) — not on public playback or stream routes.
 */
export function canManageEvent(event, user) {
  if (!event || !user) return false;
  // Restore pre-multitenant behavior: any admin panel role may manage streams
  // and replay recordings. Dashboard tenant scoping is separate.
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  const organizerId = event.organizer?._id || event.organizer;
  return Boolean(organizerId && String(organizerId) === String(user._id));
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
