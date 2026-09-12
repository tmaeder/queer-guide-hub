import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

/**
 * Podcast SHOW pages. Episodes are not listed here — they live at /news/:slug
 * and are already advertised by sitemap-news.xml; a second entry for the same
 * URL would be a duplicate, not extra coverage.
 *
 * This exists because hubLinks caps /podcasts at 80 links, and there are ~255
 * shows with episodes. Without it a quarter of them have no crawl path at all.
 *
 * `episode_count=gt.0` is the SAME gate the hub query and the crawler body use.
 * A show that has never committed an episode is a thin page, and advertising
 * one is how a whole URL space gets discounted. The three predicates must stay
 * identical — see HUBS['/podcasts'] in functions/_lib/hubLinks.ts.
 */
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'news_sources',
    'slug,updated_at',
    // fetchRows reads with the service role, so RLS does not apply and every
    // gate has to be explicit.
    'slug=not.is.null&feed_type=eq.podcast&is_active=eq.true&episode_count=gt.0',
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/podcasts/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
