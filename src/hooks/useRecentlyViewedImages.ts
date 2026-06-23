import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import type { RecentlyViewedItem, RecentlyViewedType } from '@/lib/recentlyViewed';

/**
 * Render-time image backfill for the "Recently viewed" rail.
 *
 * Entries captured before the rail started storing an image (or whose stored
 * URL was scrubbed as invalid) have no `image`. This hook resolves the entity's
 * *current* image straight from its (anon-readable) source table — one batched
 * `slug IN (…)` query per entity type present in the gap set — so the rail shows
 * a real thumbnail immediately instead of a fallback, without waiting for a
 * re-visit. Returns a map keyed `"<type>:<slug>"`.
 *
 * Safety-gated rows in high-risk countries are RLS-filtered for anonymous
 * callers, so they simply resolve to no image (clean fallback) — intended.
 */

type Row = Record<string, unknown>;

interface SourceConfig {
  table: string;
  cols: string;
  pick: (row: Row) => string | undefined;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** First candidate that is a valid https image URL, else undefined. */
function pickValid(candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (isValidImageUrl(c)) return c;
  }
  return undefined;
}

/** Cities/countries: curated override wins, then the persisted image unless flagged. */
function pickPlace(row: Row): string | undefined {
  if (isValidImageUrl(row.curated_image_url)) return row.curated_image_url;
  if (!row.image_flagged && isValidImageUrl(row.image_url)) return row.image_url;
  return undefined;
}

const SOURCES: Record<RecentlyViewedType, SourceConfig> = {
  venue: { table: 'venues', cols: 'slug, images, logo_url', pick: (r) => pickValid([...asArray(r.images), r.logo_url]) },
  event: { table: 'events', cols: 'slug, images, logo_url', pick: (r) => pickValid([...asArray(r.images), r.logo_url]) },
  city: { table: 'cities', cols: 'slug, image_url, curated_image_url, image_flagged', pick: pickPlace },
  country: { table: 'countries', cols: 'slug, image_url, curated_image_url, image_flagged', pick: pickPlace },
  personality: { table: 'personalities', cols: 'slug, image_url', pick: (r) => pickValid([r.image_url]) },
  hotel: { table: 'hotels', cols: 'slug, images', pick: (r) => pickValid(asArray(r.images)) },
  marketplace: { table: 'marketplace_listings', cols: 'slug, images', pick: (r) => pickValid(asArray(r.images)) },
  queer_village: { table: 'queer_villages', cols: 'slug, image_url, images', pick: (r) => pickValid([r.image_url, ...asArray(r.images)]) },
  organization: { table: 'organizations', cols: 'slug, cover_image_url, images, logo_url', pick: (r) => pickValid([r.cover_image_url, ...asArray(r.images), r.logo_url]) },
};

export function useRecentlyViewedImages(items: RecentlyViewedItem[]): Record<string, string> {
  // Only items missing a usable stored image need a lookup.
  const gaps = items.filter((it) => !isValidImageUrl(it.image));
  const cacheKey = gaps
    .map((g) => `${g.type}:${g.slug}`)
    .sort()
    .join('|');

  const { data } = useQuery({
    queryKey: ['recently-viewed-images', cacheKey],
    enabled: gaps.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const byType = new Map<RecentlyViewedType, string[]>();
      for (const g of gaps) {
        const list = byType.get(g.type) ?? [];
        list.push(g.slug);
        byType.set(g.type, list);
      }

      const out: Record<string, string> = {};
      await Promise.all(
        [...byType.entries()].map(async ([type, slugs]) => {
          const cfg = SOURCES[type];
          if (!cfg) return;
          const { data: rows, error } = await untypedFrom(cfg.table).select(cfg.cols).in('slug', slugs);
          if (error || !rows) return;
          for (const row of rows as Row[]) {
            const slug = typeof row.slug === 'string' ? row.slug : null;
            const img = cfg.pick(row);
            if (slug && img) out[`${type}:${slug}`] = img;
          }
        }),
      );
      return out;
    },
  });

  return data ?? {};
}
