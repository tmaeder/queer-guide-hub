import { useState, useEffect, useCallback, useId } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface MessageProfile {
  display_name: string | null;
  avatar_url: string | null;
  user_mode?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  attachments: Record<string, unknown>[] | null;
  metadata: Record<string, unknown> | null;
  sender?: MessageProfile;
  reactions?: MessageReaction[];
  status?: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: MessageProfile;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  is_admin: boolean;
  is_muted: boolean;
  profile?: MessageProfile & { user_id: string };
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_id: string | null;
  participants_count: number;
  conversation_type: string;
  title: string | null;
  description: string | null;
  participants?: ConversationParticipant[];
  last_message?: Message;
}

export interface TypingIndicator {
  user_id: string;
  conversation_id: string;
  display_name: string;
  timestamp: number;
}

export const useMessaging = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  // Stable per-hook-instance id. Multiple components (SendEventDialog,
  // NotificationList, MessagingInterface, …) can mount useMessaging at the
  // same time; a shared channel topic returns the SAME channel from the
  // realtime client, and the second `.on('postgres_changes', …)` after
  // `.subscribe()` throws "cannot add postgres_changes callbacks … after
  // subscribe()", crashing the consumer. Scope each topic per instance. See
  // the matching fix in useNotifications (D2).
  const instanceId = useId();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingIndicator[]>>({});
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});

  // Fetch user's conversations
  const fetchConversations = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(
          `
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
        `,
        )
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setConversations((data as Conversation[]) || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(
    async (conversationId: string) => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(
            '*, sender:profiles!messages_sender_id_profiles_user_id_fkey(display_name, avatar_url), reactions:message_reactions(*)',
          )
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        const messagesWithStatus =
          (data as Message[])?.map((msg: Message) => ({
            ...msg,
            sender: msg.sender || null,
            status: msg.sender_id === user?.id ? 'sent' : 'delivered',
          })) || [];

        setMessages((prev) => ({
          ...prev,
          [conversationId]: messagesWithStatus,
        }));

        return messagesWithStatus;
      } catch (error) {
        console.error('Error fetching messages:', error);
        toast({
          title: 'Error',
          description: 'Failed to load messages',
          variant: 'destructive',
        });
        return [];
      }
    },
    [toast, user?.id],
  );

  // Send a message
  const sendMessage = useCallback(
    async (conversationId: string, content: string, replyToId?: string) => {
      if (!user || !content.trim()) return;

      const tempId = `temp-${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
        message_type: 'text',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: replyToId || null,
        attachments: null,
        metadata: null,
        status: 'sending',
        sender: {
          display_name: user.user_metadata?.display_name || user.email || 'You',
          avatar_url: user.user_metadata?.avatar_url || null,
        },
      };

      // Optimistically add the message
      setMessages((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] || []), tempMessage],
      }));

      setSendingMessage(true);
      try {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: content.trim(),
            reply_to_id: replyToId || null,
          })
          .select('*')
          .single();

        if (error) throw error;

        // Replace temp message with real one
        setMessages((prev) => ({
          ...prev,
          [conversationId]:
            prev[conversationId]?.map((msg) =>
              msg.id === tempId ? { ...(data as Message), status: 'sent' as const } : msg,
            ) || [],
        }));

        return data;
      } catch (error) {
        console.error('Error sending message:', error);

        // Remove temp message on error
        setMessages((prev) => ({
          ...prev,
          [conversationId]: prev[conversationId]?.filter((msg) => msg.id !== tempId) || [],
        }));

        toast({
          title: 'Error',
          description: 'Failed to send message',
          variant: 'destructive',
        });
      } finally {
        setSendingMessage(false);
      }
    },
    [user, toast],
  );

  // Start a new conversation
  const startConversation = useCallback(
    async (userId: string) => {
      if (!user) return;

      try {
        const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
          user1_id: user.id,
          user2_id: userId,
        });

        if (error) throw error;

        await fetchConversations();
        return data;
      } catch (error) {
        console.error('Error starting conversation:', error);
        toast({
          title: 'Error',
          description: 'Failed to start conversation',
          variant: 'destructive',
        });
      }
    },
    [user, fetchConversations, toast],
  );

  // Refetch reactions for a single message and patch it into state — avoids the
  // N+1 full-conversation refetch the old addReaction did on every tap.
  const refreshReactions = useCallback(async (messageId: string) => {
    const { data } = await supabase
      .from('message_reactions')
      .select('*, user:profiles!message_reactions_user_id_profiles_user_id_fkey(display_name, avatar_url)')
      .eq('message_id', messageId);
    const reactions = (data as MessageReaction[]) ?? [];
    setMessages((prev) => {
      const next: Record<string, Message[]> = {};
      for (const [convId, list] of Object.entries(prev)) {
        next[convId] = list.map((m) => (m.id === messageId ? { ...m, reactions } : m));
      }
      return next;
    });
  }, []);

  // Toggle a reaction: same (user, emoji) removes it, otherwise adds it.
  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;

      const existing = Object.values(messages)
        .flat()
        .find((m) => m.id === messageId)
        ?.reactions?.some((r) => r.user_id === user.id && r.emoji === emoji);

      try {
        if (existing) {
          const { error } = await supabase
            .from('message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', user.id)
            .eq('emoji', emoji);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('message_reactions')
            .insert({ message_id: messageId, user_id: user.id, emoji });
          if (error) throw error;
        }
        await refreshReactions(messageId);
      } catch (error) {
        console.error('Error toggling reaction:', error);
        toast({ title: 'Error', description: 'Failed to add reaction', variant: 'destructive' });
      }
    },
    [user, toast, messages, refreshReactions],
  );

  // Edit own message content
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!user || !content.trim()) return;
      const clean = content.trim();
      try {
        const { error } = await supabase
          .from('messages')
          .update({ content: clean, edited_at: new Date().toISOString() })
          .eq('id', messageId)
          .eq('sender_id', user.id);
        if (error) throw error;
        setMessages((prev) => {
          const next: Record<string, Message[]> = {};
          for (const [convId, list] of Object.entries(prev)) {
            next[convId] = list.map((m) =>
              m.id === messageId ? { ...m, content: clean, edited_at: new Date().toISOString() } : m,
            );
          }
          return next;
        });
      } catch (error) {
        console.error('Error editing message:', error);
        toast({ title: 'Error', description: 'Failed to edit message', variant: 'destructive' });
      }
    },
    [user, toast],
  );

  // Soft-delete own message (keeps the row so replies stay intact)
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!user) return;
      const now = new Date().toISOString();
      try {
        const { error } = await supabase
          .from('messages')
          .update({ deleted_at: now, content: '' })
          .eq('id', messageId)
          .eq('sender_id', user.id);
        if (error) throw error;
        setMessages((prev) => {
          const next: Record<string, Message[]> = {};
          for (const [convId, list] of Object.entries(prev)) {
            next[convId] = list.map((m) =>
              m.id === messageId ? { ...m, deleted_at: now, content: '' } : m,
            );
          }
          return next;
        });
      } catch (error) {
        console.error('Error deleting message:', error);
        toast({ title: 'Error', description: 'Failed to delete message', variant: 'destructive' });
      }
    },
    [user, toast],
  );

  // Mark conversation as read
  const markAsRead = useCallback(
    async (conversationId: string) => {
      if (!user) return;

      try {
        const { error } = await supabase
          .from('conversation_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .eq('user_id', user.id);

        if (error) throw error;

        // Update message status to 'read' for messages from other users
        setMessages((prev) => ({
          ...prev,
          [conversationId]:
            prev[conversationId]?.map((msg) =>
              msg.sender_id !== user.id ? { ...msg, status: 'read' } : msg,
            ) || [],
        }));
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    },
    [user],
  );

  // Typing indicator functions
  const sendTypingIndicator = useCallback(
    async (conversationId: string) => {
      if (!user || isTyping[conversationId]) return;

      setIsTyping((prev) => ({ ...prev, [conversationId]: true }));

      try {
        await supabase.channel(`typing-${conversationId}`).send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            user_id: user.id,
            display_name: user.user_metadata?.display_name || user.email,
            conversation_id: conversationId,
            timestamp: Date.now(),
          },
        });

        // Stop typing after 3 seconds
        setTimeout(() => {
          setIsTyping((prev) => ({ ...prev, [conversationId]: false }));
        }, 3000);
      } catch (error) {
        console.error('Error sending typing indicator:', error);
      }
    },
    [user, isTyping],
  );

  const stopTypingIndicator = useCallback(
    async (conversationId: string) => {
      if (!user) return;

      setIsTyping((prev) => ({ ...prev, [conversationId]: false }));

      try {
        await supabase.channel(`typing-${conversationId}`).send({
          type: 'broadcast',
          event: 'stop_typing',
          payload: {
            user_id: user.id,
            conversation_id: conversationId,
          },
        });
      } catch (error) {
        console.error('Error stopping typing indicator:', error);
      }
    },
    [user],
  );

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel(`messages-changes:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          // Only update if it's not from the current user (to avoid duplicates)
          if (newMessage.sender_id !== user.id) {
            // Fetch the sender profile for the new message
            const { data: senderData } = await supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('user_id', newMessage.sender_id)
              .single();

            const messageWithSender = {
              ...newMessage,
              sender: senderData,
              status: 'delivered' as const,
            };

            setMessages((prev) => ({
              ...prev,
              [newMessage.conversation_id]: [
                ...(prev[newMessage.conversation_id] || []),
                messageWithSender,
              ],
            }));
          }
        },
      )
      // Edits + soft-deletes from other clients
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const upd = payload.new as Message;
          setMessages((prev) => {
            const list = prev[upd.conversation_id];
            if (!list) return prev;
            return {
              ...prev,
              [upd.conversation_id]: list.map((m) =>
                m.id === upd.id
                  ? { ...m, content: upd.content, edited_at: upd.edited_at, deleted_at: upd.deleted_at }
                  : m,
              ),
            };
          });
        },
      )
      // Live reactions (add/remove) from any participant
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const mid = (payload.new as { message_id?: string }).message_id;
          if (mid) void refreshReactions(mid);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const mid = (payload.old as { message_id?: string }).message_id;
          if (mid) void refreshReactions(mid);
        },
      )
      // Read receipts: the other participant updating last_read_at refreshes
      // conversations so derived own-message "read" status updates live.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants' },
        () => {
          void fetchConversations();
        },
      )
      .subscribe();

    // Subscribe to conversation updates
    const conversationsChannel = supabase
      .channel(`conversations-changes:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          fetchConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [user, fetchConversations, instanceId, refreshReactions]);

  // Set up typing indicators for active conversations
  useEffect(() => {
    if (!user) return;

    const channels: { [key: string]: ReturnType<typeof supabase.channel> } = {};

    // Set up typing channels for each conversation
    conversations.forEach((conversation) => {
      const channel = supabase
        .channel(`typing-${conversation.id}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
          const typingData = payload.payload as TypingIndicator;

          if (typingData.user_id !== user.id) {
            setTypingUsers((prev) => ({
              ...prev,
              [conversation.id]: [
                ...(prev[conversation.id]?.filter((t) => t.user_id !== typingData.user_id) || []),
                typingData,
              ],
            }));

            // Remove typing indicator after 5 seconds
            setTimeout(() => {
              setTypingUsers((prev) => ({
                ...prev,
                [conversation.id]:
                  prev[conversation.id]?.filter((t) => t.user_id !== typingData.user_id) || [],
              }));
            }, 5000);
          }
        })
        .on('broadcast', { event: 'stop_typing' }, (payload) => {
          const { user_id, conversation_id } = payload.payload;

          setTypingUsers((prev) => ({
            ...prev,
            [conversation_id]: prev[conversation_id]?.filter((t) => t.user_id !== user_id) || [],
          }));
        })
        .subscribe();

      channels[conversation.id] = channel;
    });

    return () => {
      Object.values(channels).forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [user, conversations]);

  // Initial fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    messages,
    loading,
    sendingMessage,
    typingUsers,
    fetchMessages,
    sendMessage,
    startConversation,
    addReaction,
    editMessage,
    deleteMessage,
    markAsRead,
    sendTypingIndicator,
    stopTypingIndicator,
    refetchConversations: fetchConversations,
  };
};
