import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

export interface GalleryImage {
  /** Best full-size URL (R2-optimized when available, else raw). */
  full: string;
  /** Best thumbnail URL for the strip (R2 thumb → optimized → raw). */
  thumb: string;
  alt: string | null;
}

/**
 * Canonical key for matching a listing image URL to its image_assets row.
 * image_assets.url is stored without the query string (e.g. Shopify's
 * `?v=...` cache-buster is dropped), so match on origin+pathname only.
 */
function canonKey(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

interface AssetRow {
  sort_order: number | null;
  image_assets: {
    url: string | null;
    optimized_url: string | null;
    thumbnail_url: string | null;
    optimization_status: string | null;
    alt_text: string | null;
  } | null;
}

/**
 * Ordered, R2-optimized gallery images for one marketplace_listing.
 *
 * `useEntityImageAssets` only returns the single best *cover* asset per
 * entity, which can't drive a multi-image strip. This fetches every
 * image_asset_link for the listing, keyed by the asset's canonical `url`,
 * then walks the listing's own `images[]` (the source-of-truth ordering)
 * and upgrades each to its optimized/thumbnail R2 copy via resolveImageUrl,
 * falling back to the raw URL when no asset row exists.
 */
export function useListingImages(
  listingId: string | undefined,
  rawImages: string[] | null | undefined,
): { images: GalleryImage[]; loading: boolean } {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);

  const rawKey = (rawImages ?? []).join('|');

  useEffect(() => {
    let cancelled = false;
    const raws = (rawImages ?? []).filter((u) => u && u.trim());

    // Seed synchronously with raw URLs so the gallery paints immediately,
    // then upgrade to optimized copies once the asset query resolves.
    const seed: GalleryImage[] = raws.map((u) => ({ full: u, thumb: u, alt: null }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paint raw URLs immediately on id change, then upgrade to R2 copies once the async fetch resolves.
    setImages(seed);

    if (!listingId) return;
    setLoading(true);

    (async () => {
      const { data, error } = await untypedFrom('image_asset_links')
        .select(
          'sort_order, image_assets!inner(url, optimized_url, thumbnail_url, optimization_status, status, alt_text)',
        )
        .eq('entity_type', 'marketplace_listing')
        .eq('entity_id', listingId)
        .eq('image_assets.status', 'active')
        .order('sort_order', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.warn('useListingImages:', error.message);
        setLoading(false);
        return;
      }

      const rows = (data as unknown as AssetRow[]) ?? [];
      // Map canonical original URL → optimized/thumbnail copies (only when
      // confirmed uploaded to R2; pending/failed rows would 404).
      const byUrl = new Map<string, { optimized: string | null; thumb: string | null; alt: string | null }>();
      const ordered: AssetRow[] = [];
      for (const row of rows) {
        const a = row.image_assets;
        if (!a) continue;
        const status = a.optimization_status;
        if (status !== 'optimized' && status !== 'cdn_optimized') continue;
        ordered.push(row);
        if (a.url) {
          byUrl.set(canonKey(a.url), { optimized: a.optimized_url, thumb: a.thumbnail_url, alt: a.alt_text });
        }
      }

      let result: GalleryImage[];
      if (raws.length > 0) {
        // Preserve the listing's own ordering; upgrade each to R2 when matched.
        result = raws.map((u) => {
          const match = byUrl.get(canonKey(u));
          return {
            full: resolveImageUrl({ imageUrl: u, optimizedUrl: match?.optimized, thumbnailUrl: match?.thumb }) ?? u,
            thumb:
              resolveImageUrl({ imageUrl: u, optimizedUrl: match?.optimized, thumbnailUrl: match?.thumb, preferThumb: true }) ?? u,
            alt: match?.alt ?? null,
          };
        });
      } else {
        // No raw images on the row — fall back to the linked assets directly.
        result = ordered
          .map((row) => {
            const a = row.image_assets!;
            const full = resolveImageUrl({ imageUrl: a.url, optimizedUrl: a.optimized_url, thumbnailUrl: a.thumbnail_url });
            const thumb = resolveImageUrl({
              imageUrl: a.url,
              optimizedUrl: a.optimized_url,
              thumbnailUrl: a.thumbnail_url,
              preferThumb: true,
            });
            return full ? { full, thumb: thumb ?? full, alt: a.alt_text } : null;
          })
          .filter((x): x is GalleryImage => x !== null);
      }

      setImages(result);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawImages compared by rawKey
  }, [listingId, rawKey]);

  return { images, loading };
}
