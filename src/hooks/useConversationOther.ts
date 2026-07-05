import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** The other participant of a two-person (match) conversation. */
export function useConversationOther(conversationId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['conversation-other', conversationId, user?.id],
    enabled: !!user && !!conversationId,
    queryFn: async (): Promise<string | null> => {
      if (!user || !conversationId) return null;
      const { data, error } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id)
        .limit(1);
      if (error) throw error;
      return data?.[0]?.user_id ?? null;
    },
  });
}
