import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface MessageProfile {
  display_name: string | null;
  avatar_url: string | null;
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
  reply_to_id: string | null;
  attachments: any;
  metadata: any;
  sender?: MessageProfile;
  reactions?: MessageReaction[];
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

export const useMessaging = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Fetch user's conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          participants:conversation_participants(
            *,
            profile:profiles(
              display_name,
              avatar_url,
              user_id
            )
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setConversations((data as any) || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles(
            display_name,
            avatar_url
          ),
          reactions:message_reactions(
            *,
            user:profiles(
              display_name
            )
          )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(prev => ({
        ...prev,
        [conversationId]: (data as any) || []
      }));

      return (data as any) || [];
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive"
      });
      return [];
    }
  }, [toast]);

  // Send a message
  const sendMessage = useCallback(async (conversationId: string, content: string, replyToId?: string) => {
    if (!user || !content.trim()) return;

    setSendingMessage(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
          reply_to_id: replyToId || null
        })
        .select(`
          *,
          sender:profiles(
            display_name,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      // Optimistically update messages
      setMessages(prev => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] || []), data as any]
      }));

      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive"
      });
    } finally {
      setSendingMessage(false);
    }
  }, [user, toast]);

  // Start a new conversation
  const startConversation = useCallback(async (userId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_or_create_direct_conversation', {
          user1_id: user.id,
          user2_id: userId
        });

      if (error) throw error;

      await fetchConversations();
      return data;
    } catch (error) {
      console.error('Error starting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation",
        variant: "destructive"
      });
    }
  }, [user, fetchConversations, toast]);

  // Add reaction to message
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('message_reactions')
        .upsert({
          message_id: messageId,
          user_id: user.id,
          emoji
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error adding reaction:', error);
      toast({
        title: "Error",
        description: "Failed to add reaction",
        variant: "destructive"
      });
    }
  }, [user, toast]);

  // Mark conversation as read
  const markAsRead = useCallback(async (conversationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('messages-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
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
            sender: senderData
          };

          setMessages(prev => ({
            ...prev,
            [newMessage.conversation_id]: [
              ...(prev[newMessage.conversation_id] || []),
              messageWithSender
            ]
          }));
        }
      })
      .subscribe();

    // Subscribe to conversation updates
    const conversationsChannel = supabase
      .channel('conversations-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations'
      }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [user, fetchConversations]);

  // Initial fetch
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    messages,
    loading,
    sendingMessage,
    fetchMessages,
    sendMessage,
    startConversation,
    addReaction,
    markAsRead,
    refetchConversations: fetchConversations
  };
};