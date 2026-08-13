import {
  fetchRows,
  urlsetXml,
  xmlResponse,
  ORIGIN,
  type Env,
  type SitemapEntry,
} from './_lib/sitemap';

/**
 * The 56 glossary category pages (10 parent lines × ~46 stops).
 *
 * New in 2026-08: the category used to be a query param (`?cat=`), so these
 * were not URLs at all and no sitemap could have listed them. Now that
 * `/tags/c/:categorySlug` is a route with its own `<h1>` and its own edge meta
 * (see routeMeta's `/tags/c/` branch), they are worth crawling.
 *
 * Higher priority than an individual term: a category page is a hub that links
 * to dozens of them.
 */
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(env, 'tag_categories', 'slug,updated_at,level', 'level=lte.1');
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/tags/c/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.5,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
