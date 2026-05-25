import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type PickRow = Database['public']['Tables']['marketplace_guide_picks']['Row'];
type GuideRow = Database['public']['Tables']['marketplace_guides']['Row'];

export type GuideAppearance = Pick<
  PickRow,
  'id' | 'tier' | 'rationale_md' | 'position'
> & {
  guide: Pick<
    GuideRow,
    'id' | 'slug' | 'title' | 'dek' | 'hero_image_path' | 'category_slug' | 'pick_count' | 'reading_time_min' | 'published_at'
  >;
};

/**
 * Reverse lookup: every published guide that features this listing.
 * Powers the "Featured in" callout on /marketplace/p/:slug.
 */
export function useListingGuideAppearances(listingId: string | undefined) {
  return useQuery({
    queryKey: ['listing-guide-appearances', listingId],
    queryFn: async (): Promise<GuideAppearance[]> => {
      if (!listingId) return [];
      const { data, error } = await supabase
        .from('marketplace_guide_picks')
        .select(
          `id, tier, rationale_md, position,
           guide:marketplace_guides!inner(id, slug, title, dek, hero_image_path, category_slug, pick_count, reading_time_min, published_at, status)`,
        )
        .eq('listing_id', listingId);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<GuideAppearance & { guide: { status: string } }>)
        .filter((r) => r.guide.status === 'published')
        .map(({ guide, ...rest }) => ({ ...rest, guide }));
    },
    enabled: !!listingId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * All published guides that feature any listing from this merchant.
 * Powers the "Featured in N guides" rail on /marketplace/m/:domain.
 *
 * Two-step query because PostgREST can't filter the joined-table predicate
 * "guide.status='published'" via a single nested select without losing the
 * merchant filter on the listings join. We resolve listing IDs first, then
 * collect distinct guides.
 */
export function useMerchantGuideAppearances(merchantDomain: string | undefined) {
  return useQuery({
    queryKey: ['merchant-guide-appearances', merchantDomain],
    queryFn: async (): Promise<GuideAppearance['guide'][]> => {
      if (!merchantDomain) return [];

      const { data: listings, error: lerr } = await supabase
        .from('marketplace_listings')
        .select('id')
        .eq('merchant_domain', merchantDomain)
        .eq('status', 'active');
      if (lerr) throw lerr;
      const listingIds = (listings ?? []).map((l) => l.id);
      if (listingIds.length === 0) return [];

      const { data: picks, error: perr } = await supabase
        .from('marketplace_guide_picks')
        .select(
          `guide:marketplace_guides!inner(id, slug, title, dek, hero_image_path, category_slug, pick_count, reading_time_min, published_at, status)`,
        )
        .in('listing_id', listingIds);
      if (perr) throw perr;

      const seen = new Set<string>();
      const guides: GuideAppearance['guide'][] = [];
      for (const row of (picks ?? []) as unknown as Array<{ guide: GuideAppearance['guide'] & { status: string } }>) {
        if (row.guide.status !== 'published') continue;
        if (seen.has(row.guide.id)) continue;
        seen.add(row.guide.id);
        guides.push(row.guide);
      }
      return guides;
    },
    enabled: !!merchantDomain,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
