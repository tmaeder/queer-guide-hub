import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { supabase } from '@/integrations/supabase/client';
import type { GeoNode } from './useGeoPlaces';

export type GeographyType = 'country' | 'city' | 'village';
export interface GeographyRecord extends GeoNode {
  place_type: GeographyType;
  parent_id: string | null;
  country_id: string;
  city_id: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string;
  path: string;
  country_name: string;
  country_code: string;
  city_name: string | null;
  region_code?: string | null;
  region_name?: string | null;
  source_table: 'countries' | 'cities' | 'queer_villages';
  workflow_state: string | null;
  seo_indexable: boolean;
  verification_status:
    'verified' | 'review' | 'missing' | 'stale' | 'country_checked' | 'not_applicable';
  verification: null | {
    checked_at: string;
    checks: {
      reason?: string;
      distance_to_city_m?: number;
      external_distance_m?: number;
      [key: string]: unknown;
    };
    sources: Array<{ title: string; url: string; version?: string }>;
  };
}
interface GeographyPage {
  rows: GeographyRecord[];
  total: number;
}
export interface GeographyFilters {
  search: string;
  type: GeographyType | null;
  continent: string | null;
  region: string | null;
  status?: GeographyRecord['verification_status'] | null;
}
export const geographyLabels: Record<GeographyType, string> = {
  country: 'Country',
  city: 'City',
  village: 'Queer village',
};
export const verificationLabels: Record<GeographyRecord['verification_status'], string> = {
  verified: 'Verified',
  review: 'Needs review',
  missing: 'Missing evidence',
  stale: 'Stale',
  country_checked: 'Country checked',
  not_applicable: 'Archived and unused',
};

export function useGeographyRows(parentId: string | null, filters: GeographyFilters) {
  return useInfiniteQuery({
    queryKey: ['geography-cms', 'rows', parentId, filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<GeographyPage> => {
      const { data, error } = await untypedRpc<GeographyPage>('geo_cms_browse', {
        p_parent_id: parentId,
        p_search: filters.search,
        p_type: filters.type,
        p_offset: pageParam,
        p_continent_id: filters.continent,
        p_region_id: filters.region,
        p_status: filters.status ?? null,
      });
      if (error) throw new Error(error.message);
      return data ?? { rows: [], total: 0 };
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    refetchInterval: 30000,
  });
}
export function useGeographyRecord(id: string | null) {
  return useQuery({
    queryKey: ['geography-cms', 'record', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await untypedRpc<GeographyRecord>('geo_cms_record', { p_id: id });
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 30000,
  });
}
export function useGeographyFilters() {
  return useQuery({
    queryKey: ['geography-cms', 'filters'],
    queryFn: async () => {
      const [continents, regions] = await Promise.all([
        supabase.from('continents').select('id,name').order('name'),
        supabase.from('regions').select('id,name,continent_id').order('name'),
      ]);
      if (continents.error) throw continents.error;
      if (regions.error) throw regions.error;
      return { continents: continents.data ?? [], regions: regions.data ?? [] };
    },
  });
}
export function useVerifyGeography() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke<GeographyRecord>('geography-verify', {
        body: { id },
      });
      if (error) {
        const details =
          'context' in error && error.context instanceof Response
            ? await error.context.json().catch(() => null)
            : null;
        throw new Error(details?.error ?? error.message);
      }
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['geography-cms'] });
    },
  });
}
export function useMoveGeography(record: GeographyRecord) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (parentId: string) => {
      const { error } = await untypedRpc('geo_cms_move', {
        p_id: record.id,
        p_new_parent_id: parentId,
        p_expected_updated_at: record.updated_at,
      });
      if (error) throw new Error(error.message);
    },
    // A parent move affects content lists, maps, search, safety and geography.
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}
