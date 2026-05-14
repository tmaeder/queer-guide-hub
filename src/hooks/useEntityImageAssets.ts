import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface EntityImageAsset {
  optimized_url: string | null;
  thumbnail_url: string | null;
  optimization_status: string | null;
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
      setAssets(new Map());
      return;
    }
    setLoading(true);

    (async () => {
      const ids = key.split(',');
      const { data, error } = await untypedFrom('image_asset_links')
        .select('entity_id, role, image_assets!inner(optimized_url, thumbnail_url, optimization_status, status)')
        .eq('entity_type', entityType)
        .in('entity_id', ids)
        .eq('image_assets.status', 'active');

      if (cancelled) return;
      if (error) {
        console.warn('useEntityImageAssets:', error.message);
        setAssets(new Map());
        setLoading(false);
        return;
      }

      const map = new Map<string, EntityImageAsset>();
      type Row = {
        entity_id: string;
        role: string;
        image_assets: {
          optimized_url: string | null;
          thumbnail_url: string | null;
          optimization_status: string | null;
        };
      };
      for (const row of (data as unknown as Row[]) ?? []) {
        const existing = map.get(row.entity_id);
        const next = row.image_assets;
        if (!next) continue;
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
