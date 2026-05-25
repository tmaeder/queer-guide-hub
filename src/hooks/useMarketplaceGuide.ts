import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['marketplace_guides']['Row'];
type GuidePickRow = Database['public']['Tables']['marketplace_guide_picks']['Row'];
type GuideSectionRow = Database['public']['Tables']['marketplace_guide_sections']['Row'];
type ListingRow = Database['public']['Tables']['marketplace_listings']['Row'];

export type GuidePickWithListing = GuidePickRow & {
  listing: Pick<
    ListingRow,
    | 'id'
    | 'slug'
    | 'title'
    | 'business_name'
    | 'price'
    | 'price_usd'
    | 'currency'
    | 'images'
    | 'external_url'
    | 'affiliate_url'
    | 'merchant_domain'
    | 'availability'
  > | null;
};

export interface GuideDetail {
  guide: GuideRow;
  picks: GuidePickWithListing[];
  sections: GuideSectionRow[];
}

const TIER_ORDER: Record<GuidePickRow['tier'], number> = {
  top: 0,
  also_great: 1,
  upgrade: 2,
  budget: 3,
  avoid: 4,
};

export function useMarketplaceGuide(slug: string | undefined) {
  return useQuery({
    queryKey: ['marketplace-guide', slug],
    queryFn: async (): Promise<GuideDetail | null> => {
      if (!slug) return null;

      const { data: guide, error: guideErr } = await supabase
        .from('marketplace_guides')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (guideErr) throw guideErr;
      if (!guide) return null;

      const [picksRes, sectionsRes] = await Promise.all([
        supabase
          .from('marketplace_guide_picks')
          .select(
            `*, listing:marketplace_listings(id, slug, title, business_name, price, price_usd, currency, images, external_url, affiliate_url, merchant_domain, availability)`,
          )
          .eq('guide_id', guide.id),
        supabase
          .from('marketplace_guide_sections')
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
      }) as GuidePickWithListing[];

      return { guide, picks, sections: sectionsRes.data ?? [] };
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useMarketplaceGuidesIndex() {
  return useQuery({
    queryKey: ['marketplace-guides-index'],
    queryFn: async (): Promise<GuideRow[]> => {
      const { data, error } = await supabase
        .from('marketplace_guides')
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
