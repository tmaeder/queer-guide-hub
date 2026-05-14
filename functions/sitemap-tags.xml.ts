import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'unified_tags',
    'slug,updated_at,status',
    'slug=not.is.null&status=eq.active',
    5000,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/tags/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'monthly',
      priority: 0.4,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
