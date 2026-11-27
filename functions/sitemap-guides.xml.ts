/**
 * Guides (/guides/:slug). guideDetail in detail.ts has rendered a crawler head
 * since the Unified Guides family shipped, but no sitemap listed them and the
 * /guides hub links to none, so they were undiscoverable.
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
  // Same gate as guideDetail: published, and never a safety-gated guide
  // (fetchRows uses the service role, so RLS filters nothing).
  const rows = await fetchRows(
    env,
    'guides',
    'slug,updated_at',
    'slug=not.is.null&status=eq.published&safety_gated=eq.false',
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/guides/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
});
