import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SFW_RATINGS } from '@/hooks/useMarketplace';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

interface SubcategoryTile {
  slug: string;
  count: number;
}

function useAsync<T>(
  deps: React.DependencyList,
  run: () => Promise<T>,
  initial: T,
): { data: T; loading: boolean } {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setLoading(true);
    run()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(initial);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

const toCount = (v: number | string | null | undefined) =>
  typeof v === 'string' ? parseInt(v, 10) : (v ?? 0);

export function useMarketplaceSubcategoryTiles(limit: number | null = 8, includeAdult = false) {
  return useAsync<SubcategoryTile[]>(
    [limit, includeAdult],
    async () => {
      // Server-side aggregation, gated to the same content_rating tier the browse
      // grid shows (unless the visitor opted into 18+) so counts never exceed results.
      const { data, error } = await supabase.rpc('get_marketplace_subcategory_counts', {
        p_include_adult: includeAdult,
      });
      if (error || !data) return [];
      type Row = { slug: string | null; count: number | string | null };
      const rows = (data as Row[])
        .filter((r): r is { slug: string; count: number | string } => !!r.slug && r.count != null)
        .map((r) => ({ slug: r.slug, count: toCount(r.count) }));
      return limit == null ? rows : rows.slice(0, limit);
    },
    [],
  );
}

interface DepartmentCount {
  slug: string;
  count: number;
}

/** Department umbrella counts, content-rating gated. Tile + dropdown source of truth. */
export function useMarketplaceDepartmentCounts(includeAdult = false) {
  return useAsync<DepartmentCount[]>(
    [includeAdult],
    async () => {
      const { data, error } = await supabase.rpc('get_marketplace_department_counts', {
        p_include_adult: includeAdult,
      });
      if (error || !data) return [];
      type Row = { department: string | null; count: number | string | null };
      return (data as Row[])
        .filter(
          (r): r is { department: string; count: number | string } =>
            !!r.department && r.count != null,
        )
        .map((r) => ({ slug: r.department, count: toCount(r.count) }));
    },
    [],
  );
}

/** Finer sub-tile counts within a department (canonical groups), content-rating gated. */
export function useMarketplaceSubcategoryGroupCounts(
  department: string | null | undefined,
  includeAdult = false,
) {
  return useAsync<DepartmentCount[]>(
    [department, includeAdult],
    async () => {
      if (!department) return [];
      const { data, error } = await supabase.rpc('get_marketplace_subcategory_group_counts', {
        p_department: department,
        p_include_adult: includeAdult,
      });
      if (error || !data) return [];
      type Row = { grp: string | null; count: number | string | null };
      return (data as Row[])
        .filter((r): r is { grp: string; count: number | string } => !!r.grp && r.count != null)
        .map((r) => ({ slug: r.grp, count: toCount(r.count) }));
    },
    [],
  );
}

export interface MarketplaceTagFacet {
  slug: string;
  name: string;
  kind: 'material' | 'occasion' | 'vibe' | 'size' | 'color' | 'genre' | 'fit';
  count: number;
}

/** Namespaced attribute-tag counts scoped to a department / group, content-rating gated. */
export function useMarketplaceTagFacets(
  department: string | null | undefined,
  group: string | null | undefined,
  includeAdult = false,
) {
  return useAsync<MarketplaceTagFacet[]>(
    [department, group, includeAdult],
    async () => {
      const { data, error } = await supabase.rpc('get_marketplace_tag_facets', {
        p_department: department ?? null,
        p_subcategory_group: group ?? null,
        p_include_adult: includeAdult,
      });
      if (error || !data) return [];
      type Row = {
        slug: string | null;
        name: string | null;
        kind: string | null;
        count: number | string | null;
      };
      return (data as Row[])
        .filter(
          (r): r is { slug: string; name: string; kind: string; count: number | string } =>
            !!r.slug && !!r.name && r.count != null,
        )
        .map((r) => ({
          slug: r.slug,
          name: r.name,
          kind: r.kind as MarketplaceTagFacet['kind'],
          count: toCount(r.count),
        }));
    },
    [],
  );
}

/*
 * `useDepartmentCovers` lived here and was DELETED 2026-08-23.
 *
 * It took the global top-60 active SFW listings by `boutique_score` and
 * deduped them by department, which fails twice over. The sort is global, so
 * jewelry alone occupied 38 of the 60 rows and five departments (books_art,
 * intimacy, bdsm_fetish, home, services) resolved to NO cover at all — the
 * browse grid rendered image tiles beside bare text tiles. And of the six it
 * did resolve, apparel came back as a sport sock and hygiene as a pair of
 * PRIDE socks, because "highest-scoring single product" is not a picture of a
 * department.
 *
 * Raising the limit would have fixed the coverage and left the second fault
 * untouched, so departments are drawn instead — see `DepartmentArt.tsx`. There
 * is no replacement query; the tiles need no listing data beyond their counts.
 */

export interface MarketplaceAttributeOption {
  slug: string; // namespaced unified_tags slug (mat-cotton, size-m, color-black)
  name: string;
  kind: MarketplaceTagFacet['kind'];
}

/** Controlled attribute vocabulary from unified_tags — PREFIX-keyed: the old
 *  `category IN ('material','occasion','vibe')` load matched ZERO rows after
 *  the tag-category consolidation rewrote category text (the Attributes
 *  accordion has been silently empty on prod). */
export function useMarketplaceAttributeVocab() {
  return useAsync<MarketplaceAttributeOption[]>(
    [],
    async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('slug, name')
        .or(
          'slug.like.mat-%,slug.like.occ-%,slug.like.vibe-%,slug.like.size-%,slug.like.color-%,slug.like.genre-%,slug.like.fit-%',
        )
        .eq('status', 'active')
        .order('name');
      if (error || !data) return [];
      const { attributeKindOfSlug } = await import('@/lib/marketplaceTaxonomy');
      return data
        .filter((t): t is { slug: string; name: string } => !!t.slug && !!t.name)
        .map((t) => {
          const kind = attributeKindOfSlug(t.slug);
          return kind ? { slug: t.slug, name: t.name, kind } : null;
        })
        .filter((t): t is MarketplaceAttributeOption => t !== null);
    },
    [],
  );
}

/** Column-derived attribute facet counts (size/color/material/genre/fit) —
 *  covers the numeric sizes that deliberately have no size-* tag. */
export function useMarketplaceAttributeFacets(
  department: string | null | undefined,
  group: string | null | undefined,
  includeAdult = false,
) {
  return useAsync<MarketplaceTagFacet[]>(
    [department, group, includeAdult],
    async () => {
      const { data, error } = await supabase.rpc('get_marketplace_attribute_facets', {
        p_department: department ?? undefined,
        p_subcategory_group: group ?? undefined,
        p_include_adult: includeAdult,
      });
      if (error || !data) return [];
      type Row = { kind: string | null; slug: string | null; count: number | string | null };
      return (data as Row[])
        .filter(
          (r): r is { kind: string; slug: string; count: number | string } =>
            !!r.kind && !!r.slug && r.count != null,
        )
        .map((r) => ({
          slug: r.slug,
          name: r.slug,
          kind: r.kind as MarketplaceTagFacet['kind'],
          count: toCount(r.count),
        }));
    },
    [],
  );
}

/** Fine-tier counts within a department/group (subcategory_fine), gated. */
export function useMarketplaceFineCounts(
  department: string | null | undefined,
  group: string | null | undefined,
  includeAdult = false,
) {
  return useAsync<DepartmentCount[]>(
    [department, group, includeAdult],
    async () => {
      if (!department && !group) return [];
      const { data, error } = await supabase.rpc('get_marketplace_subcategory_fine_counts', {
        p_department: department ?? undefined,
        p_subcategory_group: group ?? undefined,
        p_include_adult: includeAdult,
      });
      if (error || !data) return [];
      type Row = { fine: string | null; count: number | string | null };
      return (data as Row[])
        .filter((r): r is { fine: string; count: number | string } => !!r.fine && r.count != null)
        .map((r) => ({ slug: r.fine, count: toCount(r.count) }));
    },
    [],
  );
}

export function useMarketplaceListingsRelated(limit = 4) {
  // Generic "related products" surface for cross-product hooks (news, blog).
  // Prefers featured listings; orders by relevance score where available.
  return useAsync<MarketplaceListing[]>(
    [limit],
    async () => {
      // Cross-site surface: sfw/suggestive only, regardless of the
      // /marketplace-scoped 18+ opt-in.
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .eq('status', 'active')
        .in('content_rating', SFW_RATINGS)
        .order('featured', { ascending: false })
        .order('lgbti_relevance_score', { ascending: false, nullsFirst: false })
        .order('quality_score', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

/**
 * SFW listings carrying an occasion tag (occ-pride, occ-drag, occ-wedding)
 * for contextual rails — e.g. Pride outfits on a Pride event page.
 */
export function useMarketplaceListingsForOccasion(occasionSlug: string | undefined, limit = 8) {
  return useAsync<MarketplaceListing[]>(
    [occasionSlug, limit],
    async () => {
      if (!occasionSlug) return [];
      const { data: tagRows } = await supabase
        .from('unified_tag_assignments')
        .select('entity_id, unified_tags!inner(slug)')
        .eq('entity_type', 'marketplace_listing')
        .eq('unified_tags.slug', occasionSlug)
        .limit(500);
      const ids = Array.from(new Set((tagRows ?? []).map((r) => r.entity_id as string)));
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('status', 'active')
        .in('id', ids)
        .in('content_rating', ['sfw', 'suggestive'])
        .not('images', 'is', null)
        .order('boutique_score', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

/**
 * First pride/drag/wedding occasion among a city's upcoming events (60d) —
 * lets the city rail surface online occasion gear, not just venue-hosted
 * listings.
 */
export function useCityUpcomingOccasion(cityId: string | undefined) {
  return useAsync<string | null>(
    [cityId],
    async () => {
      if (!cityId) return null;
      const now = new Date();
      const until = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('events')
        .select('title, event_type')
        .eq('city_id', cityId)
        .gte('start_date', now.toISOString())
        .lte('start_date', until.toISOString())
        .order('start_date', { ascending: true })
        .limit(50);
      if (error || !data) return null;
      const { occasionForEvent } = await import('@/components/marketplace/marketplaceHelpers');
      for (const e of data as Array<{ title: string; event_type: string | null }>) {
        const occ = occasionForEvent(e.event_type, e.title);
        if (occ) return occ;
      }
      return null;
    },
    null,
  );
}

export function useMarketplaceSimilarListings(listing: MarketplaceListing | null, limit = 4) {
  return useAsync<MarketplaceListing[]>(
    [listing?.id, listing?.category, listing?.category_id, limit],
    async () => {
      if (!listing) return [];
      let q = supabase
        .from('marketplace_listings')
        .select('*, venues(name, address, city)')
        .eq('status', 'active')
        .in('content_rating', SFW_RATINGS)
        .neq('id', listing.id)
        .limit(limit);
      if (listing.category_id) q = q.eq('category_id', listing.category_id);
      else if (listing.category) q = q.eq('category', listing.category);
      q = q
        .order('lgbti_relevance_score', { ascending: false, nullsFirst: false })
        .order('quality_score', { ascending: false, nullsFirst: false });
      const { data, error } = await q;
      if (error || !data) return [];
      return data as MarketplaceListing[];
    },
    [],
  );
}

interface PricePoint {
  observed_at: string;
  price_usd: number;
}

interface FacetCounts {
  category: Map<string, number>;
  subcategory: Map<string, number>;
  business_type: Map<string, number>;
  total: number;
}

const EMPTY_FACETS: FacetCounts = {
  category: new Map(),
  subcategory: new Map(),
  business_type: new Map(),
  total: 0,
};

/**
 * Compute facet counts for the current filter scope via the server-side
 * RPC `get_marketplace_facets`. Each per-dimension bucket excludes its own
 * filter so the dropdown can show true alternates (e.g. "Products (998)"
 * keeps reading 998 after the user selects it). `search` is intentionally
 * ignored — counts reflect the broader filter context.
 */
export function useMarketplaceFacets(opts: {
  category?: string;
  subcategory?: string;
  businessType?: string;
  categoryId?: string;
  includeAdult?: boolean;
}) {
  return useAsync<FacetCounts>(
    [opts.category, opts.subcategory, opts.businessType, opts.categoryId, opts.includeAdult],
    async () => {
      const { data, error } = await supabase.rpc('get_marketplace_facets', {
        p_category: opts.category ?? null,
        p_subcategory: opts.subcategory ?? null,
        p_business_type: opts.businessType ?? null,
        p_category_id: opts.categoryId ?? null,
        p_include_adult: opts.includeAdult ?? false,
      });
      if (error || !data) return EMPTY_FACETS;
      const payload = data as {
        total?: number | string;
        by_category?: Record<string, number | string>;
        by_subcategory?: Record<string, number | string>;
        by_business_type?: Record<string, number | string>;
      };
      const toMap = (rec: Record<string, number | string> | undefined) => {
        const m = new Map<string, number>();
        if (!rec) return m;
        for (const [k, v] of Object.entries(rec)) {
          m.set(k, typeof v === 'string' ? parseInt(v, 10) : v);
        }
        return m;
      };
      const total =
        typeof payload.total === 'string' ? parseInt(payload.total, 10) : (payload.total ?? 0);
      return {
        category: toMap(payload.by_category),
        subcategory: toMap(payload.by_subcategory),
        business_type: toMap(payload.by_business_type),
        total,
      };
    },
    EMPTY_FACETS,
  );
}

export function useMarketplacePriceHistory(listingId: string, days = 90) {
  return useAsync<PricePoint[]>(
    [listingId, days],
    async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('marketplace_price_history')
        .select('observed_at, price_usd')
        .eq('listing_id', listingId)
        .gte('observed_at', since)
        .not('price_usd', 'is', null)
        .order('observed_at', { ascending: true })
        .limit(120);
      if (error || !data) return [];
      return data.filter((d): d is PricePoint => typeof d.price_usd === 'number');
    },
    [],
  );
}
