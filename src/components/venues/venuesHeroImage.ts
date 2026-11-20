/**
 * The image request the /venues featured hero makes — shared by VenuesHero
 * and the edge middleware that preloads it (functions/_lib/venuesHeroPreload.ts).
 *
 * They must agree byte for byte: a `<link rel="preload" imagesrcset imagesizes>`
 * only helps when the browser picks the same candidate for the later `<img>`.
 * Plain data, no imports, so functions/ can read it directly.
 */
export const VENUES_HERO_SIZES = '(min-width: 768px) 60vw, 100vw';

/** Candidate widths for the Cloudflare srcset (the `cover` role's set). */
export const VENUES_HERO_WIDTHS = [400, 800, 1200];

/**
 * `<meta name>` the edge uses to tell the page which featured venue it
 * preloaded, so the carousel opens on that slide instead of a random one.
 */
export const VENUES_HERO_META_NAME = 'qg-venues-hero';

/** How many featured venues the rotation draws from. */
export const VENUES_FEATURED_LIMIT = 12;
