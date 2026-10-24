import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { hashKey, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { mirrorRsvp } from '@/hooks/blueskyActivity';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { calculateDistanceKm } from '@/utils/calculateDistance';
import { queryWithRetry } from '@/utils/fetchWithRetry';
import { dedupeEvents } from '@/utils/eventDedup';
import { orderUpcoming } from '@/lib/eventOrdering';

type Event = Database['public']['Tables']['events']['Row'];

/**
 * PostgREST spelling of `COALESCE(end_date, start_date) >= iso`, the predicate
 * `search_events` uses for both "is this still on" and the lower bound of a date
 * window (20320201100300:53-60).
 *
 * `coalesce` is not expressible in a PostgREST filter, so the null case is
 * written out: a row with an end date is judged on it, a row without one falls
 * back to its start. Both arms are required — testing `end_date` alone silently
 * drops the 22,840 events that have none, which is the larger half of the table.
 *
 * Passed to `.or()`. Repeated `.or()` calls on one query are ANDed by PostgREST,
 * so this composes with the city and featured branches rather than replacing
 * them.
 */
export function endsAtOrAfter(iso: string): string {
  return `end_date.gte.${iso},and(end_date.is.null,start_date.gte.${iso})`;
}

export type EventFilters = {
  city?: string;
  /** Stable city identity. Prefer this over the display label whenever available. */
  cityId?: string;
  cities?: string[];
  countryId?: string;
  /**
   * Events held at one of these venues. The only way to scope events to a
   * queer village: `events` has no village FK, so a village's events are
   * the events at the venues linked to it. `/villages/:slug` previously
   * asked for the whole PARENT CITY's events, so Chueca advertised
   * everything happening anywhere in Madrid as if it were on the strip.
   * Forces the client-query path — `search_events` takes no venue filter.
   */
  venueIds?: string[];
  eventType?: string;
  eventTypes?: string[];
  dateRange?: { start: string; end: string };
  tags?: string[];
  accessibilityAttributes?: string[];
  targetGroups?: string[];
  languages?: string[];
  ageRestriction?: string;
  organizerId?: string;
  search?: string;
  nearMe?: { lat: number; lng: number };
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  limit?: number;
  includePast?: boolean;
  featured?: boolean;
  isFree?: boolean;
  sort?: 'date-asc' | 'date-desc' | 'popularity' | 'distance' | 'recent';
};

export interface EventsPageOptions {
  /** 1-based. Omit for an unpaged query (capped by `filters.limit` or 1000). */
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/**
 * One events query, with no React state: the RPC-or-client-query choice, the
 * client-side dedupe, upcoming ordering, attendee counts and the nearMe
 * filter. Both `useEventsFeed` and `useEventsQuery` run through it,
 * so the two cannot drift. Returns null when `signal` aborted mid-flight.
 */
export async function fetchEventsPage(
  filters: EventFilters | undefined,
  options: EventsPageOptions = {},
): Promise<{ events: Event[]; count: number | null } | null> {
  const signal = options.signal;
  if (signal?.aborted) return null;
  const page = options.page;
  const pageSize = options.pageSize ?? 24;

  // Route through search_events RPC when we need accent-insensitive
  // city match or overlap-aware date filtering. Geo-bounds / nearMe
  // still use the legacy client query below (RPC has no geo filter).
  const useRpc =
    !filters?.bounds &&
    !filters?.nearMe &&
    !filters?.featured &&
    !filters?.isFree &&
    !filters?.sort &&
    !filters?.cities?.length &&
    !filters?.eventTypes?.length &&
    !filters?.venueIds?.length &&
    !filters?.languages?.length &&
    !filters?.ageRestriction &&
    !filters?.organizerId &&
    !filters?.tags?.length &&
    (Boolean(filters?.cityId) || Boolean(filters?.city) || Boolean(filters?.dateRange));

  let data: Event[] | null;
  let error: Error | null = null;
  let count: number | null;

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
        p_city: filters?.city,
        p_city_id: filters?.cityId,
        p_country_id: filters?.countryId,
        p_event_type: filters?.eventType,
        p_start: filters?.dateRange?.start,
        p_end: filters?.dateRange?.end,
        p_tags: filters?.tags?.length ? filters.tags : undefined,
        p_accessibility_attributes: filters?.accessibilityAttributes?.length
          ? filters.accessibilityAttributes
          : undefined,
        p_target_groups: filters?.targetGroups?.length ? filters.targetGroups : undefined,
        p_search: filters?.search,
        p_include_past: filters?.includePast ?? false,
        p_limit: limit,
        p_offset: offset,
      });
      return signal ? q.abortSignal(signal) : q;
    })) as {
      data: Array<{ total: number | string; event: Event }> | null;
      error: Error | null;
    };

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

    // Collapse a recurring series to its next occurrence. 70.9% of the
    // upcoming feed was repeat dates of 289 same-title/city groups — one
    // Zürich library's opening hours appeared 112 times — which the dedup
    // engine correctly refuses to merge because each date carries its own
    // description and ticket URL (see migration 20320201100000).
    //
    // Applied ONLY in the undifferentiated browse case: a reader who asked
    // for a date range wants the occurrences inside it, and hiding all but
    // one would drop dates they explicitly asked to see. `search_events`
    // derives this exact condition from its own parameters, so both query
    // paths collapse identically — the two diverging is what let 598 merged
    // duplicates keep showing on the city-filtered feed.
    //
    // The same clause also hides a festival's programme children — a
    // "lila Queer Festival" umbrella published four cards, one per day
    // (see 20320201100200). A series repeat and a festival day-part are the
    // same thing to a reader: a row represented in the feed by something
    // else. `search_events` folds both into one condition for the same
    // reason, so the two paths cannot drift apart.
    if (!filters?.includePast && !filters?.dateRange) {
      query = query.eq('series_next', true).is('parent_event_id', null);
    }

    const sort = filters?.sort ?? 'date-asc';
    if (sort === 'date-desc') {
      query = query
        .order('is_featured', { ascending: false })
        .order('start_date', { ascending: false });
    } else if (sort === 'recent') {
      query = query.order('created_at', { ascending: false });
    } else {
      // date-asc (default), distance (client-side after fetch), popularity
      // (no attendance_count column yet — fall back to featured + date)
      query = query
        .order('is_featured', { ascending: false })
        .order('start_date', { ascending: filters?.includePast ? false : true });
    }

    const nowIso = new Date().toISOString();
    if (filters?.includePast) {
      query = query.lte('start_date', nowIso);
    } else {
      // An event that has STARTED but not ENDED is upcoming to a reader —
      // a four-day festival on its second day is the most relevant row on
      // the page, and `gte('start_date', now)` dropped it. `search_events`
      // has always used `COALESCE(end_date, start_date) >= now()` here
      // (20320201100300:53-54); this path did not, so the same filter
      // returned different sets depending on which branch it took.
      query = query.or(endsAtOrAfter(nowIso));
    }

    if (filters?.eventTypes?.length) {
      query = query.in('event_type', filters.eventTypes);
    } else if (filters?.eventType) {
      query = query.eq('event_type', filters.eventType);
    }

    if (filters?.featured) {
      // D5: the "Featured" preset must reflect what the page shows as
      // spotlight. Production currently has 0 upcoming events with
      // is_featured=true; the EventsHeroSpotlight falls back to pride /
      // festival events. Mirror that fallback so the preset returns
      // something meaningful instead of always being empty.
      query = query.or('is_featured.eq.true,event_type.in.(pride,festival)');
    }

    if (filters?.isFree) {
      query = query.eq('is_free', true);
    }

    if (filters?.countryId && !filters?.cityId) {
      query = query.eq('country_id', filters.countryId);
    }

    if (filters?.venueIds?.length) {
      // Capped: a PostgREST `in()` is serialised into the URL and starts
      // failing silently somewhere past ~600 ids. A village with more
      // venues than this is not a walkable cluster anyway.
      query = query.in('venue_id', filters.venueIds.slice(0, 400));
    }

    if (filters?.cities?.length) {
      // ilike on a list — use or() with multiple ilike clauses
      // Multi-city: chained OR with sanitized ilike clauses
      const parts = filters.cities.map((c) => `city.ilike.${c.replace(/[,()*]/g, '')}`);
      query = query.or(parts.join(','));
    } else if (filters?.cityId) {
      // The RPC path normally handles city pages, including its guarded
      // legacy fallback. If another filter forces this direct path, fail
      // closed to the stable FK rather than reintroducing namesake leaks.
      query = query.eq('city_id', filters.cityId);
    } else if (filters?.city) {
      query = query.ilike('city', filters.city);
    }

    if (filters?.languages?.length) {
      query = query.in('content_language', filters.languages);
    }

    if (filters?.ageRestriction) {
      query = query.eq('age_restriction', filters.ageRestriction);
    }

    if (filters?.organizerId) {
      query = query.eq('group_id', filters.organizerId);
    }

    if (filters?.dateRange) {
      // OVERLAP, not containment. A festival running 1-7 July must appear
      // for a 3-5 July filter; `gte('start_date', from)` excluded it
      // because it started before the window. Mirrors search_events
      // (20320201100300:59-60) so the two paths agree — any city / type /
      // tag / sort filter forces this branch, which is the normal case
      // from /events, so the divergence was the one users actually hit.
      query = query
        .lte('start_date', filters.dateRange.end)
        .or(endsAtOrAfter(filters.dateRange.start));
    }

    if (filters?.tags && filters.tags.length > 0) {
      // `events.tags` (added 20260607220000) is the tag surface the search_events RPC
      // path already filters on. This branch used to hit `pride_subtypes`, which no
      // code has ever written, so the same UI control returned results via the RPC
      // path and nothing via this one.
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

    const result = (await queryWithRetry(() => (signal ? query.abortSignal(signal) : query))) as {
      data: Event[] | null;
      error: Error | null;
      count: number | null;
    };
    data = result.data;
    error = result.error;
    count = result.count;
  }

  if (signal?.aborted) return null;
  if (error) throw error;

  // D2 client-side safety net for near-duplicates the ingestion pipeline
  // missed (language variants, slight city-name spellings). Pairs like
  // "International Mr Leather" + "Internationaler Herr Leder" share venue
  // + day but slip past duplicate_of_id linking.
  let eventsData = dedupeEvents((data as Event[]) || []);

  // Now that the query admits in-progress events, `start_date ASC` ranks
  // them by how long ago they began — see src/lib/eventOrdering.ts. Only
  // the default ascending feed; the other sorts order by something else.
  const defaultSort = !filters?.sort || filters.sort === 'date-asc';
  if (!filters?.includePast && defaultSort) {
    eventsData = orderUpcoming(eventsData, Date.now());
  }

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
      .sort(
        (a: Event & { distance: number }, b: Event & { distance: number }) =>
          a.distance - b.distance,
      );
  }

  return { events: eventsData, count };
}

/** RSVP: upsert the viewer's attendance and auto-favourite on going/interested. */
export async function updateEventAttendance(
  eventId: string,
  status: 'going' | 'interested' | 'not_going',
) {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('Sign in to update attendance.');
    // D4: onConflict is required — table PK is `id`, uniqueness lives on
    // (event_id, user_id). Without it the second click hits a 23505 and
    // we surface "Failed to update attendance".
    const { error } = await supabase
      .from('event_attendees')
      .upsert({ event_id: eventId, user_id: userId, status }, { onConflict: 'event_id,user_id' });

    if (error) throw error;
    mirrorRsvp(eventId, status);

    // Auto-add to favorites when going or interested
    if (status === 'going' || status === 'interested') {
      await supabase.from('event_favorites').upsert({
        event_id: eventId,
        user_id: userId,
      });
    }

    return { error: null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update attendance',
    };
  }
}

interface FeedRequest {
  filters: EventFilters;
  paged: boolean;
  pageSize: number;
}

const FEED_PAGE_SIZE = 24;

/**
 * The paged /events feed on useInfiniteQuery.
 *
 * `useEventFilters` still decides WHICH request runs and when — presets, near
 * me and the timeline viewport each build their own filter set — and calls
 * `fetchEvents(filters, { page: 1, pageSize })` to issue it. That call now just
 * records the request; the query key is the request, so:
 *
 * - the newest request wins by construction, which is what the hand-rolled
 *   request-sequence counter used to enforce;
 * - "Load more" (`loadMore`) asks for the next page of the SAME request, so a
 *   page can never be appended under a list built from different filters;
 * - issuing the identical request again (RSVP refresh, error retry) refetches.
 *
 * Keyed on the viewer: events are safety-gated and the cache is not cleared
 * on sign-out.
 */
export function useEventsFeed() {
  const { user } = useAuth();
  const viewer = user?.id ?? 'anon';
  const [request, setRequest] = useState<FeedRequest | null>(null);
  const requestRef = useRef<FeedRequest | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['events-feed', viewer, request],
    enabled: request !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const r = request!;
      const result = await fetchEventsPage(
        r.filters,
        r.paged ? { page: pageParam, pageSize: r.pageSize, signal } : { signal },
      );
      return result ?? { events: [], count: null };
    },
    getNextPageParam: (last, _all, lastPage) => {
      const r = request;
      if (!r?.paged || typeof last.count !== 'number') return undefined;
      return (lastPage - 1) * r.pageSize + last.events.length < last.count
        ? lastPage + 1
        : undefined;
    },
  });

  const { data, refetch, fetchNextPage } = query;
  const events = useMemo(() => {
    if (!data) return NO_EVENTS;
    // Same merge the append path used: dedupe by id across pages.
    const merged = data.pages.flatMap((p) => p.events);
    return Array.from(new Map(merged.map((e) => [e.id, e])).values());
  }, [data]);

  const fetchEvents = useCallback(
    async (filters?: EventFilters, options?: { page?: number; pageSize?: number }) => {
      const next: FeedRequest = {
        filters: filters ?? {},
        paged: typeof options?.page === 'number',
        pageSize: options?.pageSize ?? FEED_PAGE_SIZE,
      };
      // A ref, not the state: two calls in one tick must compare against each
      // other, and the refetch must not run inside a state updater.
      const prev = requestRef.current;
      if (prev && hashKey([prev]) === hashKey([next])) {
        void refetch();
        return;
      }
      requestRef.current = next;
      setRequest(next);
    },
    [refetch],
  );

  const loadMore = useCallback(async () => {
    await fetchNextPage();
  }, [fetchNextPage]);

  const { data: datasetTotal = null } = useQuery({
    // Unfiltered COUNT(*) for "showing N of M". RLS hides gated rows from
    // anon, so the total is per viewer too.
    queryKey: ['events-dataset-total', viewer],
    queryFn: async () => {
      const { count } = await supabase
        .from('events')
        .select('id', { head: true, count: 'exact' })
        .is('duplicate_of_id', null);
      return count ?? 0;
    },
  });

  const loading = query.isLoading;
  const requestHash = hashKey([viewer, request]);
  const [timedOutFor, setTimedOutFor] = useState<string | null>(null);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOutFor(requestHash), 15000);
    return () => clearTimeout(timer);
  }, [loading, requestHash]);

  return {
    events,
    loading,
    loadingMore: query.isFetchingNextPage,
    loadingTimedOut: loading && timedOutFor === requestHash,
    error: query.error ? query.error.message || 'Failed to fetch events' : null,
    hasMore: query.hasNextPage,
    datasetTotal,
    fetchEvents,
    loadMore,
  };
}

// Stable empty fallback so consumers' memos/effects don't re-run every render.
const NO_EVENTS: Event[] = [];

/**
 * Declarative events list for surfaces that show one filtered slice (a city,
 * a country, a village's venues, the map viewport). The paged /events feed
 * is `useEventsFeed`.
 *
 * `filters: null` stays idle — pass it while the scope (city id, venue ids…)
 * is still loading, so no unscoped query fires first.
 *
 * Events are safety-gated by RLS and the query cache is not cleared on
 * sign-out, so the key carries the viewer: a signed-in result can never be
 * served to an anonymous visitor. `keepPrevious` holds the last result on
 * screen while a new filter loads (the map pans), but never across viewers.
 */
export function useEventsQuery(filters: EventFilters | null, opts?: { keepPrevious?: boolean }) {
  const { user } = useAuth();
  const viewer = user?.id ?? 'anon';
  const query = useQuery<Event[]>({
    queryKey: ['events', viewer, filters],
    enabled: filters !== null,
    placeholderData: opts?.keepPrevious
      ? (prev, prevQuery) => (prevQuery?.queryKey[1] === viewer ? prev : undefined)
      : undefined,
    queryFn: async ({ signal }) => {
      const result = await fetchEventsPage(filters ?? undefined, { signal });
      return result?.events ?? NO_EVENTS;
    },
  });
  return {
    events: query.data ?? NO_EVENTS,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? query.error.message || 'Failed to fetch events' : null,
  };
}
