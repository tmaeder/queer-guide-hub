import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';

interface AdminRouteGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'moderator';
  fallbackPath?: string;
}

export function AdminRouteGuard({
  children,
  requiredRole = 'moderator',
  fallbackPath = '/',
}: AdminRouteGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isModerator, loading: rolesLoading } = useAdminRoles();
  const navigate = useNavigate();
  const { toast } = useToast();

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
    const hasPermission = requiredRole === 'admin' ? isAdmin : isAdmin || isModerator;

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
    isAdmin,
    isModerator,
    authLoading,
    rolesLoading,
    requiredRole,
    fallbackPath,
    navigate,
    toast,
  ]);

  // Show loading while checking permissions
  if (authLoading || rolesLoading) {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
      >
        <Box
          sx={{
            animation: 'spin 1s linear infinite',
            height: 128,
            width: 128,
            bgcolor: 'primary.main',
          }}
        />
      </Box>
    );
  }

  // Only render children if user has proper permissions
  const hasPermission = requiredRole === 'admin' ? isAdmin : isAdmin || isModerator;

  if (!user || !hasPermission) {
    return null;
  }

  return <>{children}</>;
}
