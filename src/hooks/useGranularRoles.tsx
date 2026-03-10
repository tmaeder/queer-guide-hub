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
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

// ── Types ────────────────────────────────────────────────────────────

export type Permission = 'view' | 'edit' | 'create' | 'delete' | 'publish' | 'review' | 'import';

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
  const { isAdmin, isModerator, loading: rolesLoading } = useAdminRoles();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch granular permissions
  useEffect(() => {
    if (!user || rolesLoading) {
      setLoading(rolesLoading);
      return;
    }

    async function fetchPermissions() {
      try {
        const { data } = await api
          .from('user_role_permissions' as any)
          .select('*')
          .eq('user_id', user!.id);

        setPermissions((data ?? []) as RolePermission[]);
      } catch {
        // Table might not exist yet — fall back to base roles
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPermissions();
  }, [user, rolesLoading]);

  // Effective role
  const effectiveRole = useMemo((): GranularRolesReturn['effectiveRole'] => {
    if (isAdmin) return 'admin';
    if (isModerator) return 'moderator';
    if (permissions.length > 0) return 'editor';
    if (user) return 'viewer';
    return 'none';
  }, [isAdmin, isModerator, permissions, user]);

  // Permission check
  const can = useCallback(
    (permission: Permission, contentType?: string): boolean => {
      // Admins can do everything
      if (isAdmin) return true;

      // Moderators can do everything except system-level actions
      if (isModerator) {
        return !['delete'].includes(permission); // mods can't delete, only archive
      }

      // Check granular permissions
      if (!contentType) {
        // Without a content type, check if user has the permission for any content type
        return permissions.some((p) => p.permissions.includes(permission));
      }

      const ct = permissions.find((p) => p.content_type === contentType || p.content_type === '*');
      return ct?.permissions.includes(permission) ?? false;
    },
    [isAdmin, isModerator, permissions],
  );

  // Section access check
  const canAccess = useCallback(
    (section: 'cockpit' | 'content' | 'import-review' | 'system'): boolean => {
      if (isAdmin) return true;

      switch (section) {
        case 'cockpit':
          return isAdmin || isModerator || permissions.length > 0;
        case 'content':
          return isAdmin || isModerator || permissions.some((p) => p.permissions.includes('view'));
        case 'import-review':
          return (
            isAdmin ||
            isModerator ||
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
    [isAdmin, isModerator, permissions],
  );

  // Allowed content types
  const allowedContentTypes = useMemo(() => {
    if (isAdmin || isModerator) return ['*']; // All content types
    const types = new Set<string>();
    for (const p of permissions) {
      types.add(p.content_type);
    }
    return Array.from(types);
  }, [isAdmin, isModerator, permissions]);

  return {
    can,
    canAccess,
    allowedContentTypes,
    loading,
    effectiveRole,
  };
}
