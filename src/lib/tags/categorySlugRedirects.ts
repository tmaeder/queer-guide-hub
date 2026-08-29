/**
 * Taxonomy v2 → v3 category-slug redirects (2026-08-29 recategorization).
 *
 * `public/_redirects` carries the same map as 301s for the edge; this copy
 * serves the two paths Cloudflare never sees — in-app navigation (a stale
 * link inside the SPA never leaves the client) and the legacy `?cat=` /
 * `?category=` params, which resolve through `resolveCategorySlug`. The
 * `mergedVillageRedirects` pattern, one entity later.
 *
 * ONLY changed slugs are listed. Surviving stops kept their rows and their
 * URLs in migration 20261006140000, so `sexual-health`, `symbols-flags` and
 * ~30 others are deliberately absent — an entry for them would be a
 * self-redirect.
 *
 * `src/lib/tags/__tests__/categorySlugRedirects.test.ts` parses
 * `public/_redirects` and fails if the two ever disagree.
 */
export const CATEGORY_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  // v2 lines → v3 lines
  'identity-expression': 'identity',
  'sexuality-kink': 'sex-kink',
  'relationships-connection': 'relationships-family',
  'health-wellness': 'health',
  'safety-practices': 'safety-consent',
  'community-culture': 'culture-community',
  // Two v2 lines merge into History & Rights, and two into Places & Scene.
  'history-heritage': 'history-rights',
  'rights-activism': 'history-rights',
  'places-travel': 'places-scene',
  'support-news': 'places-scene',
  // v2 stops that dissolved into another stop
  'sexual-roles': 'bdsm-power-exchange',
  'body-types-archetypes': 'kink-community',
  'care-access': 'physical-reproductive',
  'current-affairs': 'political-activism',
  'professions-allies': 'support-services',
};

/** The v3 slug for a retired v2 slug, or null when the slug still exists. */
export function redirectedCategorySlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return CATEGORY_SLUG_REDIRECTS[slug.toLowerCase()] ?? null;
}
