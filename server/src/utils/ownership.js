/**
 * Returns true if the user owns the event (is its organizer) or is an admin.
 */
export function canManageEvent(event, user) {
  if (!event || !user) return false;
  if (user.role === 'admin') return true;
  return event.organizer.toString() === user._id.toString();
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
