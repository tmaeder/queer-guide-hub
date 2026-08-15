import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface EntityImageAsset {
  optimized_url: string | null;
  thumbnail_url: string | null;
  optimization_status: string | null;
}

/** What this query actually returns. Hand-written: the row comes via `untypedFrom`. */
interface ImageAssetLinkRow {
  entity_id: string;
  role: string;
  image_assets: {
    optimized_url: string | null;
    thumbnail_url: string | null;
    optimization_status: string | null;
  } | null;
}

interface LinkQueryResult {
  data: ImageAssetLinkRow[] | null;
  error: { message: string } | null;
}

/**
 * A four-method view of the query builder, because the full one no longer fits.
 *
 * `untypedFrom` is typed as `ReturnType<typeof supabase.from>` — the union of
 * EVERY table's builder. Regenerating `types.ts` took that union from 439
 * tables to 451, and this chain then tipped past TypeScript's instantiation
 * depth limit (TS2589). Narrowing to the methods this query uses keeps the
 * chain shallow.
 *
 * Nothing is lost by it: `untypedFrom` is the escape hatch for tables outside
 * the generated types, so the rows were never checked against the schema here
 * anyway — this file already hand-wrote the row shape and cast to it. The cast
 * now lives in one place, on the query, instead of on the result.
 *
 * The underlying `untypedFrom` typing is the real defect and is worth fixing
 * centrally, but it has 261 call sites across 113 files and that is a change
 * with its own blast radius.
 */
interface LooseImageLinkQuery extends PromiseLike<LinkQueryResult> {
  select: (columns: string) => LooseImageLinkQuery;
  eq: (column: string, value: unknown) => LooseImageLinkQuery;
  in: (column: string, values: readonly string[]) => LooseImageLinkQuery;
}

/**
 * Batch-fetch the best `cover` image_asset for each of `entityIds` of the
 * given `entityType`. Returns a Map keyed by entity_id. Callers feed the
 * result into resolveImageUrl() alongside the entity's own image_url.
 *
 * Why a separate query: image_asset_links is a polymorphic junction
 * (entity_id is a plain uuid with no FK to news_articles /
 * marketplace_listings), so PostgREST can't embed it in the entity query.
 * One batch fetch keyed on entity_id is the simplest correct shape.
 */
export function useEntityImageAssets(
  entityType: 'news_article' | 'marketplace_listing' | 'venue' | 'event' | 'personality' | 'queer_village' | 'tag',
  entityIds: string[],
): { assets: Map<string, EntityImageAsset>; loading: boolean } {
  const [assets, setAssets] = useState<Map<string, EntityImageAsset>>(new Map());
  const [loading, setLoading] = useState(false);

  const key = entityIds.length === 0 ? '' : entityIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setAssets(new Map());
      return;
    }
    setLoading(true);

    (async () => {
      const ids = key.split(',');
      // Chunk ids — one giant in.() filter exceeds PostgREST's URL length
      // limit (400) once callers pass a few hundred entities.
      const CHUNK = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      const results = await Promise.all(
        chunks.map((chunk) =>
          (untypedFrom('image_asset_links') as unknown as LooseImageLinkQuery)
            .select('entity_id, role, image_assets!inner(optimized_url, thumbnail_url, optimization_status, status)')
            .eq('entity_type', entityType)
            .in('entity_id', chunk)
            .eq('image_assets.status', 'active'),
        ),
      );

      if (cancelled) return;
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        console.warn('useEntityImageAssets:', firstError.message);
        setAssets(new Map());
        setLoading(false);
        return;
      }
      const data = results.flatMap((r) => r.data ?? []);

      const map = new Map<string, EntityImageAsset>();
      for (const row of data) {
        const existing = map.get(row.entity_id);
        const next = row.image_assets;
        if (!next) continue;
        // Only use R2 URLs that are confirmed uploaded. 'pending' / 'failed'
        // rows have the URL pre-written in the DB but the file doesn't exist
        // in R2 yet — serving those causes a flash from image_url → 404.
        // Valid statuses in DB: 'optimized' (19k rows), 'cdn_optimized' (15 rows).
        const status = next.optimization_status;
        if (status !== 'optimized' && status !== 'cdn_optimized') continue;
        // Prefer cover role; otherwise first wins.
        if (existing && row.role !== 'cover') continue;
        map.set(row.entity_id, {
          optimized_url: next.optimized_url,
          thumbnail_url: next.thumbnail_url,
          optimization_status: next.optimization_status,
        });
      }
      setAssets(map);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [entityType, key]);

  return { assets, loading };
}
