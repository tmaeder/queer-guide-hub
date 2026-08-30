import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // P1.1 — seo_indexable gate.
  // Safety layer — hotels carry `safety_gated` too (Business Spine, 2026-07-26)
  // and this sitemap was missing the filter that venues/events/milestones all
  // have. fetchRows prefers the service-role key and so bypasses RLS, meaning
  // nothing else would have stopped a hotel in a criminalizing country from
  // being advertised to crawlers. Same defect class as PR #2513.
  const rows = await fetchRows(
    env,
    'hotels',
    'slug,updated_at',
    // archived_at is stated independently of seo_indexable on purpose. No job
    // currently rewrites hotels.seo_indexable, but the news sitemap next door
    // has exactly that problem (run_news_safe_publish_sweep re-flags archived
    // rows), so relying on the archive→deindex coupling is a habit worth not
    // forming.
    'slug=not.is.null&seo_indexable=eq.true&safety_gated=eq.false&duplicate_of_id=is.null&archived_at=is.null',
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/hotels/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
