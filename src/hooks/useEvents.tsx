import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { Database } from '@/types/database';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { queryWithRetry } from '@/utils/fetchWithRetry';

type Event = Database['public']['Tables']['events']['Row'];
type EventInsert = Database['public']['Tables']['events']['Insert'];

type EventFilters = {
  city?: string;
  eventType?: string;
  dateRange?: { start: string; end: string };
  tags?: string[];
  accessibilityAttributes?: string[];
  targetGroups?: string[];
  search?: string;
  nearMe?: { lat: number; lng: number };
  limit?: number;
};

type FetchOptions = { page?: number; pageSize?: number; append?: boolean };

async function fetchEventsQuery(
  filters?: EventFilters,
  options?: FetchOptions,
): Promise<{ data: Event[]; count: number | null }> {
  const pageSize = options?.pageSize ?? 24;

  let query = api
    .from('events')
    .select(
      `
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
    `,
      { count: 'exact' },
    )
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
  if (typeof filters?.limit === 'number') {
    query = query.limit(filters.limit);
  }
  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }
  if (typeof options?.page === 'number') {
    const from = (options.page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = (await queryWithRetry(() => query)) as any;
  if (error) throw error;

  let eventsData = (data as Event[]) || [];

  if (filters?.nearMe) {
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
      .filter((event: any) => event.distance <= 50)
      .sort((a: any, b: any) => a.distance - b.distance);
  }

  return { data: eventsData, count: typeof count === 'number' ? count : null };
}

export function useEvents(autoFetch: boolean = true) {
  const queryClient = useQueryClient();
  const [currentFilters, setCurrentFilters] = useState<EventFilters | undefined>(undefined);
  const [currentOptions, setCurrentOptions] = useState<FetchOptions | undefined>(undefined);
  const [appendedEvents, setAppendedEvents] = useState<Event[]>([]);
  const isAppending = useRef(false);

  const queryKey = ['events', currentFilters, currentOptions] as const;

  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
  } = useQuery({
    queryKey,
    queryFn: () => fetchEventsQuery(currentFilters, currentOptions),
    enabled: autoFetch || currentFilters !== undefined,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!data) return;
    if (isAppending.current) {
      setAppendedEvents((prev) => {
        const merged = [...prev, ...data.data];
        return Array.from(new Map(merged.map((e) => [e.id, e])).values());
      });
      isAppending.current = false;
    } else {
      setAppendedEvents(data.data);
    }
  }, [data]);

  const events = appendedEvents;
  const loading = isLoading;
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isFetching) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [isFetching]);

  const hasMore = (() => {
    if (!data || data.count === null) return false;
    const page = currentOptions?.page;
    const pageSize = currentOptions?.pageSize ?? 24;
    if (typeof page === 'number') {
      const from = (page - 1) * pageSize;
      return from + data.data.length < data.count;
    }
    return false;
  })();

  const fetchEvents = useCallback(
    async (filters?: EventFilters, options?: FetchOptions) => {
      if (options?.append) {
        isAppending.current = true;
      }
      setCurrentFilters(filters);
      setCurrentOptions(options);

      try {
        const result = await queryClient.fetchQuery({
          queryKey: ['events', filters, options],
          queryFn: () => fetchEventsQuery(filters, options),
          staleTime: 30_000,
        });
        return { fetched: result.data.length, total: result.count };
      } catch {
        return { fetched: 0, total: null };
      }
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: async (event: EventInsert) => {
      const { data, error } = await api.from('events').insert([event]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, eventData }: { id: string; eventData: Partial<EventInsert> }) => {
      const { data, error } = await api
        .from('events')
        .update(eventData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from('events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({
      eventId,
      status,
    }: {
      eventId: string;
      status: 'going' | 'interested' | 'not_going';
    }) => {
      const { error } = await api.from('event_attendees').upsert({
        event_id: eventId,
        user_id: (await api.auth.getUser()).data.user?.id,
        status,
      });
      if (error) throw error;

      if (status === 'going' || status === 'interested') {
        await api.from('event_favorites').upsert({
          event_id: eventId,
          user_id: (await api.auth.getUser()).data.user?.id,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const createEvent = useCallback(
    async (event: EventInsert) => {
      try {
        const data = await createMutation.mutateAsync(event);
        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : 'Failed to create event',
        };
      }
    },
    [createMutation],
  );

  const updateEvent = useCallback(
    async (eventId: string, eventData: Partial<EventInsert>) => {
      try {
        const data = await updateMutation.mutateAsync({ id: eventId, eventData });
        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : 'Failed to update event',
        };
      }
    },
    [updateMutation],
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      try {
        await deleteMutation.mutateAsync(eventId);
        return { error: null };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Failed to delete event',
        };
      }
    },
    [deleteMutation],
  );

  const updateAttendance = useCallback(
    async (eventId: string, status: 'going' | 'interested' | 'not_going') => {
      try {
        await attendanceMutation.mutateAsync({ eventId, status });
        return { error: null };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Failed to update attendance',
        };
      }
    },
    [attendanceMutation],
  );

  return {
    events,
    loading,
    isFetching,
    loadingTimedOut,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : String(queryError)
      : null,
    hasMore,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    updateAttendance,
    refetch: () => fetchEvents(currentFilters, currentOptions),
  };
}
