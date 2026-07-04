import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useMyPlaceMarks } from '@/hooks/usePlaceMarks';

export interface AtlasCountry {
  countryId: string;
  /** ISO2 (countries.code) — joins to boundary GeoJSON ISO_A2. */
  code: string | null;
  name: string;
  visitedFromTrips: boolean;
  visitedManual: boolean;
  bucket: boolean;
}

export interface CountryLookupRow {
  id: string;
  code: string | null;
  name: string;
}

/** id/code/name for every country — cheap (~250 rows), cached long. */
export function useCountryLookup() {
  return useQuery({
    queryKey: ['countries-lookup-codes'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<CountryLookupRow[]> => {
      const { data, error } = await supabase
        .from('countries')
        .select('id, code, name')
        .is('duplicate_of_id', null);
      if (error) throw error;
      return (data ?? []) as CountryLookupRow[];
    },
  });
}

/**
 * Atlas data: visited countries (derived from completed trips + manual
 * 'country' marks) and the bucket list ('country' marks of kind 'saved').
 */
export function useAtlas() {
  const { user } = useAuth();
  const { data: marks = [], isLoading: marksLoading } = useMyPlaceMarks();
  const { data: lookup = [], isLoading: lookupLoading } = useCountryLookup();

  const tripCountries = useQuery({
    queryKey: ['atlas-trip-countries', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Array<{ country_id: string }>> => {
      const { data, error } = await untypedFrom('trip_visited_countries')
        .select('country_id')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ country_id: string }>;
    },
  });

  const countries = useMemo((): AtlasCountry[] => {
    const byId = new Map<string, AtlasCountry>();
    const meta = new Map(lookup.map((c) => [c.id, c]));
    const ensure = (id: string): AtlasCountry => {
      let row = byId.get(id);
      if (!row) {
        const m = meta.get(id);
        row = {
          countryId: id,
          code: m?.code ?? null,
          name: m?.name ?? 'Unknown',
          visitedFromTrips: false,
          visitedManual: false,
          bucket: false,
        };
        byId.set(id, row);
      }
      return row;
    };
    for (const r of tripCountries.data ?? []) ensure(r.country_id).visitedFromTrips = true;
    for (const m of marks) {
      if (m.entity_type !== 'country') continue;
      if (m.mark_type === 'visited') ensure(m.entity_id).visitedManual = true;
      if (m.mark_type === 'saved') ensure(m.entity_id).bucket = true;
    }
    return [...byId.values()];
  }, [marks, tripCountries.data, lookup]);

  return {
    countries,
    lookup,
    isLoading: marksLoading || lookupLoading || tripCountries.isLoading,
  };
}

/** Toggle a country-level mark (visited / saved-as-bucket-list). */
export function useToggleCountryMark() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      countryId,
      kind,
      on,
    }: {
      countryId: string;
      kind: 'visited' | 'saved';
      on: boolean;
    }) => {
      if (!user) throw new Error('not signed in');
      if (on) {
        const { error } = await untypedFrom('user_place_marks').insert({
          user_id: user.id,
          entity_type: 'country',
          entity_id: countryId,
          mark_type: kind,
        });
        // 23505 = already marked (double click) — treat as success.
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await untypedFrom('user_place_marks')
          .delete()
          .eq('user_id', user.id)
          .eq('entity_type', 'country')
          .eq('entity_id', countryId)
          .eq('mark_type', kind);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      if (user) void qc.invalidateQueries({ queryKey: ['place_marks', user.id] });
    },
  });
}
