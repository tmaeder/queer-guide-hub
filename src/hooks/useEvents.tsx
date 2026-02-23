import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type Event = Database['public']['Tables']['events']['Row'];
type EventInsert = Database['public']['Tables']['events']['Insert'];

export function useEvents(autoFetch: boolean = true) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchEvents = async (
    filters?: {
      city?: string;
      eventType?: string;
      dateRange?: { start: string; end: string };
      tags?: string[];
      accessibilityAttributes?: string[];
      targetGroups?: string[];
      search?: string;
      nearMe?: { lat: number; lng: number };
    },
    options?: { page?: number; pageSize?: number; append?: boolean }
  ) => {
    let fetchedCount = 0;
    let totalCount: number | null = null;
    try {
      setLoading(true);
      setLoadingTimedOut(false);
      const page = options?.page;
      const pageSize = options?.pageSize ?? 24;

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
        `, { count: 'exact' })
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

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
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

      if (typeof page === 'number') {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await queryWithRetry(() => query) as any;

      if (error) throw error;
      
      let eventsData = (data as Event[]) || [];
      
      // Filter by distance if nearMe is provided
      if (filters?.nearMe) {
        // Filter events within 50km and add distance
        eventsData = eventsData
          .filter(event => event.latitude && event.longitude)
          .map(event => ({
            ...event,
            distance: calculateDistanceKm(
              filters.nearMe!.lat,
              filters.nearMe!.lng,
              event.latitude!,
              event.longitude!
            )
          }))
          .filter((event: any) => event.distance <= 50)
          .sort((a: any, b: any) => a.distance - b.distance);
      }
      
      if (options?.append) {
        setEvents(prev => {
          const merged = [...prev, ...eventsData];
          return Array.from(new Map(merged.map(e => [e.id, e])).values());
        });
      } else {
        setEvents(eventsData);
      }

      fetchedCount = eventsData.length;
      totalCount = typeof count === 'number' ? count : null;

      if (typeof count === 'number') {
        if (typeof page === 'number') {
          const from = (page - 1) * pageSize;
          setHasMore(from + eventsData.length < count);
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
    return { fetched: fetchedCount, total: totalCount } as any;
  };

  const createEvent = async (event: EventInsert) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .insert([event])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to create event' 
      };
    }
  };

  const updateEvent = async (eventId: string, eventData: Partial<EventInsert>) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to update event' 
      };
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      return { error: null };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to delete event' 
      };
    }
  };

  const updateAttendance = async (eventId: string, status: 'going' | 'interested' | 'not_going') => {
    try {
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

      return { error: null };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to update attendance' 
      };
    }
  };

  useEffect(() => {
    if (autoFetch) {
      fetchEvents();
    }
  }, [autoFetch]);

  return {
    events,
    loading,
    loadingTimedOut,
    error,
    hasMore,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    updateAttendance,
    refetch: () => fetchEvents(),
  };
}