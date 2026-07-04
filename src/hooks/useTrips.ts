import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { trackSearchEvent } from '@/lib/searchClient';
import { enqueueMutation } from '@/lib/offline/mutationQueue';

/**
 * Adding a place to a trip is a strong intent signal — feed it to the
 * recommendation engine's bias vector via the same `/track` pipe used by
 * search (event_type 'save'). Custom places have no entity id, so skip them.
 */
function trackPlaceAdded(
  row: { venue_id?: string | null; event_id?: string | null; hotel_id?: string | null },
  userId: string | null,
  source: string,
) {
  const tracked = row.venue_id
    ? { type: 'venue', id: row.venue_id }
    : row.event_id
      ? { type: 'event', id: row.event_id }
      : row.hotel_id
        ? { type: 'hotel', id: row.hotel_id }
        : null;
  if (tracked) void trackSearchEvent('save', tracked, { source }, userId);
}

// ── Types ──────────────────────────────────────────────────────
export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  status: 'planning' | 'active' | 'completed' | 'archived';
  is_public: boolean;
  created_at: string;
  updated_at: string;
  // Geo anchor (required for new trips via app-level validation; legacy rows may be null pre-backfill)
  primary_city_id: string | null;
  primary_country_id: string | null;
  primary_city_name: string | null;
  primary_country_code: string | null;
  timezone: string | null;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  invited_at: string;
  accepted_at: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
}

export interface TripDay {
  id: string;
  trip_id: string;
  date: string;
  title: string | null;
  notes: string | null;
  sort_order: number;
}

export interface TripPlace {
  id: string;
  trip_id: string;
  day_id: string | null;
  venue_id: string | null;
  event_id: string | null;
  hotel_id: string | null;
  custom_name: string | null;
  custom_address: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  category: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  booking_status: 'intent' | 'booked' | 'completed';
  reservation_id: string | null;
  /** Lucide icon slug for `category='note'` rows (see noteIcons.ts). */
  icon?: string | null;
  /** User override for the heuristic route-leg transport mode. */
  arrive_mode?: 'walk' | 'transit' | 'drive' | null;
  // Joined relations
  venues?: { id: string; name: string; category: string | null; images: string[] | null; address: string | null } | null;
  events?: { id: string; title: string; event_type: string | null; start_date: string | null; end_date: string | null; images: string[] | null } | null;
  hotels?: { id: string; name: string; star_rating: number | null; images: string[] | null; address: string | null } | null;
  cities?: { id: string; name: string } | null;
  countries?: { id: string; name: string; code: string | null; equality_score: number | null } | null;
}

export interface TripWithDetails extends Trip {
  trip_members: TripMember[];
  trip_days: TripDay[];
  trip_places: TripPlace[];
}

/**
 * Client-side mirror of the RLS write rule: owners and accepted editors can
 * change a trip; viewers get a read-only UI. RLS stays the source of truth —
 * this only decides which affordances render.
 */
export function canEditTrip(
  trip: Pick<TripWithDetails, 'owner_id' | 'trip_members'>,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (trip.owner_id === userId) return true;
  return trip.trip_members.some(
    (m) => m.user_id === userId && (m.role === 'owner' || m.role === 'editor'),
  );
}

/**
 * Shape accepted by `addPlacesBulk`. `trip_id`/`created_by` are filled by the
 * mutation; `booking_status`/`reservation_id` fall back to their column
 * defaults (intent / null), so callers building rows from search or
 * recommendation hits can omit them.
 */
export type TripPlaceInsert = Omit<
  TripPlace,
  | 'id'
  | 'created_at'
  | 'trip_id'
  | 'created_by'
  | 'venues'
  | 'events'
  | 'hotels'
  | 'cities'
  | 'countries'
  | 'booking_status'
  | 'reservation_id'
> &
  Partial<Pick<TripPlace, 'booking_status' | 'reservation_id'>>;

type CreateTripInput = {
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  currency?: string;
  cover_image_url?: string;
  // Geo anchor — required for new trips (enforced client-side in CreateTripDialog)
  primary_city_id: string;
  primary_country_id: string;
  primary_city_name?: string;
  primary_country_code?: string;
  timezone?: string;
};

type UpdateTripInput = Partial<CreateTripInput> & {
  status?: Trip['status'];
  is_public?: boolean;
};

export type TripListItem = Trip & {
  member_count: number;
  place_count: number;
  day_count: number;
  /**
   * Minimum LGBTQ+ equality score across countries touched by this trip.
   * `null` when no places have countries resolved yet. Used by TripCard
   * to render a safety badge without a second round-trip.
   */
  min_equality_score: number | null;
};

// ── List user's trips ──────────────────────────────────────────
export function useTrips() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['trips', user?.id],
    queryFn: async (): Promise<TripListItem[]> => {
      // Get trips where user is a member
      const { data: memberRows, error: memberErr } = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('user_id', user!.id)
        .not('accepted_at', 'is', null);

      if (memberErr) throw memberErr;
      const tripIds = memberRows?.map((m) => m.trip_id) || [];
      if (tripIds.length === 0) return [];

      const { data, error } = await supabase
        .from('trips')
        .select(
          '*, trip_members(id), trip_days(id), trip_places(id, countries:country_id(equality_score))',
        )
        .in('id', tripIds)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((t: Record<string, unknown>) => {
        const scores: number[] = ((t.trip_places as Array<Record<string, unknown>>) || [])
          .map((p: Record<string, unknown>) => (p.countries as Record<string, unknown>)?.equality_score)
          .filter((s: unknown): s is number => typeof s === 'number');
        const min_equality_score = scores.length ? Math.min(...scores) : null;
        return {
          ...t,
          member_count: t.trip_members?.length || 0,
          place_count: t.trip_places?.length || 0,
          day_count: t.trip_days?.length || 0,
          min_equality_score,
          trip_members: undefined,
          trip_places: undefined,
          trip_days: undefined,
        };
      });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Single trip with full details ──────────────────────────────
export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: async (): Promise<TripWithDetails> => {
      const { data: trip, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId!)
        .single();
      if (error) throw error;

      // Parallel fetch related data
      const [membersRes, daysRes, placesRes] = await Promise.all([
        supabase
          .from('trip_members')
          .select('*, profiles:user_id(display_name, avatar_url)')
          .eq('trip_id', tripId!),
        supabase
          .from('trip_days')
          .select('*')
          .eq('trip_id', tripId!)
          .order('date', { ascending: true }),
        supabase
          .from('trip_places')
          .select(`
            *,
            venues:venue_id(id, name, category, images, address),
            events:event_id(id, title, event_type, start_date, end_date, images),
            hotels:hotel_id(id, name, star_rating, images, address),
            cities:city_id(id, name),
            countries:country_id(id, name, code, equality_score)
          `)
          .eq('trip_id', tripId!)
          .order('sort_order', { ascending: true }),
      ]);

      return {
        ...trip,
        trip_members: (membersRes.data || []) as TripMember[],
        trip_days: (daysRes.data || []) as TripDay[],
        trip_places: (placesRes.data || []) as TripPlace[],
      };
    },
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Mutations ──────────────────────────────────────────────────
export function useTripMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createTrip = useMutation({
    mutationFn: async (input: CreateTripInput) => {
      const { data, error } = await supabase
        .from('trips')
        .insert({ ...input, owner_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as Trip;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  const updateTrip = useMutation({
    mutationFn: async ({ id, ...input }: UpdateTripInput & { id: string }) => {
      const { data, error } = await supabase
        .from('trips')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Trip;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trip', data.id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  const deleteTrip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trips').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  const addPlace = useMutation({
    mutationFn: async (
      input: Omit<TripPlace, 'id' | 'created_at' | 'venues' | 'events' | 'hotels' | 'cities' | 'countries'>,
    ) => {
      const { data, error } = await supabase
        .from('trip_places')
        .insert({ ...input, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trip', data.trip_id] });
      trackPlaceAdded(data, user?.id ?? null, 'trip_add');
    },
  });

  // Bulk-insert several places in a single round-trip with ONE cache
  // invalidation. Looping `addPlace` thrashes the `['trip', id]` query (N
  // refetches) and hits the DB N times — used by the saves→trip bridge and
  // engine-backed suggestions where the user adds many places at once.
  const addPlacesBulk = useMutation({
    mutationFn: async ({ tripId, rows }: { tripId: string; rows: TripPlaceInsert[] }) => {
      if (rows.length === 0) return { tripId, inserted: 0 };
      const { error } = await supabase
        .from('trip_places')
        .insert(rows.map((r) => ({ ...r, trip_id: tripId, created_by: user!.id })));
      if (error) throw error;
      for (const r of rows) trackPlaceAdded(r, user?.id ?? null, 'trip_add_bulk');
      return { tripId, inserted: rows.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trip', data.tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  const updatePlace = useMutation({
    // `trip_id` (optional) routes the offline queue + optimistic cache patch;
    // it is stripped before the UPDATE (never rewrites the column).
    mutationFn: async ({
      id,
      trip_id,
      ...input
    }: {
      id: string;
      trip_id?: string;
      [key: string]: unknown;
    }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueueMutation('trip_places', id, trip_id ?? null, input);
        return { trip_id: trip_id ?? null };
      }
      const { data, error } = await supabase
        .from('trip_places')
        .update(input)
        .eq('id', id)
        .select('trip_id')
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, trip_id, ...input }) => {
      if (!trip_id) return {};
      await queryClient.cancelQueries({ queryKey: ['trip', trip_id] });
      const prev = queryClient.getQueryData<TripWithDetails>(['trip', trip_id]);
      queryClient.setQueryData<TripWithDetails>(['trip', trip_id], (old) =>
        old
          ? {
              ...old,
              trip_places: old.trip_places.map((p) =>
                p.id === id ? { ...p, ...input } : p,
              ),
            }
          : old,
      );
      return { prev, trip_id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev && ctx.trip_id) queryClient.setQueryData(['trip', ctx.trip_id], ctx.prev);
    },
    onSuccess: (data) => {
      if (data.trip_id && (typeof navigator === 'undefined' || navigator.onLine)) {
        queryClient.invalidateQueries({ queryKey: ['trip', data.trip_id] });
      }
    },
  });

  const removePlace = useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('trip_places').delete().eq('id', id);
      if (error) throw error;
      return { tripId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trip', data.tripId] });
    },
  });

  const updateDay = useMutation({
    mutationFn: async ({ id, ...input }: { id: string; title?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('trip_days')
        .update(input)
        .eq('id', id)
        .select('trip_id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trip', data.trip_id] });
    },
  });

  return {
    createTrip,
    updateTrip,
    deleteTrip,
    addPlace,
    addPlacesBulk,
    updatePlace,
    removePlace,
    updateDay,
  };
}
