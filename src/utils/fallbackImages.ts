/**
 * Deterministic on-brand fallback images.
 *
 * The pool is the documented abstract/texture exception to the monochrome rule
 * (warm paper, fluid macro, archival texture) — theme-neutral by design, so it
 * reads coherently behind any entity. Selection is deterministic on
 * `theme:key`, which fixes two problems with the old `Math.random()` picker:
 *   1. the fallback no longer reshuffles on every reload (stable per entity), and
 *   2. different entity types seeded from the same id get different textures, so
 *      a venue and an event with the same id don't show the same placeholder.
 */

const FALLBACK_IMAGES = [
  '/images/fallback/eugene-golovesov--WHbksuuyd8-unsplash.webp',
  '/images/fallback/eugene-golovesov-q2JRA44k_sE-unsplash.webp',
  '/images/fallback/maria-orlova-bU8TeXhsPcY-unsplash.webp',
  '/images/fallback/pexels-anniroenkae-2832456.webp',
  '/images/fallback/pexels-didsss-2911544.webp',
  '/images/fallback/pexels-didsss-3107180.webp',
  '/images/fallback/pexels-didsss-3737718.webp',
  '/images/fallback/pexels-didsss-3906090.webp',
  '/images/fallback/pexels-diva-30278358.webp',
  '/images/fallback/pexels-diva-32962583.webp',
  '/images/fallback/pexels-merlin-11105656.webp',
  '/images/fallback/pexels-solenfeyissa-5450862.webp',
  '/images/fallback/solen-feyissa-VpcT2lx8vNA-unsplash.webp',
  '/images/fallback/solen-feyissa-oGjE-6MlGEc-unsplash.webp',
  '/images/fallback/susan-wilkinson-IsM1xDqN-a8-unsplash.webp',
  '/images/fallback/susan-wilkinson-l9URCYPsJPE-unsplash.webp',
  '/images/fallback/tengyart-9SyJhYYC2iI-unsplash.webp',
  '/images/fallback/vincent-nicolas-HU4JocRicp8-unsplash.webp',
  '/images/fallback/alexandru-ant-EHlp8e-nQ3g-unsplash.webp',
  '/images/fallback/alexandru-ant-ymXJgz_n8vk-unsplash.webp',
  '/images/fallback/eugene-golovesov-hSNFUafkKvM-unsplash.webp',
  '/images/fallback/pawel-czerwinski-BPrk2cOoCq8-unsplash.webp',
  '/images/fallback/pawel-czerwinski-GT2I5UgV218-unsplash.webp',
  '/images/fallback/pawel-czerwinski-JgWp9DNib3k-unsplash.webp',
  '/images/fallback/pawel-czerwinski-NTYYL9Eb9y8-unsplash.webp',
  '/images/fallback/pawel-czerwinski-W_mfoOi1Elc-unsplash.webp',
  '/images/fallback/pawel-czerwinski-qNe0H31x96I-unsplash.webp',
  '/images/fallback/solen-feyissa-cnp-52H9qzo-unsplash.webp',
] as const;

export type FallbackTheme =
  | 'venue' | 'event' | 'hotel' | 'place' | 'person'
  | 'news' | 'marketplace' | 'default';

/** djb2 string hash — same algorithm already used for deterministic image
 * selection in PlacesCard. Returns a non-negative 32-bit integer. */
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h << 5) - h + key.charCodeAt(i);
    h |= 0; // force 32-bit
  }
  return Math.abs(h);
}

/**
 * Pick a deterministic fallback image. The same `(theme, key)` always yields the
 * same image; without a key, a stable per-theme default is returned (never
 * random). `key` should be a stable entity identifier (id or slug).
 */
export function getFallbackImage(theme: FallbackTheme = 'default', key?: string): string {
  if (!key) {
    // Stable per-theme default — distinct lanes so type pages don't all share one.
    return FALLBACK_IMAGES[hashKey(theme) % FALLBACK_IMAGES.length];
  }
  return FALLBACK_IMAGES[hashKey(`${theme}:${key}`) % FALLBACK_IMAGES.length];
}

/**
 * @deprecated Use {@link getFallbackImage} with a theme + entity key so the
 * fallback is stable per entity. Retained as a stable (no longer random) shim
 * for callers not yet migrated; returns the `default` theme default.
 */
export function getRandomFallbackImage(): string {
  return getFallbackImage('default');
}

export { FALLBACK_IMAGES };
