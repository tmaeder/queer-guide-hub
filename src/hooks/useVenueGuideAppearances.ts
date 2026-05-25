import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type PickRow = Database['public']['Tables']['venue_guide_picks']['Row'];
type GuideRow = Database['public']['Tables']['venue_guides']['Row'];

export type VenueGuideAppearance = Pick<
  PickRow,
  'id' | 'tier' | 'rationale_md' | 'position'
> & {
  guide: Pick<
    GuideRow,
    'id' | 'slug' | 'title' | 'dek' | 'hero_image_path' | 'category' | 'pick_count' | 'reading_time_min' | 'published_at'
  >;
};

/**
 * Every published venue guide that features this venue. Powers the
 * "Featured in" callout on VenueDetail.
 */
export function useVenueGuideAppearances(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-guide-appearances', venueId],
    queryFn: async (): Promise<VenueGuideAppearance[]> => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from('venue_guide_picks')
        .select(
          `id, tier, rationale_md, position,
           guide:venue_guides!inner(id, slug, title, dek, hero_image_path, category, pick_count, reading_time_min, published_at, status)`,
        )
        .eq('venue_id', venueId);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<VenueGuideAppearance & { guide: { status: string } }>)
        .filter((r) => r.guide.status === 'published')
        .map(({ guide, ...rest }) => ({ ...rest, guide }));
    },
    enabled: !!venueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * All published venue guides scoped to a particular city.
 * Powers the "Guides for this city" rail on CityDetail.
 */
export function useCityVenueGuides(cityId: string | undefined) {
  return useQuery({
    queryKey: ['city-venue-guides', cityId],
    queryFn: async (): Promise<VenueGuideAppearance['guide'][]> => {
      if (!cityId) return [];
      const { data, error } = await supabase
        .from('venue_guides')
        .select(
          'id, slug, title, dek, hero_image_path, category, pick_count, reading_time_min, published_at',
        )
        .eq('city_id', cityId)
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!cityId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
