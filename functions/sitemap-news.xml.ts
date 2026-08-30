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
    // archived_at is NOT redundant with seo_indexable, though it looks it:
    // archive_entity('news') sets seo_indexable=false, but the nightly
    // `run_news_safe_publish_sweep` selects on quality_status='review' alone
    // and sets seo_indexable=true — so it will happily re-flag an ARCHIVED
    // article and hand it straight back to this sitemap. RLS and newsDetail
    // still hide the row, so this filter is what stops us advertising a URL
    // that answers 404. Do not "simplify" it away.
    'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&content=not.is.null&archived_at=is.null',
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
