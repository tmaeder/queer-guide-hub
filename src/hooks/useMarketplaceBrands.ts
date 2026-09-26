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
  /**
   * One SFW product photograph, or null.
   *
   * NULL IS A FIRST-CLASS ANSWER, not a failure: measured, 657 of 871 makers
   * have a cover and 214 do not, and the page partitions on exactly this — a
   * cover gets a gallery tile, no cover gets an index row. Never coerce it to
   * a placeholder and never filter these rows away: a maker without a
   * photograph still sells things and still belongs in the directory.
   */
  cover_url: string | null;
  /**
   * Our `img.queer.guide` mirror for that cover, when one exists (623 of the
   * 657). Load-bearing for WEIGHT, not looks: `isCfResizableSource` (see
   * src/utils/cloudflareOptimizations.ts) DENIES cdn.shopify.com, which is
   * most of this catalogue, so a raw merchant URL gets no CDN resizing at all
   * and downloads a full product photo into a ~240px tile. Nullable by design
   * — <Image> walks optimized → thumbnail → original, so a miss degrades to
   * the merchant's own image rather than to a fallback texture.
   */
  cover_thumb: string | null;
}

/**
 * Hard ceiling on the directory read.
 *
 * PostgREST's implicit cap is 1000 rows and the catalogue stands at 871, so an
 * unbounded read is ALREADY within one ingest run of silently truncating — the
 * same class of bug as the sitemap's 1000-row truncation, and just as
 * invisible, because a short array and a small catalogue look identical. Stated
 * explicitly so the limit is a decision with a number rather than a default
 * nobody chose. `useMarketplaceBrandsDirectory` reports when it is hit.
 *
 * Still enforced now the read is an RPC rather than a table select: PostgREST
 * applies its cap to a function's result set exactly as it does to a table's,
 * so moving to a function did not remove the hazard — it only moved where the
 * row count is decided.
 */
export const BRAND_DIRECTORY_CEILING = 5000;

/**
 * The makers directory behind /marketplace/brands — the WHOLE catalogue, once.
 *
 * This used to paginate: a growing `.range(0, (page+1)*48)` window plus server
 * `ilike` search and `.overlaps()` ownership filtering, so browsing the tail
 * cost eighteen round trips and every keystroke cost one. Measured, all 885
 * rows of the six columns below are **17 kB** — smaller than most of the images
 * on the page it feeds. Fetching once and filtering in memory is less code, one
 * request, instant search, and it deletes the page state, the range arithmetic
 * and the "Load more" network hop outright. It also makes an A–Z index possible
 * at all: a letter jump over a 48-row window can only ever reach what happens
 * to be loaded.
 *
 * Filtering therefore lives at the call site. That is deliberate — the page
 * already owns the search box and the chips, and a filter that runs in the same
 * tick as the keystroke cannot get out of step with them.
 *
 * Deliberately NOT built on `useVerifiedOwnedBrands`, which hard-filters to
 * `ownership_tags != '{}'` — that hook answers "who have we verified as
 * queer-owned", a claim; this one answers "who sells here", a catalogue. Mixing
 * them would let an untagged brand render under a heading that claims verified
 * ownership, which is the exact failure `routeMetaContract` guards.
 *
 * `product_count > 0` is not cosmetic: `marketplace_brands` retains rows whose
 * listings have all gone inactive, and a directory tile that opens onto an
 * empty grid is a dead end the reader paid a navigation for. That filter now
 * lives in the RPC, alongside the rest of the catalogue's definition.
 *
 * IT IS AN RPC RATHER THAN A FLAT SELECT because of ONE column: `cover_url`.
 * A product photograph lives on `marketplace_listings`, not on the brand, so
 * PostgREST cannot reach it from here at all — and the page needs it for the
 * WHOLE catalogue, not for a page of it, because the gallery/index split is a
 * partition on `cover_url IS NULL` and a partition cannot be computed from a
 * window. See `get_marketplace_brand_directory`, whose shape is a measured
 * performance fix (2,298 ms → 244 ms) and not a style choice.
 *
 * The cost is honest and worth stating: 17 kB → 260 kB uncompressed for the
 * same 871 rows. It gzips to a fraction of that (these are URLs, which share
 * long prefixes), and the page it feeds then downloads product photography,
 * against which the payload is noise.
 */
export function useMarketplaceBrandsDirectory() {
  return useQuery({
    queryKey: ['marketplace-brands-directory'],
    staleTime: 300_000,
    queryFn: async (): Promise<DirectoryBrand[]> => {
      const { data, error } = await untypedSupabase.rpc('get_marketplace_brand_directory');

      if (error) throw error;
      const rows = (data ?? []) as DirectoryBrand[];
      if (rows.length >= BRAND_DIRECTORY_CEILING) {
        // Say so rather than rendering a plausible-looking partial directory.
        // A truncated catalogue is indistinguishable from a small one by
        // looking at it, which is precisely why it needs to announce itself.
        console.warn(
          `[brands] directory hit its ${BRAND_DIRECTORY_CEILING}-row ceiling — the index is truncated`,
        );
      }
      return rows;
    },
  });
}

export interface BrandCover {
  /** The merchant's own image. Always present. */
  url: string;
  /**
   * Our `img.queer.guide` mirror, when one exists (78.5% of active SFW
   * listings). Null is normal and safe: `<Image>` walks optimized → thumbnail →
   * original, so an un-mirrored cover — or a mirror the zone's Referer rule
   * blocks, which is every request from localhost — falls back to `url` rather
   * than to a placeholder texture.
   */
  thumb: string | null;
}

export interface BrandWithCovers extends DirectoryBrand {
  /** Exactly three; the RPC drops any brand that cannot fill the strip. */
  covers: BrandCover[];
}

/**
 * The highlight band — a rotating dozen makers, three product covers each.
 *
 * It used to be the TOP twelve by `product_count`, which meant the same twelve
 * makers led this page every day since it shipped. Measured, 94 brands clear
 * every gate the band enforces (approved, slugged, a logo, three DISTINCT SFW
 * covers), so 82 of them were unreachable — not for failing a quality bar but
 * for selling less than the twelve above them.
 *
 * THE ROTATION IS THE SERVER'S, NOT OURS, AND NO SEED IS PASSED FROM HERE.
 * `get_marketplace_brand_covers` defaults its seed to the server's day. Letting
 * the client supply one would put the rotation behind a clock we do not
 * control: a device with a wrong date pins its reader to one window forever,
 * which looks exactly like the never-rotating band this replaced — i.e.
 * invisible. It also keeps this query key CONSTANT, so the band does not
 * re-fetch as the reader filters the catalogue beneath it.
 *
 * Every safety and quality decision — SFW ratings, logo required, three covers,
 * the rotation itself — lives in the RPC rather than here, so no caller can
 * render an adult hero image, a strip with a hole in it, or a frozen band by
 * passing the wrong argument. `story` is not among its columns and is filled in
 * as null to satisfy `DirectoryBrand`: this tile shows goods, not prose. So are
 * `cover_url`/`cover_thumb` — this tile carries its own three-cover strip and
 * has no use for the directory's single cover.
 */
export function useMarketplaceBrandCovers(limit = 12) {
  return useQuery({
    queryKey: ['marketplace-brand-covers', limit],
    staleTime: 300_000,
    queryFn: async (): Promise<BrandWithCovers[]> => {
      const { data, error } = await untypedSupabase.rpc('get_marketplace_brand_covers', {
        p_limit: limit,
      });
      if (error) throw error;
      return (
        (data ?? []) as Array<Omit<BrandWithCovers, 'story' | 'cover_url' | 'cover_thumb'>>
      ).map((b) => ({
        ...b,
        story: null,
        cover_url: null,
        cover_thumb: null,
        covers: Array.isArray(b.covers) ? b.covers : [],
      }));
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
      let { data, error } = await untypedSupabase
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
        .eq('ownership_review_status', 'verified')
        .order('product_count', { ascending: false, nullsFirst: false })
        .limit(limit);

      // The database migration and Pages release are separate production jobs.
      // Keep the client usable during that rolling window (and in PR previews,
      // which intentionally read the current production schema): an old schema
      // reports 42703/PGRST204 for the new lifecycle column. Only that exact
      // compatibility case may fall back to the legacy, evidence-bearing tags;
      // every other error remains fatal. Once the migration is present, the
      // ownership-review filter above is always authoritative.
      if (
        error &&
        ['42703', 'PGRST204'].includes(error.code ?? '') &&
        `${error.message ?? ''} ${error.details ?? ''}`.includes('ownership_review_status')
      ) {
        ({ data, error } = await untypedSupabase
          .from('marketplace_brands')
          .select(
            'id, display_name, brand_key, slug, logo_url, logo_on_ink, product_count, ownership_tags',
          )
          .not('ownership_tags', 'eq', '{}')
          .order('product_count', { ascending: false, nullsFirst: false })
          .limit(limit));
      }
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
