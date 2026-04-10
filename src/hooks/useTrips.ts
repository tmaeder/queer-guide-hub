import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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

type CreateTripInput = {
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  currency?: string;
  cover_image_url?: string;
};

type UpdateTripInput = Partial<CreateTripInput> & {
  status?: Trip['status'];
  is_public?: boolean;
};

export type TripListItem = Trip & {
  member_count: number;
  place_count: number;
  day_count: number;
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
        .select('*, trip_members(id), trip_places(id), trip_days(id)')
        .in('id', tripIds)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        member_count: t.trip_members?.length || 0,
        place_count: t.trip_places?.length || 0,
        day_count: t.trip_days?.length || 0,
        trip_members: undefined,
        trip_places: undefined,
        trip_days: undefined,
      }));
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
    },
  });

  const updatePlace = useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('trip_places')
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

  return { createTrip, updateTrip, deleteTrip, addPlace, updatePlace, removePlace, updateDay };
}
