import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface EntityImageAsset {
  id: string;
  url: string | null;
  optimized_url: string | null;
  thumbnail_url: string | null;
  optimization_status: string | null;
}

/** What this query actually returns. Hand-written: the row comes via `untypedFrom`. */
interface ImageAssetLinkRow {
  entity_id: string;
  role: string;
  sort_order: number;
  image_assets: {
    id: string;
    url: string | null;
    optimized_url: string | null;
    thumbnail_url: string | null;
    optimization_status: string | null;
    status: string;
    is_flagged: boolean;
    access_level: string;
    health_consecutive_failures: number;
    width: number | null;
    height: number | null;
    brand_category: string | null;
  } | null;
}

const MARKETPLACE_OVERVIEW_ROLES = ['cover', 'hero', 'gallery', 'square', 'thumbnail'];
const MARKETPLACE_BLOCKED_BRAND_CATEGORIES = new Set([
  'logo',
  'color',
  'typography',
  'iconography',
  'template',
  'guideline',
]);

function marketplaceOverviewAssetIsEligible(row: ImageAssetLinkRow): boolean {
  const asset = row.image_assets;
  return Boolean(
    asset &&
    MARKETPLACE_OVERVIEW_ROLES.includes(row.role) &&
    asset.status === 'active' &&
    !asset.is_flagged &&
    asset.access_level === 'public' &&
    (asset.optimization_status === 'optimized' || asset.optimization_status === 'cdn_optimized') &&
    (asset.optimized_url || asset.thumbnail_url) &&
    asset.health_consecutive_failures < 2 &&
    (asset.width ?? 0) >= 600 &&
    (asset.height ?? 0) >= 600 &&
    !MARKETPLACE_BLOCKED_BRAND_CATEGORIES.has(asset.brand_category ?? 'photography'),
  );
}

function marketplaceRoleRank(role: string): number {
  const rank = MARKETPLACE_OVERVIEW_ROLES.indexOf(role);
  return rank === -1 ? MARKETPLACE_OVERVIEW_ROLES.length : rank;
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
  entityType:
    | 'news_article'
    | 'marketplace_listing'
    | 'venue'
    | 'event'
    | 'personality'
    | 'queer_village'
    | 'tag',
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
          untypedFrom('image_asset_links')
            .select(
              'entity_id, role, sort_order, image_assets!inner(id, url, optimized_url, thumbnail_url, optimization_status, status, is_flagged, access_level, health_consecutive_failures, width, height, brand_category)',
            )
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
      const data = (results.flatMap((r) => r.data ?? []) as unknown as ImageAssetLinkRow[]).sort(
        (a, b) => {
          if (a.entity_id !== b.entity_id) return a.entity_id.localeCompare(b.entity_id);
          const role = marketplaceRoleRank(a.role) - marketplaceRoleRank(b.role);
          if (role !== 0) return role;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          const aPixels = (a.image_assets?.width ?? 0) * (a.image_assets?.height ?? 0);
          const bPixels = (b.image_assets?.width ?? 0) * (b.image_assets?.height ?? 0);
          if (aPixels !== bPixels) return bPixels - aPixels;
          return (a.image_assets?.id ?? '').localeCompare(b.image_assets?.id ?? '');
        },
      );

      const map = new Map<string, EntityImageAsset>();
      for (const row of data) {
        const existing = map.get(row.entity_id);
        const next = row.image_assets;
        if (!next) continue;
        if (entityType === 'marketplace_listing' && !marketplaceOverviewAssetIsEligible(row)) {
          continue;
        }
        // Only use R2 URLs that are confirmed uploaded. 'pending' / 'failed'
        // rows have the URL pre-written in the DB but the file doesn't exist
        // in R2 yet — serving those causes a flash from image_url → 404.
        // Valid statuses in DB: 'optimized' (19k rows), 'cdn_optimized' (15 rows).
        const status = next.optimization_status;
        if (status !== 'optimized' && status !== 'cdn_optimized') continue;
        // Prefer cover role; otherwise first wins.
        if (existing && row.role !== 'cover') continue;
        map.set(row.entity_id, {
          id: next.id,
          url: next.url,
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
