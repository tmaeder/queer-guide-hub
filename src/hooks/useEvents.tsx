import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
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
  const [datasetTotal, setDatasetTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('events')
        .select('id', { head: true, count: 'exact' })
        .is('duplicate_of_id', null);
      if (!cancelled) setDatasetTotal(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchEvents = useCallback(async (
    filters?: {
      city?: string;
      eventType?: string;
      dateRange?: { start: string; end: string };
      tags?: string[];
      accessibilityAttributes?: string[];
      targetGroups?: string[];
      search?: string;
      nearMe?: { lat: number; lng: number };
      bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
      limit?: number;
      includePast?: boolean;
      featured?: boolean;
      isFree?: boolean;
      sort?: 'date-asc' | 'date-desc' | 'popularity' | 'distance';
    },
    options?: { page?: number; pageSize?: number; append?: boolean; signal?: AbortSignal },
  ) => {
    const signal = options?.signal;
    if (signal?.aborted) return { fetched: 0, total: null as number | null };
    let fetchedCount = 0;
    let totalCount: number | null = null;
    try {
      setLoading(true);
      setLoadingTimedOut(false);
      const page = options?.page;
      const pageSize = options?.pageSize ?? 24;

      // Route through search_events RPC when we need accent-insensitive
      // city match or overlap-aware date filtering. Geo-bounds / nearMe
      // still use the legacy client query below (RPC has no geo filter).
      const useRpc =
        !filters?.bounds &&
        !filters?.nearMe &&
        !filters?.featured &&
        !filters?.isFree &&
        !filters?.sort &&
        (Boolean(filters?.city) || Boolean(filters?.dateRange));

      let data: Event[] | null = null;
      let error: Error | null = null;
      let count: number | null = null;

      if (useRpc) {
        const limit =
          typeof filters?.limit === 'number'
            ? filters.limit
            : typeof page === 'number'
            ? pageSize
            : 1000;
        const offset = typeof page === 'number' ? (page - 1) * pageSize : 0;

        const rpcResult = (await queryWithRetry(() => {
          const q = supabase.rpc('search_events', {
            p_city: filters?.city ?? null,
            p_event_type: filters?.eventType ?? null,
            p_start: filters?.dateRange?.start ?? null,
            p_end: filters?.dateRange?.end ?? null,
            p_tags: filters?.tags?.length ? filters.tags : null,
            p_accessibility_attributes: filters?.accessibilityAttributes?.length
              ? filters.accessibilityAttributes
              : null,
            p_target_groups: filters?.targetGroups?.length ? filters.targetGroups : null,
            p_search: filters?.search ?? null,
            p_include_past: filters?.includePast ?? false,
            p_limit: limit,
            p_offset: offset,
          });
          return signal ? q.abortSignal(signal) : q;
        })) as { data: Array<{ total: number | string; event: Event }> | null; error: Error | null };

        if (rpcResult.error) throw rpcResult.error;
        const rows = rpcResult.data ?? [];
        data = rows.map((r) => r.event);
        count = rows.length > 0 ? Number(rows[0].total) : 0;
      } else {
        let query = supabase
          .from('events')
          .select(
            `
            *,
            venues!venue_id(
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
          `,
            { count: 'exact' },
          )
          .eq('status', 'active')
          .is('duplicate_of_id', null);

        const sort = filters?.sort ?? 'date-asc';
        if (sort === 'date-desc') {
          query = query.order('is_featured', { ascending: false }).order('start_date', { ascending: false });
        } else {
          // date-asc (default) and distance (sorted client-side after fetch)
          query = query.order('is_featured', { ascending: false })
            .order('start_date', { ascending: filters?.includePast ? false : true });
        }

        const nowIso = new Date().toISOString();
        if (filters?.includePast) {
          query = query.lte('start_date', nowIso);
        } else {
          query = query.gte('start_date', nowIso);
        }

        if (filters?.eventType) {
          query = query.eq('event_type', filters.eventType);
        }

        if (filters?.featured) {
          query = query.eq('is_featured', true);
        }

        if (filters?.isFree) {
          query = query.eq('is_free', true);
        }

        if (filters?.city) {
          query = query.ilike('city', filters.city);
        }

        if (filters?.dateRange) {
          query = query.gte('start_date', filters.dateRange.start).lte('start_date', filters.dateRange.end);
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

        if (filters?.bounds) {
          query = query
            .gte('latitude', filters.bounds.minLat)
            .lte('latitude', filters.bounds.maxLat)
            .gte('longitude', filters.bounds.minLng)
            .lte('longitude', filters.bounds.maxLng);
        }

        if (typeof filters?.limit === 'number') {
          query = query.limit(filters.limit);
        }

        if (filters?.search) {
          query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
        }

        if (typeof page === 'number') {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          query = query.range(from, to);
        }

        const result = (await queryWithRetry(() => (signal ? query.abortSignal(signal) : query))) as { data: Event[] | null; error: Error | null; count: number | null };
        data = result.data;
        error = result.error;
        count = result.count;
      }

      if (signal?.aborted) return { fetched: 0, total: null as number | null };
      if (error) throw error;

      let eventsData = (data as Event[]) || [];

      // Attach public attendee counts via SECURITY DEFINER RPC.
      // event_attendees has restricted SELECT (own rows only); the RPC
      // returns aggregate counts that are safe to expose to anon.
      if (eventsData.length > 0) {
        const ids = eventsData.map((e) => e.id);
        const { data: counts } = await supabase.rpc('event_attendee_counts', {
          event_ids: ids,
        });
        const byId = new Map(
          (counts ?? []).map((r: { event_id: string; going_count: number }) => [
            r.event_id,
            r.going_count,
          ]),
        );
        eventsData = eventsData.map((e) => ({
          ...e,
          attendee_count: byId.get(e.id) ?? 0,
        })) as Event[];
      }

      // Filter by distance if nearMe is provided
      if (filters?.nearMe) {
        // Filter events within 50km and add distance
        eventsData = eventsData
          .filter((event) => event.latitude && event.longitude)
          .map((event) => ({
            ...event,
            distance: calculateDistanceKm(
              filters.nearMe!.lat,
              filters.nearMe!.lng,
              event.latitude!,
              event.longitude!,
            ),
          }))
          .filter((event: Event & { distance: number }) => event.distance <= 50)
          .sort((a: Event & { distance: number }, b: Event & { distance: number }) => a.distance - b.distance);
      }

      if (options?.append) {
        setEvents((prev) => {
          const merged = [...prev, ...eventsData];
          return Array.from(new Map(merged.map((e) => [e.id, e])).values());
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
      if (signal?.aborted) return { fetched: 0, total: null as number | null };
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
    return { fetched: fetchedCount, total: totalCount } as { fetched: number; total: number | null };
  }, []);

  const createEvent = async (event: EventInsert) => {
    try {
      const { data, error } = await supabase.from('events').insert([event]).select().single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Failed to create event',
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
        error: err instanceof Error ? err.message : 'Failed to update event',
      };
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId);

      if (error) throw error;
      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Failed to delete event',
      };
    }
  };

  const updateAttendance = async (
    eventId: string,
    status: 'going' | 'interested' | 'not_going',
  ) => {
    try {
      const { error } = await supabase.from('event_attendees').upsert({
        event_id: eventId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        status,
      });

      if (error) throw error;

      // Auto-add to favorites when going or interested
      if (status === 'going' || status === 'interested') {
        await supabase.from('event_favorites').upsert({
          event_id: eventId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
        });
      }

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Failed to update attendance',
      };
    }
  };

  useEffect(() => {
    if (autoFetch) {
      fetchEvents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch]);

  return {
    events,
    loading,
    isFetching: loading,
    loadingTimedOut,
    error,
    hasMore,
    datasetTotal,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    updateAttendance,
    refetch: () => fetchEvents(),
  };
}
