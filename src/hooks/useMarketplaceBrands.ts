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
  logo_on_ink: boolean | null;
  story: string | null;
  ownership_tags: string[];
  is_approved: boolean;
}

export interface SpotlightBrand {
  slug: string;
  display_name: string;
  product_count: number;
  logo_url: string | null;
  logo_on_ink: boolean | null;
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

export interface DirectoryBrand {
  slug: string;
  display_name: string;
  logo_url: string | null;
  logo_on_ink: boolean | null;
  story: string | null;
  product_count: number | null;
  ownership_tags: string[] | null;
}

/** Page size for /marketplace/brands. Also the "load more" step. */
export const BRAND_DIRECTORY_PAGE_SIZE = 48;

/**
 * The makers directory behind /marketplace/brands.
 *
 * Deliberately NOT built on `useVerifiedOwnedBrands`, which hard-filters to
 * `ownership_tags != '{}'` — that hook answers "who have we verified as
 * queer-owned", a claim; this one answers "who sells here", a catalogue. Mixing
 * them would let an untagged brand render under a heading that claims verified
 * ownership, which is the exact failure `routeMetaContract` guards.
 *
 * `product_count > 0` is not cosmetic: `marketplace_brands` retains rows whose
 * listings have all gone inactive, and a directory tile that opens onto an
 * empty grid is a dead end the reader paid a navigation for.
 *
 * Ownership filtering uses `.overlaps()` (PostgREST `&&`) so a brand matches if
 * it carries ANY selected tag — the chips are a widening OR, not a narrowing
 * AND. Selecting "Trans-owned" and "BIPOC-owned" should show both, not only
 * brands that are both.
 */
export function useMarketplaceBrandsDirectory(opts: {
  search?: string;
  ownership?: string[];
  page?: number;
}) {
  const search = opts.search?.trim() ?? '';
  const ownership = opts.ownership ?? [];
  const page = opts.page ?? 0;

  return useQuery({
    queryKey: ['marketplace-brands-directory', search, ownership.join(','), page],
    staleTime: 300_000,
    queryFn: async (): Promise<{ brands: DirectoryBrand[]; total: number }> => {
      let q = supabase
        .from('marketplace_brands')
        .select('slug, display_name, logo_url, logo_on_ink, story, product_count, ownership_tags', {
          count: 'exact',
        })
        .eq('status', 'approved')
        .not('slug', 'is', null)
        .gt('product_count', 0);

      if (search) q = q.ilike('display_name', `%${search}%`);
      if (ownership.length > 0) q = q.overlaps('ownership_tags', ownership);

      // A GROWING WINDOW (0 .. n), not a page slice. "Load more" on a directory
      // has to accumulate, and doing that by widening the range keeps the
      // accumulation in the query cache instead of in a `useState` that has to
      // be reset in an effect every time a chip or the search box changes —
      // which is exactly where the listing views grew their set-state-in-effect
      // exemptions. Brand rows are six small columns, so re-reading the window
      // costs less than the bug class does.
      const { data, error, count } = await q
        .order('product_count', { ascending: false, nullsFirst: false })
        .range(0, (page + 1) * BRAND_DIRECTORY_PAGE_SIZE - 1);

      if (error) throw error;
      return { brands: (data ?? []) as DirectoryBrand[], total: count ?? 0 };
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

export interface VerifiedBrand {
  id: string;
  /** `marketplace_brands` has no `name` column — the label is `display_name`. */
  display_name: string | null;
  brand_key: string;
  slug: string | null;
  logo_url: string | null;
  logo_on_ink: boolean | null;
  product_count: number | null;
  ownership_tags: string[] | null;
}

/**
 * Brands we have actually verified as queer-owned.
 *
 * 24 of 2,583 brands carry `ownership_tags` (0.93%). That is why the surface is
 * labelled "Shop" and not "queer-owned": ownership is a property of the rows
 * below, never an adjective for the catalogue. The count is rendered literally
 * so the claim stays checkable.
 *
 * Moved here from useIntentData.ts when /shop folded into /marketplace: that
 * file is the data layer for the Intent Router composite pages, no intent page
 * consumes this any more, and every other brand query already lives here.
 */
export function useVerifiedOwnedBrands(limit = 24) {
  return useQuery({
    queryKey: ['marketplace-verified-brands', limit],
    staleTime: 600_000,
    queryFn: async (): Promise<VerifiedBrand[]> => {
      const { data, error } = await supabase
        .from('marketplace_brands')
        // `not('ownership_tags','is',null)` did NOT filter: the column is
        // non-null on all 2,583 rows and 2,559 of them hold an EMPTY array. So
        // the limit was applied to the whole catalogue and the client-side
        // non-empty filter then ran on an already-truncated window — a
        // filter-after-limit bug. Measured 2026-08-08: 24 brands are genuinely
        // tagged, the page rendered 22, and "Boy Butter" and "Buck Angel" sat at
        // positions 24 and 25 of the ordering, permanently outside the window.
        // `not(...,'eq','{}')` filters server-side so the limit applies to the
        // right set. Written as `.not()` rather than `.neq()` because the
        // generated column type is `string[]` and `.neq()` will not accept the
        // `'{}'` array literal PostgREST needs; `.not()` takes the raw value.
        .select(
          'id, display_name, brand_key, slug, logo_url, logo_on_ink, product_count, ownership_tags',
        )
        .not('ownership_tags', 'eq', '{}')
        .order('product_count', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      // Belt-and-braces only — the server filter above is what makes the count
      // correct. Kept so a null slipping in cannot render an untagged brand
      // under a heading that claims verified ownership.
      return ((data ?? []) as VerifiedBrand[]).filter(
        (b) => Array.isArray(b.ownership_tags) && b.ownership_tags.length > 0,
      );
    },
  });
}
