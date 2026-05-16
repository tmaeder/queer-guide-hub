import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type PlaceMarkEntity = 'venue' | 'event' | 'village';
export type PlaceMarkKind = 'visited' | 'saved' | 'contributed';

export interface PlaceMark {
  id: string;
  user_id: string;
  entity_type: PlaceMarkEntity;
  entity_id: string;
  mark_type: PlaceMarkKind;
  city_id: string | null;
  is_public: boolean;
  note: string | null;
  marked_at: string;
  trip_id: string | null;
  photo_urls: string[] | null;
  journal_note: string | null;
  rating: number | null;
}

const QK = {
  all: (uid: string) => ['place_marks', uid] as const,
  forEntity: (uid: string, type: PlaceMarkEntity, id: string) =>
    ['place_marks', uid, type, id] as const,
  cityTotals: (cityId: string) => ['city_markable_totals', cityId] as const,
};

export function useMyPlaceMarks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: user ? QK.all(user.id) : ['place_marks', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_place_marks')
        .select('*')
        .order('marked_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PlaceMark[];
    },
  });
}

export function useEntityMarks(entity_type: PlaceMarkEntity, entity_id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: user && entity_id ? QK.forEntity(user.id, entity_type, entity_id) : ['place_marks', 'noop'],
    enabled: !!user && !!entity_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_place_marks')
        .select('*')
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id!);
      if (error) throw error;
      return (data || []) as PlaceMark[];
    },
  });
}

export function useTogglePlaceMark() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entity_type: PlaceMarkEntity;
      entity_id: string;
      mark_type: PlaceMarkKind;
      is_public?: boolean;
      note?: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const { data: existing } = await supabase
        .from('user_place_marks')
        .select('id')
        .eq('user_id', user.id)
        .eq('entity_type', input.entity_type)
        .eq('entity_id', input.entity_id)
        .eq('mark_type', input.mark_type)
        .maybeSingle();

      if (existing) {
        const { error } = await untypedFrom('user_place_marks').delete().eq('id', existing.id);
        if (error) throw error;
        return { removed: true };
      }
      const { error } = await untypedFrom('user_place_marks').insert({
        user_id: user.id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        mark_type: input.mark_type,
        is_public: input.is_public ?? false,
        note: input.note ?? null,
      });
      if (error) throw error;
      return { removed: false };
    },
    onSuccess: () => {
      if (user) qc.invalidateQueries({ queryKey: ['place_marks', user.id] });
    },
  });
}

export function useFootprintEntities(ids: {
  venue: string[];
  event: string[];
  village: string[];
}) {
  const enabled = ids.venue.length + ids.event.length + ids.village.length > 0;
  return useQuery({
    queryKey: ['footprint-entities', ids],
    enabled,
    queryFn: async () => {
      const [venues, events, villages] = await Promise.all([
        ids.venue.length
          ? untypedFrom('venues')
              .select('id,name,slug,latitude,longitude,city_id,cities(name,slug)')
              .in('id', ids.venue)
          : Promise.resolve({ data: [], error: null }),
        ids.event.length
          ? untypedFrom('events')
              .select('id,title,slug,latitude,longitude,city_id,cities(name,slug)')
              .in('id', ids.event)
          : Promise.resolve({ data: [], error: null }),
        ids.village.length
          ? untypedFrom('queer_villages')
              .select('id,name,slug,latitude,longitude,city_id,cities(name,slug)')
              .in('id', ids.village)
          : Promise.resolve({ data: [], error: null }),
      ]);
      return {
        venue: (venues.data || []) as unknown as FootprintVenue[],
        event: (events.data || []) as unknown as FootprintEvent[],
        village: (villages.data || []) as unknown as FootprintVillage[],
      };
    },
  });
}

export interface FootprintCityRef {
  name: string;
  slug: string;
}
export interface FootprintVenue {
  id: string;
  name: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  cities: FootprintCityRef | null;
}
export interface FootprintEvent {
  id: string;
  title: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  cities: FootprintCityRef | null;
}
export interface FootprintVillage {
  id: string;
  name: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  cities: FootprintCityRef | null;
}

export function useFootprintCityTotals(cityIds: string[]) {
  return useQuery({
    queryKey: ['footprint-city-totals', cityIds],
    enabled: cityIds.length > 0,
    queryFn: async () => {
      const totals: Record<string, number> = {};
      await Promise.all(
        cityIds.map(async (cid) => {
          const { data } = await untypedSupabase.rpc('city_markable_totals', { p_city_id: cid });
          totals[cid] = ((data as Array<{ total: number }> | null) || []).reduce(
            (acc, row) => acc + Number(row.total || 0),
            0,
          );
        }),
      );
      return totals;
    },
  });
}

export function useCityMarkableTotals(city_id: string | undefined) {
  return useQuery({
    queryKey: city_id ? QK.cityTotals(city_id) : ['city_markable_totals', 'noop'],
    enabled: !!city_id,
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('city_markable_totals', { p_city_id: city_id! });
      if (error) throw error;
      return (data || []) as Array<{ entity_type: PlaceMarkEntity; total: number }>;
    },
  });
}
