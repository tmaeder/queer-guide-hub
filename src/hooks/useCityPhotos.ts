import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface CityPhoto {
  url: string;
  attribution: string | null;
  license: string | null;
  alt: string | null;
}

interface Row {
  sort_order: number;
  image_assets: {
    id: string;
    url: string | null;
    optimized_url: string | null;
    optimization_status: string | null;
    source_ref: string | null;
    attribution: string | null;
    license: string | null;
    alt_text: string | null;
  } | null;
}

/**
 * Every usable photo linked to a city, one per source photo.
 *
 * The scraper stores a Pexels original AND its R2 mirror as two assets with the
 * same `source_ref`, so counting links overstates the gallery (measured
 * 2026-11-18: 39 cities have two links, 5 have two distinct photos). Deduped on
 * `source_ref`, preferring the R2 mirror.
 */
export function useCityPhotos(cityId: string | null | undefined) {
  return useQuery({
    queryKey: ['city-photos', cityId],
    enabled: !!cityId,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<CityPhoto[]> => {
      const { data, error } = await untypedFrom('image_asset_links')
        .select(
          'sort_order, image_assets!inner(id, url, optimized_url, optimization_status, source_ref, attribution, license, alt_text)',
        )
        .eq('entity_type', 'city')
        .eq('entity_id', cityId!)
        .eq('image_assets.status', 'active')
        .eq('image_assets.is_flagged', false)
        .eq('image_assets.access_level', 'public')
        .in('image_assets.optimization_status', ['optimized', 'cdn_optimized'])
        .order('sort_order');
      if (error) throw error;
      const seen = new Map<string, CityPhoto & { mirrored: boolean }>();
      for (const row of (data ?? []) as unknown as Row[]) {
        const a = row.image_assets;
        const url = a?.optimized_url || a?.url;
        if (!a || !url) continue;
        const key = a.source_ref || a.id;
        const mirrored = a.optimization_status === 'optimized';
        const prev = seen.get(key);
        if (prev && (prev.mirrored || !mirrored)) continue;
        seen.set(key, {
          url,
          attribution: a.attribution,
          license: a.license,
          alt: a.alt_text,
          mirrored,
        });
      }
      return [...seen.values()].map(({ mirrored: _m, ...photo }) => photo);
    },
  });
}
