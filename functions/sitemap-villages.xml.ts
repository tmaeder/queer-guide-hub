import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // seo_indexable + duplicate + shell_status gates, matching the other
  // sitemaps. shell_status is never NULL on this table, so `not.in` cannot
  // silently drop rows to the SQL NULL-comparison trap (verified 2026-08-02).
  const rows = await fetchRows(
    env,
    'queer_villages',
    'slug,updated_at',
    'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/villages/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'monthly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
