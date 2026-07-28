/**
 * Multi-tenant admin helpers.
 *
 * - superadmin: explicit platform owner
 * - admin without createdBy: legacy platform admin (backward compatible)
 * - admin with createdBy: tenant admin — only records they own
 */

export function isSuperAdmin(user) {
  return user?.role === 'superadmin';
}

/**
 * Full platform access (sees all tenants).
 * Keeps existing production `admin` accounts working without a forced role migration.
 */
export function isPlatformAdmin(user) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin') {
    const owner = user.createdBy?._id || user.createdBy;
    return !owner;
  }
  return false;
}

/** Tenant admin: scoped to createdBy === self. */
export function isTenantAdmin(user) {
  if (!user || user.role !== 'admin') return false;
  const owner = user.createdBy?._id || user.createdBy;
  return Boolean(owner);
}

/** Either platform Super Admin / legacy admin or a tenant Admin (admin panel access). */
export function isAdminPanelUser(user) {
  return user?.role === 'superadmin' || user?.role === 'admin';
}

/**
 * Mongo filter restricting docs to the current tenant admin's ownership.
 * Platform admin → no extra filter (sees everything).
 */
export function createdByFilter(user, field = 'createdBy') {
  if (!user) return { _id: null }; // deny-all if unauthenticated
  if (isPlatformAdmin(user)) return {};
  return { [field]: user._id };
}

/**
 * True when the document belongs to this user (or user is a platform admin).
 * Missing createdBy is only visible to platform admins (legacy / unassigned).
 */
export function ownsRecord(doc, user) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  if (!doc) return false;
  const owner = doc.createdBy?._id || doc.createdBy;
  if (!owner) return false;
  return owner.toString() === user._id.toString();
}

/**
 * Throws 403 unless the user owns the record (or is a platform admin).
 */
export function assertOwnsRecord(doc, user, res, label = 'record') {
  if (ownsRecord(doc, user)) return;
  res.status(403);
  throw new Error(`You do not have permission to access this ${label}`);
}

/** Roles allowed on /admin routes (panel login). */
export const ADMIN_PANEL_ROLES = ['admin', 'superadmin'];
