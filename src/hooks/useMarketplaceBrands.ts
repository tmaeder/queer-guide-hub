import { useQuery } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';

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
