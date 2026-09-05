import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Keys are `<violation_class>:<entity_type>`, e.g. `country_mismatch:venue`.
 * Only classes that currently have findings appear, so treat this as sparse.
 */
export type GeoContainmentCounts = Record<string, number>;

export interface GeoAddressQueueStats {
  depth: number;
  parked: number;
  /** Null when the queue is empty — distinct from 0, which means "drained just now". */
  oldest_hours: number | null;
  entity_types: Record<string, number>;
}

export interface GeoHygieneStats {
  /**
   * The authority. Zero means geo_boundaries was never loaded, and every
   * containment figure below is vacuous rather than clean — the panel says so
   * explicitly instead of rendering a reassuring row of zeroes.
   */
  boundary_rows: number;
  boundary_cells: number;
  boundary_iso_codes: number;

  containment: GeoContainmentCounts;
  containment_total: number;

  city_coord_defects: number;
  city_coord_defects_with_content: number;

  integrity_violations: Record<string, number>;
  address_queue: GeoAddressQueueStats;

  /** Null when the sweep has never run. */
  findings_age_hours: number | null;
}

/**
 * Coordinate-level geo quality: entities whose coordinate contradicts the
 * country they claim, and cities whose own centroid does.
 *
 * Separate from useGeoAddressGaps because they answer different questions —
 * that one is completeness (what is missing), this one is correctness (what is
 * contradictory). Both read materialised tables; the point-in-polygon sweep is
 * ~30s over the corpus and runs nightly, far too slow for a page load.
 */
export function useGeoHygiene() {
  return useQuery({
    queryKey: ['geo-hygiene-stats'],
    staleTime: 60_000,
    queryFn: async (): Promise<GeoHygieneStats | null> => {
      // Not yet deployed on every environment — the migration chain has been
      // blocked. A missing RPC is reported as "unavailable", never as zero.
      const { data, error } = await supabase.rpc('geo_hygiene_stats' as never);
      if (error) throw error;
      return (data as unknown as GeoHygieneStats) ?? null;
    },
    retry: false,
  });
}
