import {
  DESTINATION_PHOTO_SIZES,
  DESTINATION_PHOTO_WIDTHS,
} from '../../src/components/geo/destinationPhotoImage';
import { buildCfSrcSet } from '../../src/utils/cloudflareOptimizations';
import { imageReferrerPolicy } from '../../src/utils/imageHost';
import { resolveEntityImage } from '../../src/lib/images/resolveEntityImage';

/**
 * `<link rel="preload" as="image">` for a destination hero (city, country,
 * queer village), injected into the document <head> by the middleware.
 *
 * Why: the hero is the LCP element on those pages, and without a preload the
 * browser cannot discover it until the JS graph has loaded and React has
 * rendered DestinationPhoto. Lighthouse mobile (2026-11-20) attributed ~10 s of
 * LCP "load delay" to exactly that on /city/berlin, /country/germany and
 * /villages/chueca (LCP 14–16 s).
 *
 * The preload is only useful if it is the SAME request the <img> later makes:
 *   - srcset + sizes come from the same builder and constants DestinationPhoto
 *     uses, so the browser picks the same candidate for both;
 *   - which photo comes from the SPA's own resolveEntityImage, so a curated or
 *     flagged image is handled the way the page handles it.
 * Where the image cannot be resized (no srcset on the <img>), no preload is
 * emitted: guessing a single URL there risks downloading the hero twice.
 */
export function destinationHeroPreload(url: string | null | undefined): string | null {
  return heroImagePreload(url, DESTINATION_PHOTO_SIZES, DESTINATION_PHOTO_WIDTHS);
}

/**
 * The preload tag for any hero rendered through `<Image>` with a Cloudflare
 * srcset. `sizes` and `widths` must be the values that `<img>` renders with.
 */
export function heroImagePreload(
  url: string | null | undefined,
  sizes: string,
  widths: number[],
): string | null {
  if (!url) return null;
  const srcset = buildCfSrcSet(url, widths);
  if (!srcset) return null;
  const referrer = imageReferrerPolicy(url);
  return (
    `<link rel="preload" as="image" fetchpriority="high"` +
    ` imagesrcset="${attr(srcset)}" imagesizes="${attr(sizes)}"` +
    (referrer ? ` referrerpolicy="${referrer}"` : '') +
    `>`
  );
}

/** The hero URL for a city or country row, by the page's own precedence. */
export function cityOrCountryHeroUrl(
  kind: 'city' | 'country',
  row: Record<string, unknown>,
): string | null {
  return resolveEntityImage(kind, {
    image_url: str(row.image_url),
    curated_image_url: str(row.curated_image_url),
    image_flagged: row.image_flagged === true,
  }).url;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
