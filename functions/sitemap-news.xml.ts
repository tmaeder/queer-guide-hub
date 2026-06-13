import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

/**
 * News detail pages are first-class again (the P1.2 410 Gone handler was
 * removed). Paginate indexable, non-duplicate articles so Google can
 * re-discover them. seo_indexable gates out low-quality / unverified rows.
 */
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'news_articles',
    'slug,updated_at',
    'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&content=not.is.null',
    5000,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/news/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'daily',
      priority: 0.5,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
