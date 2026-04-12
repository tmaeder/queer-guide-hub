import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface GroupNotification {
  id: string;
  group_id: string;
  user_id: string;
  notification_type: 'mention' | 'new_post' | 'new_announcement' | 'new_poll' | 'post_liked' | 'comment_liked';
  related_post_id?: string;
  related_comment_id?: string;
  triggered_by_user_id: string;
  content?: string;
  read_at?: string;
  created_at: string;
  // Joined data
  community_groups?: {
    name: string;
  };
  triggered_by_profile?: {
    display_name: string;
    avatar_url: string;
  };
}

export const useGroupNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user's group notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['group-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Simple query without complex joins
      const { data, error } = await supabase
        .from('group_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get group names and user profiles separately
      const groupIds = [...new Set(data?.map(n => n.group_id) || [])];
      const userIds = [...new Set(data?.map(n => n.triggered_by_user_id) || [])];

      const { data: groups } = await supabase
        .from('community_groups')
        .select('id, name')
        .in('id', groupIds);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      return (data || []).map(notification => {
        const group = groups?.find(g => g.id === notification.group_id);
        const profile = profiles?.find(p => p.user_id === notification.triggered_by_user_id);
        
        return {
          ...notification,
          notification_type: notification.notification_type as string,
          community_groups: { name: group?.name || 'Unknown Group' },
          triggered_by_profile: {
            display_name: profile?.display_name || 'Unknown User',
            avatar_url: profile?.avatar_url || ''
          }
        };
      });
    },
    enabled: !!user?.id
  });

  // Get unread count
  const unreadCount = notifications.filter(n => !n.read_at).length;

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('group_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-notifications', user?.id] });
    }
  });

  // Mark all notifications as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('group_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user?.id)
        .is('read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-notifications', user?.id] });
    }
  });

  // Send email notification function
  const sendEmailNotification = async (data: {
    notification_type: 'mention' | 'new_post' | 'new_announcement' | 'new_poll';
    group_id: string;
    group_name: string;
    user_email: string;
    user_name: string;
    triggered_by_name: string;
    content: string;
    post_url?: string;
  }) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('send-group-notifications', {
        body: data
      });

      if (error) {
        throw new Error('Failed to send email notification');
      }

      return result;
    } catch (error) {
      console.error('Error sending email notification:', error);
      throw error;
    }
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    isMarkingAsRead: markAsReadMutation.isPending || markAllAsReadMutation.isPending,
    sendEmailNotification
  };
};