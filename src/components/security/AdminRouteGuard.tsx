import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useToast } from '@/hooks/use-toast';
import { roleAtLeast, type AdminRole, type EffectiveRole } from '@/config/adminRoles';

interface AdminRouteGuardProps {
  children: React.ReactNode;
  requiredRole?: AdminRole;
  fallbackPath?: string;
}

export function AdminRouteGuard({
  children,
  // Editors and up may enter the admin console; per-route admin/moderator
  // gating is enforced inside AdminShell via each nav item's minRole.
  requiredRole = 'editor',
  fallbackPath = '/',
}: AdminRouteGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isModerator, isEditor, loading: rolesLoading } = useAdminRoles();
  const navigate = useNavigate();
  const { toast } = useToast();

  const effectiveRole: EffectiveRole = isAdmin
    ? 'admin'
    : isModerator
      ? 'moderator'
      : isEditor
        ? 'editor'
        : user
          ? 'viewer'
          : 'none';

  // Once we've validated access we keep rendering children even if a
  // background refresh re-flips loading flags (e.g. Supabase fires
  // TOKEN_REFRESHED on tab visibility / window focus). Unmounting on
  // every refresh wipes transient state like an open CMS editor.
  const hasValidatedRef = useRef(false);

  useEffect(() => {
    // Wait for both auth and roles to load
    if (authLoading || rolesLoading) return;

    // Check authentication first
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to access this area.',
        variant: 'destructive',
      });
      navigate('/auth');
      return;
    }

    // Check role permissions
    const hasPermission = roleAtLeast(effectiveRole, requiredRole);

    if (!hasPermission) {
      toast({
        title: 'Access Denied',
        description: `You need ${requiredRole} privileges to access this area.`,
        variant: 'destructive',
      });
      navigate(fallbackPath);
      return;
    }
  }, [
    user,
    effectiveRole,
    authLoading,
    rolesLoading,
    requiredRole,
    fallbackPath,
    navigate,
    toast,
  ]);

  const hasPermission = roleAtLeast(effectiveRole, requiredRole);
  const stillResolving = authLoading || rolesLoading;
  const accessGranted = !!user && hasPermission;

   
  if (accessGranted && !stillResolving) {
    // eslint-disable-next-line react-hooks/refs -- see above.
    hasValidatedRef.current = true;
  }

  // Show loading only on the initial validation pass. After that, keep
  // children mounted across background refreshes so transient UI state
  // (open dialogs, unsaved form input) survives tab/window focus changes.
  // eslint-disable-next-line react-hooks/refs -- see above.
  if (stillResolving && !hasValidatedRef.current) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="animate-spin"
          style={{ height: 128, width: 128, backgroundColor: 'hsl(var(--primary))' }}
        />
      </div>
    );
  }

  if (!stillResolving && !accessGranted) {
    return null;
  }

  return <>{children}</>;
}
