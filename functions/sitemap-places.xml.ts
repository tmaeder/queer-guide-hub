import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const [cities, countriesByCode, countriesBySlug] = await Promise.all([
    fetchRows(env, 'cities', 'slug,updated_at', 'slug=not.is.null', 5000),
    fetchRows(env, 'countries', 'slug,updated_at', 'slug=not.is.null', 500),
  ]);
  const entries: SitemapEntry[] = [];

  // Cities are reachable under both /places/:slug and the canonical /city/:slug.
  for (const r of cities) {
    if (typeof r.slug !== 'string' || !r.slug) continue;
    const lastmod =
      typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined;
    entries.push({
      loc: `${ORIGIN}/places/${encodeURIComponent(r.slug as string)}`,
      lastmod,
      changefreq: 'weekly',
      priority: 0.7,
    });
    entries.push({
      loc: `${ORIGIN}/city/${encodeURIComponent(r.slug as string)}`,
      lastmod,
      loc: `${ORIGIN}/city/${encodeURIComponent(r.slug)}`,
      lastmod: typeof r.updated_at === 'string' ? r.updated_at.slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.7,
    });
  }

  // Countries are reachable under /places/:code (lowercase ISO) and /country/:slug.
  for (const r of countriesByCode) {
    const code = r.code;
    if (typeof code !== 'string' || !code) continue;
    entries.push({
      loc: `${ORIGIN}/places/${encodeURIComponent(code.toLowerCase())}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    });
  }
  for (const r of countriesBySlug) {
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
