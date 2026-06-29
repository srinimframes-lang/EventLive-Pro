/**
 * Returns true for the Super Admin (any event) or the user who created the
 * event (its organizer). Credits are charged at creation time, so the owner
 * may fully manage their own live link (embed, gallery, chat, stream).
 */
export function canManageEvent(event, user) {
  if (!event || !user) return false;
  if (user.role === 'admin') return true;
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
