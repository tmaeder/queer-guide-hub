import { useQuery, useQueries } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/utils/queryOptimizations';

// Batched profile data loading for better performance
export function useOptimizedProfileData() {
  const { user } = useAuth();

  // Parallel data fetching for profile-related data
  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.profiles(user?.id),
        queryFn: async () => {
          if (!user?.id) return null;
          const { data, error } = await api
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();
          if (error) throw error;
          return data;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
      {
        queryKey: ['user_roles', user?.id],
        queryFn: async () => {
          if (!user?.id) return [];
          const { data, error } = await api
            .from('user_roles')
            .select('*')
            .eq('user_id', user.id);
          if (error) throw error;
          return data || [];
        },
        enabled: !!user?.id,
        staleTime: 10 * 60 * 1000, // 10 minutes - roles change rarely
      },
      {
        queryKey: queryKeys.notifications(user?.id),
        queryFn: async () => {
          if (!user?.id) return [];
          const { data, error } = await api
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (error) throw error;
          return data || [];
        },
        enabled: !!user?.id,
        staleTime: 1 * 60 * 1000, // 1 minute
      },
      {
        queryKey: queryKeys.conversations(user?.id),
        queryFn: async () => {
          if (!user?.id) return [];
          const { data, error } = await api
            .from('conversations')
            .select(`
              *,
              participants:conversation_participants(
                *,
                profile:profiles!conversation_participants_user_id_profiles_user_id_fkey(
                  display_name,
                  avatar_url,
                  user_id,
                  user_mode
                )
              )
            `)
            .order('updated_at', { ascending: false });
          if (error) throw error;
          return data || [];
        },
        enabled: !!user?.id,
        staleTime: 2 * 60 * 1000, // 2 minutes
      },
      {
        queryKey: ['group_notifications', user?.id],
        queryFn: async () => {
          if (!user?.id) return [];
          const { data, error } = await api
            .from('group_notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (error) throw error;
          return data || [];
        },
        enabled: !!user?.id,
        staleTime: 2 * 60 * 1000, // 2 minutes
      },
      {
        queryKey: ['user_posts_count', user?.id],
        queryFn: async () => {
          if (!user?.id) return 0;
          const { data, error } = await api
            .from('community_posts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id);
          if (error) throw error;
          return data?.length || 0;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000, // 5 minutes
      }
    ]
  });

  const [profileQuery, userRolesQuery, notificationsQuery, conversationsQuery, groupNotificationsQuery, userPostsCountQuery] = results;

  return {
    profile: profileQuery.data,
    userRoles: userRolesQuery.data,
    notifications: notificationsQuery.data,
    conversations: conversationsQuery.data,
    groupNotifications: groupNotificationsQuery.data,
    userPostsCount: userPostsCountQuery.data,
    
    // Combined loading state
    isLoading: results.some(query => query.isLoading),
    isError: results.some(query => query.isError),
    errors: results.filter(query => query.error).map(query => query.error),
    
    // Individual query states for granular control
    profileLoading: profileQuery.isLoading,
    profileError: profileQuery.error,
    
    // Refetch functions
    refetchProfile: profileQuery.refetch,
    refetchAll: () => results.forEach(query => query.refetch()),
  };
}