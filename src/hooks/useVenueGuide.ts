import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['venue_guides']['Row'];
type PickRow = Database['public']['Tables']['venue_guide_picks']['Row'];
type SectionRow = Database['public']['Tables']['venue_guide_sections']['Row'];
type VenueRow = Database['public']['Tables']['venues']['Row'];

export type VenuePickWithVenue = PickRow & {
  venue: Pick<
    VenueRow,
    | 'id'
    | 'slug'
    | 'name'
    | 'description'
    | 'images'
    | 'category'
    | 'address'
    | 'city'
    | 'city_id'
  > | null;
};

export interface VenueGuideDetail {
  guide: GuideRow;
  picks: VenuePickWithVenue[];
  sections: SectionRow[];
}

const TIER_ORDER: Record<PickRow['tier'], number> = {
  top: 0,
  also_great: 1,
  upgrade: 2,
  budget: 3,
  avoid: 4,
};

export function useVenueGuide(slug: string | undefined) {
  return useQuery({
    queryKey: ['venue-guide', slug],
    queryFn: async (): Promise<VenueGuideDetail | null> => {
      if (!slug) return null;
      const { data: guide, error: gerr } = await supabase
        .from('venue_guides')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (gerr) throw gerr;
      if (!guide) return null;

      const [picksRes, sectionsRes] = await Promise.all([
        supabase
          .from('venue_guide_picks')
          .select(
            `*, venue:venues(id, slug, name, description, images, category, address, city, city_id)`,
          )
          .eq('guide_id', guide.id),
        supabase
          .from('venue_guide_sections')
          .select('*')
          .eq('guide_id', guide.id)
          .order('position', { ascending: true }),
      ]);
      if (picksRes.error) throw picksRes.error;
      if (sectionsRes.error) throw sectionsRes.error;

      const picks = (picksRes.data ?? []).slice().sort((a, b) => {
        const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        if (tierDiff !== 0) return tierDiff;
        return a.position - b.position;
      }) as VenuePickWithVenue[];

      return { guide, picks, sections: sectionsRes.data ?? [] };
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useVenueGuidesIndex() {
  return useQuery({
    queryKey: ['venue-guides-index'],
    queryFn: async (): Promise<GuideRow[]> => {
      const { data, error } = await supabase
        .from('venue_guides')
        .select('*')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
