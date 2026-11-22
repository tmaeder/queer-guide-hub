/**
 * Festival brands (/festivals/:slug). Read from `festivals_crawlable`, which
 * applies the safety gate live — fetchRows uses the service role, so RLS on the
 * base table filters nothing.
 */
import {
  withEdgeCache,
  fetchRows,
  urlsetXml,
  xmlResponse,
  ORIGIN,
  type Env,
  type SitemapEntry,
} from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = withEdgeCache(async ({ env }) => {
  const rows = await fetchRows(env, 'festivals_crawlable', 'slug,updated_at', 'slug=not.is.null');
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/festivals/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
});
