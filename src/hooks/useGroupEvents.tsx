import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

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

export const useGroupEvents = (groupId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch group events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['group-events', groupId],
    queryFn: async () => {
      const { data, error } = await api
        .from('events')
        .select(`
          *,
          event_attendees(id, user_id, status)
        `)
        .eq('group_id', groupId)
        .eq('status', 'active')
        .order('start_date', { ascending: true });

      if (error) throw error;

      return (data || []).map(event => ({
        ...event,
        attendee_count: event.event_attendees?.filter((a: any) => a.status === 'going').length || 0,
        user_attending: event.event_attendees?.some((a: any) => a.user_id === user?.id && a.status === 'going') || false
      }));
    },
    enabled: !!user && !!groupId
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: CreateGroupEventData) => {
      const { data, error } = await api
        .from('events')
        .insert({
          ...eventData,
          group_id: groupId,
          created_by: user?.id,
          country: 'US' // Default country
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      toast({
        title: "Event created",
        description: "Your group event has been created successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create event. Please try again.",
        variant: "destructive"
      });
      console.error('Error creating event:', error);
    }
  });

  // Join event mutation
  const joinEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await api
        .from('event_attendees')
        .insert({
          event_id: eventId,
          user_id: user?.id,
          status: 'going'
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      toast({
        title: "Joined event",
        description: "You've successfully joined the event."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to join event. Please try again.",
        variant: "destructive"
      });
      console.error('Error joining event:', error);
    }
  });

  // Leave event mutation
  const leaveEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await api
        .from('event_attendees')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      toast({
        title: "Left event",
        description: "You've left the event."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to leave event. Please try again.",
        variant: "destructive"
      });
      console.error('Error leaving event:', error);
    }
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await api
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('group_id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] });
      toast({
        title: "Event deleted",
        description: "The event has been deleted successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete event. Please try again.",
        variant: "destructive"
      });
      console.error('Error deleting event:', error);
    }
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
    isDeletingEvent: deleteEventMutation.isPending
  };
};