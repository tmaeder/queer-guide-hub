import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GeoAddressEntityGap {
  live: number;
  missing_country_id: number;
  missing_state: number;
  missing_postal: number;
}

export interface GeoAddressCityGap {
  live: number;
  missing_region_name: number;
  geocodable_gap: number;
}

export interface GeoAddressQueueHealth {
  depth: number;
  parked: number;
  oldest_enqueued_at: string | null;
}

export interface GeoAddressGaps {
  venues: GeoAddressEntityGap;
  events: GeoAddressEntityGap;
  hotels: GeoAddressEntityGap;
  organizations: GeoAddressEntityGap;
  cities: GeoAddressCityGap;
  queue: GeoAddressQueueHealth;
}

/**
 * Address-completeness gap matrix (state / postal_code / country_id per entity
 * type) plus geo_address_queue health.
 *
 * One RPC rather than a dozen head-counts: the counts are backed by partial
 * indexes added in 20260807100000, and this DB is disk-constrained.
 */
export function useGeoAddressGaps() {
  return useQuery({
    queryKey: ['geo-address-gaps'],
    staleTime: 60_000,
    queryFn: async (): Promise<GeoAddressGaps | null> => {
      const { data, error } = await supabase.rpc('geo_address_gap_counts');
      if (error) throw error;
      return (data as unknown as GeoAddressGaps) ?? null;
    },
  });
}
