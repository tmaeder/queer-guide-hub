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
