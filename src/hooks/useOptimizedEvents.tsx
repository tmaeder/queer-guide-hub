import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];
type EventInsert = Database['public']['Tables']['events']['Insert'];

interface EventFilters {
  city?: string;
  eventType?: string;
  dateRange?: { start: string; end: string };
  accessibilityAttributes?: string[];
  targetGroups?: string[];
  search?: string;
  nearMe?: { lat: number; lng: number };
  limit?: number;
  offset?: number;
}

const EVENTS_QUERY_KEY = 'events';
const CACHE_TIME = 3 * 60 * 1000; // 3 minutes for more frequent updates
const STALE_TIME = 1 * 60 * 1000; // 1 minute

export function useOptimizedEvents(filters?: EventFilters) {
  const queryClient = useQueryClient();

  const buildQuery = (filters?: EventFilters) => {
    let query = supabase
      .from('events')
      .select(`
        *,
        event_attendees(status),
        venues(
          id,
          name,
          address,
          city,
          state,
          country,
          phone,
          website,
          email
        )
      `)
      .eq('status', 'active')
      .gte('start_date', new Date().toISOString())
      .order('featured', { ascending: false })
      .order('start_date', { ascending: true });

    if (filters?.city) {
      query = query.ilike('city', `%${filters.city}%`);
    }

    if (filters?.eventType) {
      query = query.eq('event_type', filters.eventType);
    }

    if (filters?.dateRange) {
      query = query
        .gte('start_date', filters.dateRange.start)
        .lte('start_date', filters.dateRange.end);
    }

    if (filters?.accessibilityAttributes?.length) {
      query = query.overlaps('accessibility_attributes', filters.accessibilityAttributes);
    }

    if (filters?.targetGroups?.length) {
      query = query.overlaps('target_groups', filters.targetGroups);
    }

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    return query;
  };

  const fetchEvents = async (): Promise<Event[]> => {
    const { data, error } = await buildQuery(filters);

    if (error) throw error;
    
    let eventsData = data || [];
    
    // Client-side distance filtering for nearMe
    if (filters?.nearMe) {
      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      };

      eventsData = eventsData
        .filter(event => event.latitude && event.longitude)
        .map(event => ({
          ...event,
          distance: calculateDistance(
            filters.nearMe!.lat,
            filters.nearMe!.lng,
            event.latitude!,
            event.longitude!
          )
        }))
        .filter(event => event.distance <= 50)
        .sort((a, b) => a.distance - b.distance);
    }
    
    return eventsData;
  };

  const {
    data: events = [],
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: [EVENTS_QUERY_KEY, filters],
    queryFn: fetchEvents,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const createEventMutation = useMutation({
    mutationFn: async (event: EventInsert): Promise<Event> => {
      const { data, error } = await supabase
        .from('events')
        .insert([event])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ eventId, eventData }: { eventId: string; eventData: Partial<EventInsert> }): Promise<Event> => {
      const { data, error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string): Promise<void> => {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] });
    },
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: 'going' | 'interested' | 'not_going' }): Promise<void> => {
      const { error } = await supabase
        .from('event_attendees')
        .upsert({
          event_id: eventId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          status
        });

      if (error) throw error;

      // Auto-add to favorites when going or interested
      if (status === 'going' || status === 'interested') {
        await supabase
          .from('event_favorites')
          .upsert({
            event_id: eventId,
            user_id: (await supabase.auth.getUser()).data.user?.id
          });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [EVENTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['event_favorites'] });
    },
  });

  return {
    events,
    loading: isLoading,
    error: error?.message || null,
    isFetching,
    refetch,
    createEvent: createEventMutation.mutate,
    updateEvent: updateEventMutation.mutate,
    deleteEvent: deleteEventMutation.mutate,
    updateAttendance: updateAttendanceMutation.mutate,
    isCreating: createEventMutation.isPending,
    isUpdating: updateEventMutation.isPending,
    isDeleting: deleteEventMutation.isPending,
    isUpdatingAttendance: updateAttendanceMutation.isPending,
  };
}