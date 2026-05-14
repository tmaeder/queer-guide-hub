/**
 * Pick the best available URL for an entity image.
 *
 * Preference order:
 *   1. R2-mirrored `optimized_url` from image_assets (always reachable,
 *      no hotlink-protection / 404 risk).
 *   2. `thumbnail_url` when caller is fine with a smaller image and the
 *      full optimized_url isn't present.
 *   3. The original `image_url` straight from the entity row (may hotlink
 *      to a publisher CDN that 401s / 404s).
 *   4. null — caller swaps to a local fallback via onError.
 *
 * `preferThumb` is a hint for grids that only render at thumb sizes;
 * if true and we have a thumbnail_url, we use it even when an
 * optimized_url is also available.
 */
export interface ResolveImageUrlOpts {
  imageUrl?: string | null;
  optimizedUrl?: string | null;
  thumbnailUrl?: string | null;
  preferThumb?: boolean;
}

export function resolveImageUrl(opts: ResolveImageUrlOpts): string | null {
  const { imageUrl, optimizedUrl, thumbnailUrl, preferThumb } = opts;
  if (preferThumb && thumbnailUrl) return thumbnailUrl;
  if (optimizedUrl) return optimizedUrl;
  if (thumbnailUrl) return thumbnailUrl;
  if (imageUrl && imageUrl.trim()) return imageUrl;
  return null;
}
