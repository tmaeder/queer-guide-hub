import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // P1.1 — seo_indexable gate; also drop past/cancelled events from the
  // sitemap so Google doesn't waste crawl on stale event pages.
  // Safety layer — exclude high-risk-country (safety_gated) events so their
  // URLs are never published to crawlers (service-role fetch bypasses RLS).
  const today = new Date().toISOString().slice(0, 10);
  const rows = await fetchRows(
    env,
    'events',
    'slug,updated_at',
    `slug=not.is.null&seo_indexable=eq.true&status=neq.cancelled&start_date=gte.${today}&safety_gated=eq.false`,
    5000,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/events/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'daily',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
