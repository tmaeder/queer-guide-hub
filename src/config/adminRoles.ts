/**
 * Admin role ranking — one ordinal ladder so role checks are `>=` comparisons
 * instead of scattered boolean unions. `adminOnly` in adminNavigation is just
 * the top rung (`minRole: 'admin'`).
 *
 *   admin (3) > moderator (2) > editor (1) > viewer (0) > none (-1)
 */
export type AdminRole = 'admin' | 'moderator' | 'editor' | 'viewer';
export type EffectiveRole = AdminRole | 'none';

export const ROLE_RANK: Record<EffectiveRole, number> = {
  admin: 3,
  moderator: 2,
  editor: 1,
  viewer: 0,
  none: -1,
};

/** True when `effective` is at least as privileged as `min`. */
export function roleAtLeast(effective: EffectiveRole, min: AdminRole): boolean {
  return ROLE_RANK[effective] >= ROLE_RANK[min];
}

export interface RoleFlags {
  isAdmin: boolean;
  isModerator: boolean;
  isEditor: boolean;
  /** Any signed-in user. Distinguishes `viewer` from `none`. */
  isAuthenticated: boolean;
  /**
   * Whether the user holds granular per-entity permissions without a role.
   *
   * `useGranularRoles` treats this as `editor`; `AdminRouteGuard` reads roles
   * only and so passes `false`. **Consequence, stated rather than implied: a
   * user whose access is purely granular is admitted by the shell and the
   * sidebar but refused at the console door.** Wiring the guard to permissions
   * means giving it a permissions fetch on every admin route mount, which that
   * file's own comments warn about (it is carefully written to avoid a
   * TOKEN_REFRESHED re-render loop) — so the divergence is left, but it is now
   * ONE argument at ONE call site instead of two hand-copied ladders that can
   * drift apart without anyone noticing.
   */
  hasGranularPermissions?: boolean;
}

/**
 * The one effective-role ladder.
 *
 * This existed twice — inline in `useGranularRoles` and again inline in
 * `AdminRouteGuard` — as identical nested ternaries differing only in the
 * permissions fallback. Two copies of an authorization decision is a defect
 * waiting to happen, and the difference between them was invisible at both
 * sites because neither mentioned the other.
 */
export function computeEffectiveRole(flags: RoleFlags): EffectiveRole {
  if (flags.isAdmin) return 'admin';
  if (flags.isModerator) return 'moderator';
  if (flags.isEditor || flags.hasGranularPermissions) return 'editor';
  if (flags.isAuthenticated) return 'viewer';
  return 'none';
}
