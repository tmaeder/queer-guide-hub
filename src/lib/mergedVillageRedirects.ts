/**
 * Villages that were hard-merged into their city (migration 20260928100000).
 *
 * These 14 `queer_villages` rows were never districts — they carried the same
 * name as their parent city, so `/villages/x` and `/city/x` published two
 * competing pages about the same place. The rows are deleted, which means
 * `village_slug_redirects` cannot carry the redirect: it cascades away with the
 * spine row, and it only ever resolves to another `/villages/:slug`.
 *
 * `public/_redirects` holds the same 14 pairs as edge 301s and is what serves a
 * cold inbound link. This map covers what those rules cannot see: the
 * `/:lang/`-prefixed paths and client-side navigation inside the SPA.
 * `src/lib/__tests__/mergedVillageRedirects.test.ts` keeps the two in step.
 */
export const MERGED_VILLAGE_CITY_SLUGS: Readonly<Record<string, string>> = {
  'asbury-park': 'asbury-park',
  guerneville: 'guerneville',
  'hudson-ny': 'hudson',
  'new-hope-pa': 'new-hope',
  northampton: 'northampton',
  ogunquit: 'ogunquit',
  'palm-springs': 'palm-springs',
  'pine-city': 'pine-city',
  provincetown: 'provincetown',
  'rehoboth-beach': 'rehoboth-beach',
  saugatuck: 'saugatuck',
  sitges: 'sitges',
  'west-hollywood': 'west-hollywood',
  'wilton-manors': 'wilton-manors',
};

/** City slug a merged village slug now resolves to, or null if it wasn't merged. */
export function mergedVillageCitySlug(villageSlug: string | undefined | null): string | null {
  if (!villageSlug) return null;
  return MERGED_VILLAGE_CITY_SLUGS[villageSlug] ?? null;
}
