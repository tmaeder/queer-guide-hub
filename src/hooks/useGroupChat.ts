import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface GroupChatMessage {
  id: number;
  group_id: string;
  sender_id: string;
  content: string;
  reply_to_id: number | null;
  attachments: unknown[];
  edited_at: string | null;
  created_at: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface UseGroupChatResult {
  messages: GroupChatMessage[];
  loading: boolean;
  send: (content: string) => Promise<void>;
  sending: boolean;
}

/**
 * Live message list for a group's chat room. RLS limits visibility to members
 * (enforced server-side); the realtime channel only delivers rows the user can
 * already read, so member changes are picked up automatically.
 */
export function useGroupChat(groupId: string | null | undefined): UseGroupChatResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!groupId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_chat_messages' as any)
        .select(
          'id, group_id, sender_id, content, reply_to_id, attachments, edited_at, created_at, sender:profiles!group_chat_messages_sender_id_fkey(display_name, avatar_url)',
        )
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      const rows = ((data as GroupChatMessage[]) ?? []).slice().reverse();
      setMessages(rows);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`group-chat:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const row = payload.new as GroupChatMessage;
          // Hydrate sender profile (postgres_changes doesn't run the join).
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', row.sender_id)
            .maybeSingle();
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [
                  ...prev,
                  {
                    ...row,
                    sender: prof
                      ? {
                          display_name: (prof as { display_name?: string | null }).display_name ?? null,
                          avatar_url: (prof as { avatar_url?: string | null }).avatar_url ?? null,
                        }
                      : undefined,
                  },
                ],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !groupId) throw new Error('not signed in or no group');
      const trimmed = content.trim();
      if (!trimmed) return;
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_chat_messages' as any)
        .insert({ group_id: groupId, sender_id: user.id, content: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-chat', groupId] });
    },
  });

  return {
    messages,
    loading,
    send: async (c) => {
      await sendMutation.mutateAsync(c);
    },
    sending: sendMutation.isPending,
  };
}
