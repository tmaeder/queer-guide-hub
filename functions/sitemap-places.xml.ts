import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const [cities, countries] = await Promise.all([
    fetchRows(env, 'cities', 'slug,updated_at', 'slug=not.is.null', 5000),
    fetchRows(env, 'countries', 'slug,updated_at', 'slug=not.is.null', 500),
  ]);
  const entries: SitemapEntry[] = [];
  for (const r of cities) {
    if (typeof r.slug !== 'string' || !r.slug) continue;
    entries.push({
      loc: `${ORIGIN}/city/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.7,
    });
  }
  for (const r of countries) {
    if (typeof r.slug !== 'string' || !r.slug) continue;
    entries.push({
      loc: `${ORIGIN}/country/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    });
  }
  return xmlResponse(urlsetXml(entries), 3600);
};
