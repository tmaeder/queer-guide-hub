import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';

export interface CruisingSpot {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  verified: boolean | null;
}

export interface CruisingPresenceArea {
  city_id: string;
  city_name: string;
  city_slug: string;
  latitude: number;
  longitude: number;
  active_count: number;
}

export interface CruisingModeState {
  city_id: string | null;
  enabled_at: string | null;
  expires_at: string | null;
  safety_acknowledged_at: string | null;
}

export interface CruisingBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface CruisingSpotRow extends CruisingSpot {
  total_count: number | string;
}

async function searchSpots(args: {
  search: string;
  bounds?: CruisingBounds | null;
  mappedOnly: boolean;
  limit: number;
  offset: number;
}) {
  const { data, error } = await untypedRpc<CruisingSpotRow[]>('cruising_spots_search', {
    p_search: args.search.trim() || null,
    p_west: args.bounds?.west ?? null,
    p_south: args.bounds?.south ?? null,
    p_east: args.bounds?.east ?? null,
    p_north: args.bounds?.north ?? null,
    p_mapped_only: args.mappedOnly,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw error;
  return (data ?? []).map((spot) => ({
    ...spot,
    latitude: spot.latitude == null ? null : Number(spot.latitude),
    longitude: spot.longitude == null ? null : Number(spot.longitude),
  }));
}

export function useCruisingSpotsList(
  enabled: boolean,
  search: string,
  page: number,
  pageSize = 40,
) {
  return useQuery({
    queryKey: ['cruising-spots', 'list', search, page, pageSize],
    enabled,
    queryFn: async () => {
      const rows = await searchSpots({
        search,
        mappedOnly: false,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return {
        spots: rows.map(({ total_count: _totalCount, ...spot }) => spot),
        total: Number(rows[0]?.total_count ?? 0),
      };
    },
  });
}

export function useCruisingMapSpots(
  enabled: boolean,
  search: string,
  bounds: CruisingBounds | null,
) {
  return useQuery({
    queryKey: ['cruising-spots', 'map', search, bounds],
    enabled,
    queryFn: async () => {
      const rows = await searchSpots({
        search,
        bounds,
        mappedOnly: true,
        limit: 1200,
        offset: 0,
      });
      return rows.map(({ total_count: _totalCount, ...spot }) => spot);
    },
  });
}

export function useCruisingPresenceAreas(enabled: boolean) {
  return useQuery({
    queryKey: ['cruising-presence-areas'],
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await untypedRpc<CruisingPresenceArea[]>('cruising_presence_areas');
      if (error) throw error;
      return ((data ?? []) as CruisingPresenceArea[]).map((area) => ({
        ...area,
        latitude: Number(area.latitude),
        longitude: Number(area.longitude),
        active_count: Number(area.active_count),
      }));
    },
  });
}

export function useMyCruisingMode(enabled: boolean) {
  return useQuery({
    queryKey: ['cruising-presence', 'me'],
    enabled,
    queryFn: async (): Promise<CruisingModeState | null> => {
      const { data, error } = await untypedFrom('intimate_cruising_mode')
        .select('city_id,enabled_at,expires_at,safety_acknowledged_at')
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CruisingModeState | null;
    },
  });
}

export function useSetCruisingPresence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      enabled: boolean;
      cityId?: string | null;
      safetyAcknowledged?: boolean;
    }) => {
      const { data, error } = await untypedRpc<{
        enabled: boolean;
        expires_at: string | null;
        city_id: string | null;
      }>('cruising_presence_set', {
        p_enabled: args.enabled,
        p_city_id: args.cityId ?? null,
        p_duration_minutes: 60,
        p_safety_acknowledged: args.safetyAcknowledged ?? false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cruising-presence'] });
      queryClient.invalidateQueries({ queryKey: ['cruising-presence-areas'] });
    },
  });
}
