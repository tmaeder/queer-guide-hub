import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mirrorRsvp } from '@/hooks/blueskyActivity';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { DISCOVERY_EVENT_WINDOW_MS, selectDiscoveryEvent } from '@/lib/discoveryEvent';

export interface GroupEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  venue_name?: string;
  address?: string;
  city: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  event_type: string;
  is_free: boolean;
  price_min?: number;
  price_max?: number;
  currency?: string;
  max_attendees?: number;
  ticket_url?: string;
  website?: string;
  images?: string[];
  status: string;
  featured: boolean;
  age_restriction?: string;
  organizer_name?: string;
  organizer_contact?: string;
  created_by?: string;
  group_id?: string;
  created_at: string;
  updated_at: string;
  // Computed fields
  attendee_count?: number;
  user_attending?: boolean;
}

export interface CreateGroupEventData {
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  venue_name?: string;
  address?: string;
  city: string;
  state?: string;
  event_type: string;
  is_free: boolean;
  price_min?: number;
  price_max?: number;
  max_attendees?: number;
  ticket_url?: string;
  website?: string;
  age_restriction?: string;
  organizer_name?: string;
  organizer_contact?: string;
}

const publicMeetupKey = ['public-group-meetup'] as const;

export function usePublicGroupMeetup() {
  return useQuery({
    queryKey: publicMeetupKey,
    staleTime: 60_000,
    queryFn: async () => {
      const now = Date.now();
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, slug, title, start_date, city, timezone, liveness_status, age_restriction, group:community_groups!events_group_id_fkey!inner(name)',
        )
        .eq('group.is_private', false)
        .is('group.archived_at', null)
        .eq('safety_gated', false)
        .eq('status', 'active')
        .is('duplicate_of_id', null)
        .not('liveness_status', 'in', '(dead,cancelled,dead_link)')
        .or('age_restriction.is.null,age_restriction.not.in.("18+","21+")')
        .gte('start_date', new Date(now).toISOString())
        .lt('start_date', new Date(now + DISCOVERY_EVENT_WINDOW_MS).toISOString())
        .order('start_date')
        .order('id')
        .limit(1);

      if (error) throw error;
      return selectDiscoveryEvent(data ?? [], now) ?? null;
    },
  });
}

export const useGroupEvents = (groupId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch group events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['group-events', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'active')
        .is('duplicate_of_id', null)
        .order('start_date', { ascending: true });

      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const ids = rows.map((e) => e.id);
      const { data: counts } = await supabase.rpc('event_attendee_counts', {
        event_ids: ids,
      });
      const countById = new Map(
        (counts ?? []).map((r: { event_id: string; going_count: number }) => [
          r.event_id,
          r.going_count,
        ]),
      );

      let ownAttending = new Set<string>();
      if (user?.id) {
        const { data: own } = await supabase
          .from('event_attendees')
          .select('event_id')
          .in('event_id', ids)
          .eq('user_id', user.id)
          .eq('status', 'going');
        ownAttending = new Set((own ?? []).map((r) => r.event_id));
      }

      return rows.map((event) => ({
        ...event,
        attendee_count: countById.get(event.id) ?? 0,
        user_attending: ownAttending.has(event.id),
      }));
    },
    enabled: !!user && !!groupId,
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: CreateGroupEventData) => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          ...eventData,
          group_id: groupId,
          created_by: user?.id,
          country: 'US', // Default country
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      queryClient.invalidateQueries({ queryKey: publicMeetupKey });
      toast({
        title: 'Event created',
        description: 'Your group event has been created successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create event. Please try again.',
        variant: 'destructive',
      });
      console.error('Error creating event:', error);
    },
  });

  // Join event mutation
  const joinEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.from('event_attendees').insert({
        event_id: eventId,
        user_id: user?.id,
        status: 'going',
      });

      if (error) throw error;
      mirrorRsvp(eventId, 'going');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      toast({
        title: 'Joined event',
        description: "You've successfully joined the event.",
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to join event. Please try again.',
        variant: 'destructive',
      });
      console.error('Error joining event:', error);
    },
  });

  // Leave event mutation
  const leaveEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('event_attendees')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', user?.id);

      if (error) throw error;
      mirrorRsvp(eventId, 'not_going');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      toast({
        title: 'Left event',
        description: "You've left the event.",
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to leave event. Please try again.',
        variant: 'destructive',
      });
      console.error('Error leaving event:', error);
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('group_id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      queryClient.invalidateQueries({ queryKey: publicMeetupKey });
      toast({
        title: 'Event deleted',
        description: 'The event has been deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete event. Please try again.',
        variant: 'destructive',
      });
      console.error('Error deleting event:', error);
    },
  });

  return {
    events,
    isLoading,
    createEvent: createEventMutation.mutate,
    isCreatingEvent: createEventMutation.isPending,
    joinEvent: joinEventMutation.mutate,
    isJoiningEvent: joinEventMutation.isPending,
    leaveEvent: leaveEventMutation.mutate,
    isLeavingEvent: leaveEventMutation.isPending,
    deleteEvent: deleteEventMutation.mutate,
    isDeletingEvent: deleteEventMutation.isPending,
  };
};
