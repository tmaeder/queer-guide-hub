/**
 * useGranularRoles — Content-type-specific permission system.
 * Extends the base admin/moderator roles with granular per-content-type permissions.
 *
 * Role hierarchy:
 *   admin     → full access to everything
 *   moderator → edit + review all content, no system settings
 *   editor    → edit assigned content types, submit for review
 *   viewer    → read-only access to cockpit
 *
 * Permissions are stored in user_role_permissions table (created if not exists).
 * Falls back to base roles if no granular permissions are configured.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

// ── Types ────────────────────────────────────────────────────────────

export type Permission = 'view' | 'edit' | 'create' | 'delete' | 'publish' | 'review' | 'import';

/** Baseline permissions every `editor` app_role holder gets across all content
 * types, even without explicit user_role_permissions rows. Higher-trust actions
 * (delete/publish/import) require granular grants. */
const EDITOR_BASE_PERMISSIONS: Permission[] = ['view', 'edit', 'create', 'review'];

export interface RolePermission {
  id: string;
  user_id: string;
  content_type: string;
  permissions: Permission[];
}

export interface GranularRolesReturn {
  /** Check if user can perform action on content type */
  can: (permission: Permission, contentType?: string) => boolean;
  /** Check if user can access a specific admin section */
  canAccess: (section: 'cockpit' | 'content' | 'import-review' | 'system') => boolean;
  /** All content types the user has any permission for */
  allowedContentTypes: string[];
  /** Loading state */
  loading: boolean;
  /** Current user's effective role */
  effectiveRole: 'admin' | 'moderator' | 'editor' | 'viewer' | 'none';
}

// ── Hook ────────────────────────────────────────────────────────────

export function useGranularRoles(): GranularRolesReturn {
  const { user } = useAuth();
  const { isAdmin, isModerator, isEditor, loading: rolesLoading } = useAdminRoles();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch granular permissions
  useEffect(() => {
    if (!user || rolesLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setLoading(rolesLoading);
      return;
    }

    async function fetchPermissions() {
      try {
        const { data } = await supabase
          .from('user_role_permissions' as 'venues')
          .select('*')
          .eq('user_id', user!.id);

        setPermissions((data ?? []) as unknown as RolePermission[]);
      } catch {
        // Table might not exist yet — fall back to base roles
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPermissions();
    // Depend on user.id, not the user object — Supabase emits a fresh user
    // reference on every TOKEN_REFRESHED (tab visibility / window focus).
    // Keying on the object ref re-runs this effect every render → setState →
    // re-render → "Maximum update depth" loop (React #185). Mirrors the same
    // fix in useAdminRoles.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on user?.id
  }, [user?.id, rolesLoading]);

  // Effective role
  const effectiveRole = useMemo((): GranularRolesReturn['effectiveRole'] => {
    if (isAdmin) return 'admin';
    if (isModerator) return 'moderator';
    if (isEditor || permissions.length > 0) return 'editor';
    if (user) return 'viewer';
    return 'none';
  }, [isAdmin, isModerator, isEditor, permissions, user]);

  // Permission check
  const can = useCallback(
    (permission: Permission, contentType?: string): boolean => {
      // Admins can do everything
      if (isAdmin) return true;

      // Moderators can do everything except system-level actions
      if (isModerator) {
        return !['delete'].includes(permission); // mods can't delete, only archive
      }

      // Editors get baseline content permissions on any type; granular rows
      // can grant the higher-trust actions (delete/publish/import).
      const editorAllows = isEditor && EDITOR_BASE_PERMISSIONS.includes(permission);

      if (!contentType) {
        // Without a content type, check if user has the permission for any content type
        return editorAllows || permissions.some((p) => p.permissions.includes(permission));
      }

      const ct = permissions.find((p) => p.content_type === contentType || p.content_type === '*');
      return editorAllows || (ct?.permissions.includes(permission) ?? false);
    },
    [isAdmin, isModerator, isEditor, permissions],
  );

  // Section access check
  const canAccess = useCallback(
    (section: 'cockpit' | 'content' | 'import-review' | 'system'): boolean => {
      if (isAdmin) return true;

      switch (section) {
        case 'cockpit':
          return isModerator || isEditor || permissions.length > 0;
        case 'content':
          return (
            isModerator || isEditor || permissions.some((p) => p.permissions.includes('view'))
          );
        case 'import-review':
          return (
            isModerator ||
            isEditor ||
            permissions.some(
              (p) => p.permissions.includes('review') || p.permissions.includes('import'),
            )
          );
        case 'system':
          return isAdmin;
        default:
          return false;
      }
    },
    [isAdmin, isModerator, isEditor, permissions],
  );

  // Allowed content types
  const allowedContentTypes = useMemo(() => {
    if (isAdmin || isModerator) return ['*']; // All content types
    // A bare editor (no granular rows) can touch all content types.
    if (isEditor && permissions.length === 0) return ['*'];
    const types = new Set<string>();
    for (const p of permissions) {
      types.add(p.content_type);
    }
    return Array.from(types);
  }, [isAdmin, isModerator, isEditor, permissions]);

  return {
    can,
    canAccess,
    allowedContentTypes,
    loading,
    effectiveRole,
  };
}
