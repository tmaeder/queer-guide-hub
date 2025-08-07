import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];
type EventInsert = Database['public']['Tables']['events']['Insert'];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl = this.DEFAULT_TTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear() {
    this.cache.clear();
  }

  invalidatePattern(pattern: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

const queryCache = new QueryCache();

export function useOptimizedEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounced fetch function
  const debouncedFetch = useCallback(
    debounce(async (filters?: any) => {
      const cacheKey = `events_${JSON.stringify(filters || {})}`;
      const cached = queryCache.get<Event[]>(cacheKey);
      
      if (cached) {
        setEvents(cached);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        let query = supabase
          .from('events')
          .select(`
            *,
            event_attendees!inner(status),
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
          .order('start_date', { ascending: true })
          .limit(50); // Limit initial load

        // Apply filters efficiently
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
        if (filters?.tags?.length) {
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

        const { data, error } = await query;

        if (error) throw error;
        
        let eventsData = data || [];
        
        // Client-side distance filtering (only if needed)
        if (filters?.nearMe) {
          eventsData = eventsData
            .filter(event => event.latitude && event.longitude)
            .map(event => ({
              ...event,
              distance: calculateDistance(
                filters.nearMe.lat,
                filters.nearMe.lng,
                event.latitude!,
                event.longitude!
              )
            }))
            .filter((event: any) => event.distance <= 50)
            .sort((a: any, b: any) => a.distance - b.distance);
        }
        
        // Cache the results
        queryCache.set(cacheKey, eventsData);
        setEvents(eventsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const fetchEvents = useCallback((filters?: any) => {
    debouncedFetch(filters);
  }, [debouncedFetch]);

  const createEvent = useCallback(async (event: EventInsert) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .insert([event])
        .select()
        .single();

      if (error) throw error;
      
      // Invalidate cache
      queryCache.invalidatePattern('events_');
      
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to create event' 
      };
    }
  }, []);

  const updateEvent = useCallback(async (eventId: string, eventData: Partial<EventInsert>) => {
    try {
      const { data, error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      
      // Invalidate cache
      queryCache.invalidatePattern('events_');
      
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to update event' 
      };
    }
  }, []);

  const deleteEvent = useCallback(async (eventId: string) => {
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      
      // Invalidate cache
      queryCache.invalidatePattern('events_');
      
      return { error: null };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to delete event' 
      };
    }
  }, []);

  const updateAttendance = useCallback(async (eventId: string, status: 'going' | 'interested' | 'not_going') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('event_attendees')
        .upsert({
          event_id: eventId,
          user_id: user.id,
          status
        });

      if (error) throw error;

      // Auto-add to favorites when going or interested
      if (status === 'going' || status === 'interested') {
        await supabase
          .from('event_favorites')
          .upsert({
            event_id: eventId,
            user_id: user.id
          });
      }

      return { error: null };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to update attendance' 
      };
    }
  }, []);

  // Memoized values
  const eventsByType = useMemo(() => {
    return events.reduce((acc, event) => {
      if (!acc[event.event_type]) acc[event.event_type] = [];
      acc[event.event_type].push(event);
      return acc;
    }, {} as Record<string, Event[]>);
  }, [events]);

  const featuredEvents = useMemo(() => {
    return events.filter(event => event.featured).slice(0, 10);
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return events.filter(event => 
      new Date(event.start_date) <= weekFromNow
    ).slice(0, 20);
  }, [events]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    updateAttendance,
    refetch: () => fetchEvents(),
    // Derived data
    eventsByType,
    featuredEvents,
    upcomingEvents,
    // Cache management
    clearCache: () => queryCache.clear()
  };
}

// Utility functions
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}