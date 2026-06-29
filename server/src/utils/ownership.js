/**
 * Returns true only for the Super Admin. In the commercial model, customers
 * never manage events / live pages, gallery, chat or streams.
 */
export function canManageEvent(_event, user) {
  return Boolean(user) && user.role === 'admin';
}

/**
 * Throws a 403 unless the user is the administrator.
 */
export function assertCanManageEvent(event, user, res) {
  if (!canManageEvent(event, user)) {
    res.status(403);
    throw new Error('Only the administrator can manage this event');
  }
}
