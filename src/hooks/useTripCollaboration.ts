import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ── Types ──────────────────────────────────────────────────────

export interface TripMessage {
  id: string;
  trip_id: string;
  sender_id: string;
  content: string;
  reply_to: string | null;
  reactions: Record<string, string[]>; // emoji -> user_ids
  created_at: string;
  sender?: { display_name: string | null; avatar_url: string | null } | null;
}

export interface TripNote {
  id: string;
  trip_id: string;
  author_id: string;
  title: string | null;
  content: string | null;
  is_pinned: boolean;
  category: string | null;
  created_at: string;
  updated_at: string;
  author?: { display_name: string | null; avatar_url: string | null } | null;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // user_ids
}

export interface TripPoll {
  id: string;
  trip_id: string;
  author_id: string;
  question: string;
  options: PollOption[];
  is_multiple_choice: boolean;
  deadline: string | null;
  is_closed: boolean;
  created_at: string;
  author?: { display_name: string | null; avatar_url: string | null } | null;
}

// ── Messages ──────────────────────────────────────────────────

export function useTripMessages(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['trip-messages', tripId],
    queryFn: async (): Promise<TripMessage[]> => {
      const { data, error } = await supabase
        .from('trip_messages')
        .select('*, sender:sender_id(display_name, avatar_url)')
        .eq('trip_id', tripId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TripMessage[];
    },
    enabled: !!tripId,
    staleTime: 30_000,
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      content,
      replyTo,
    }: {
      content: string;
      replyTo?: string;
    }) => {
      const { data, error } = await supabase
        .from('trip_messages')
        .insert({
          trip_id: tripId!,
          sender_id: user!.id,
          content,
          reply_to: replyTo || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-messages', tripId] });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('trip_messages')
        .delete()
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-messages', tripId] });
    },
  });

  return { ...query, sendMessage, deleteMessage };
}

// ── Notes ──────────────────────────────────────────────────────

export function useTripNotes(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['trip-notes', tripId],
    queryFn: async (): Promise<TripNote[]> => {
      const { data, error } = await supabase
        .from('trip_notes')
        .select('*, author:author_id(display_name, avatar_url)')
        .eq('trip_id', tripId!)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TripNote[];
    },
    enabled: !!tripId,
    staleTime: 60_000,
  });

  const createNote = useMutation({
    mutationFn: async (input: {
      title?: string;
      content?: string;
      category?: string;
    }) => {
      const { data, error } = await supabase
        .from('trip_notes')
        .insert({
          trip_id: tripId!,
          author_id: user!.id,
          title: input.title || null,
          content: input.content || null,
          category: input.category || 'general',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-notes', tripId] });
    },
  });

  const updateNote = useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      title?: string;
      content?: string;
      category?: string;
    }) => {
      const { data, error } = await supabase
        .from('trip_notes')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-notes', tripId] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('trip_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-notes', tripId] });
    },
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from('trip_notes')
        .update({ is_pinned: !isPinned })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-notes', tripId] });
    },
  });

  return { ...query, createNote, updateNote, deleteNote, togglePin };
}

// ── Polls ──────────────────────────────────────────────────────

export function useTripPolls(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['trip-polls', tripId],
    queryFn: async (): Promise<TripPoll[]> => {
      const { data, error } = await supabase
        .from('trip_polls')
        .select('*, author:author_id(display_name, avatar_url)')
        .eq('trip_id', tripId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TripPoll[];
    },
    enabled: !!tripId,
    staleTime: 30_000,
  });

  const createPoll = useMutation({
    mutationFn: async (input: {
      question: string;
      options: string[];
      isMultipleChoice?: boolean;
      deadline?: string;
    }) => {
      const optionsJson: PollOption[] = input.options.map((text, _i) => ({
        id: crypto.randomUUID(),
        text,
        votes: [],
      }));
      const { data, error } = await supabase
        .from('trip_polls')
        .insert({
          trip_id: tripId!,
          author_id: user!.id,
          question: input.question,
          options: optionsJson,
          is_multiple_choice: input.isMultipleChoice || false,
          deadline: input.deadline || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-polls', tripId] });
    },
  });

  const vote = useMutation({
    mutationFn: async ({
      pollId,
      optionId,
    }: {
      pollId: string;
      optionId: string;
    }) => {
      // Fetch current poll options
      const { data: poll, error: fetchErr } = await supabase
        .from('trip_polls')
        .select('options, is_multiple_choice')
        .eq('id', pollId)
        .single();
      if (fetchErr) throw fetchErr;

      const options = (poll.options as unknown as PollOption[]).map((opt) => {
        if (opt.id === optionId) {
          // Toggle vote
          const hasVoted = opt.votes.includes(user!.id);
          return {
            ...opt,
            votes: hasVoted
              ? opt.votes.filter((v) => v !== user!.id)
              : [...opt.votes, user!.id],
          };
        }
        // If not multiple choice, remove user's vote from other options
        if (!poll.is_multiple_choice) {
          return { ...opt, votes: opt.votes.filter((v) => v !== user!.id) };
        }
        return opt;
      });

      const { error } = await supabase
        .from('trip_polls')
        .update({ options })
        .eq('id', pollId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-polls', tripId] });
    },
  });

  const closePoll = useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await supabase
        .from('trip_polls')
        .update({ is_closed: true })
        .eq('id', pollId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-polls', tripId] });
    },
  });

  return { ...query, createPoll, vote, closePoll };
}

// ── Realtime ──────────────────────────────────────────────────

interface PresenceMember {
  userId: string;
  displayName: string;
}

export function useTripRealtime(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tripId || !user) return;

    // Postgres changes channel for trip data
    const dbChannel = supabase
      .channel(`trip-db-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_places', filter: `trip_id=eq.${tripId}` },
        () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_days', filter: `trip_id=eq.${tripId}` },
        () => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_notes', filter: `trip_id=eq.${tripId}` },
        () => queryClient.invalidateQueries({ queryKey: ['trip-notes', tripId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_messages', filter: `trip_id=eq.${tripId}` },
        () => queryClient.invalidateQueries({ queryKey: ['trip-messages', tripId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_polls', filter: `trip_id=eq.${tripId}` },
        () => queryClient.invalidateQueries({ queryKey: ['trip-polls', tripId] }),
      )
      .subscribe();

    // Presence / broadcast channel
    const presenceChannel = supabase.channel(`trip-presence-${tripId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const members: PresenceMember[] = [];
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences as unknown as Array<{ userId: string; displayName: string }>) {
            members.push({
              userId: p.userId,
              displayName: p.displayName,
            });
          }
        }
        setOnlineMembers(members);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            userId: user.id,
            displayName:
              user.user_metadata?.display_name || user.email || 'Anonymous',
          });
        }
      });

    channelRef.current = presenceChannel;

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(presenceChannel);
      channelRef.current = null;
    };
  }, [tripId, user, queryClient]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: user.id,
        displayName:
          user.user_metadata?.display_name || user.email || 'Someone',
      },
    });
  }, [user]);

  return { onlineMembers, sendTyping };
}
