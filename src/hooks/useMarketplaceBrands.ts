import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import type { Database } from '@/integrations/supabase/types';
import { SFW_RATINGS } from '@/hooks/useMarketplace';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

export interface MarketplaceBrand {
  slug: string;
  display_name: string;
  brand_key: string;
  product_count: number;
  website: string | null;
  logo_url: string | null;
  story: string | null;
  ownership_tags: string[];
  is_approved: boolean;
}

export interface SpotlightBrand {
  slug: string;
  display_name: string;
  product_count: number;
  logo_url: string | null;
  ownership_tags: string[];
}

export function useMarketplaceBrand(slug: string | undefined) {
  return useQuery({
    queryKey: ['marketplace-brand', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<MarketplaceBrand | null> => {
      const { data, error } = await untypedSupabase.rpc('get_marketplace_brand', { p_slug: slug });
      if (error) throw error;
      const rows = (data ?? []) as MarketplaceBrand[];
      return rows[0] ?? null;
    },
  });
}

/** Cached brand vocabulary for search-suggestion prefix matching. */
export function useBrandVocab() {
  return useQuery({
    queryKey: ['marketplace-brand-vocab'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Array<{ display_name: string; slug: string }>> => {
      const { data } = await supabase
        .from('marketplace_brands')
        .select('display_name, slug')
        .eq('status', 'approved')
        .not('slug', 'is', null)
        .order('product_count', { ascending: false })
        .limit(300);
      return (data ?? []) as Array<{ display_name: string; slug: string }>;
    },
  });
}

/** Top SFW listings sharing a brand, for the detail-page "More from" block. */
export function useBrandMoreFrom(brand: string | null | undefined, excludeId: string, limit = 4) {
  return useQuery({
    queryKey: ['marketplace-brand-more', brand, excludeId, limit],
    enabled: Boolean(brand),
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const key = brand!.trim().toLowerCase().replace(/\s+/g, ' ');
      const { data } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('status', 'active')
        .eq('brand_key', key)
        .neq('id', excludeId)
        .in('content_rating', SFW_RATINGS)
        .not('images', 'is', null)
        .order('boutique_score', { ascending: false, nullsFirst: false })
        .limit(limit);
      return (data ?? []) as MarketplaceListing[];
    },
  });
}

/** Top SFW listings for a brand — the spotlight feature block. */
export function useBrandTopListings(brandKey: string | null | undefined, limit = 3) {
  return useQuery({
    queryKey: ['marketplace-brand-top', brandKey, limit],
    enabled: Boolean(brandKey),
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const { data } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('status', 'active')
        .eq('brand_key', brandKey!)
        .in('content_rating', SFW_RATINGS)
        .not('images', 'is', null)
        .order('boutique_score', { ascending: false, nullsFirst: false })
        .limit(limit);
      return (data ?? []) as MarketplaceListing[];
    },
  });
}

export function useSpotlightBrands(limit = 8) {
  return useQuery({
    queryKey: ['marketplace-spotlight-brands', limit],
    queryFn: async (): Promise<SpotlightBrand[]> => {
      const { data, error } = await untypedSupabase.rpc('get_marketplace_spotlight_brands', {
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as SpotlightBrand[];
    },
  });
}
