import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // These two had NO gates beyond a non-null slug. The service-role fetch
  // bypasses RLS, so every filter has to be spelled out: seo_indexable
  // (3,026 cities had it false), duplicate_of_id (merged rows are redirect
  // stubs) and shell_status (ghost = a row archived as a non-place, merged =
  // folded into another city). Counts measured 2026-08-02.
  // shell_status is never NULL on either table, so `not.in` is safe here —
  // against a nullable column it would silently drop every NULL row.
  const geoFilter =
    'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)';
  const [cities, countries] = await Promise.all([
    fetchRows(env, 'cities', 'slug,updated_at', geoFilter),
    fetchRows(env, 'countries', 'slug,updated_at', geoFilter),
  ]);
  const entries: SitemapEntry[] = [];

  for (const r of cities) {
    if (typeof r.slug !== 'string' || !r.slug) continue;
    entries.push({
      loc: `${ORIGIN}/city/${encodeURIComponent(r.slug)}`,
      lastmod: typeof r.updated_at === 'string' ? r.updated_at.slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.7,
    });
  }

  for (const r of countries) {
    if (typeof r.slug !== 'string' || !r.slug) continue;
    entries.push({
      loc: `${ORIGIN}/country/${encodeURIComponent(r.slug)}`,
      lastmod: typeof r.updated_at === 'string' ? r.updated_at.slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    });
  }

  return xmlResponse(urlsetXml(entries), 3600);
};
