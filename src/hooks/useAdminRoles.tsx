import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/integrations/supabase/types';

type UserRole = Database['public']['Tables']['user_roles']['Row'];
type AppRole = Database['public']['Enums']['app_role'];

export function useAdminRoles() {
  const { user, loading: authLoading } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    // Don't resolve roles until auth has finished loading
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (user) {
      fetchUserRoles();
    } else {
      setUserRoles([]);
      setIsAdmin(false);
      setIsModerator(false);
      setLoading(false);
    }
    // Depend on user.id, not the user object — Supabase emits a fresh user
    // reference on every TOKEN_REFRESHED (fires on tab visibility / window
    // focus). Re-running on identity churn forces loading=true, which causes
    // AdminRouteGuard to unmount its children and wipe transient editor state
    // (e.g. an open CMS edit dialog). See feedback 10890b33.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUserRoles defined below
  }, [user?.id, authLoading]);

  const fetchUserRoles = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      setUserRoles(data || []);

      const roles = (data || []).map(r => r.role);
      setIsAdmin(roles.includes('admin'));
      setIsModerator(roles.includes('moderator'));
    } catch (error) {
      console.error('Error fetching user roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasRole = (role: AppRole): boolean => {
    return userRoles.some(r => r.role === role);
  };

  const canManageContent = (): boolean => {
    return isAdmin || isModerator;
  };

  return {
    userRoles,
    loading,
    isAdmin,
    isModerator,
    hasRole,
    canManageContent,
    refetch: fetchUserRoles
  };
}