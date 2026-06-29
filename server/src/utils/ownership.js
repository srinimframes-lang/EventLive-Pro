/**
 * Returns true for the Super Admin (any event) or a reseller (sub admin) who
 * created the event. Customers never manage events / gallery / chat / streams.
 */
export function canManageEvent(event, user) {
  if (!event || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'subadmin') {
    return event.organizer?.toString() === user._id.toString();
  }
  return false;
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
