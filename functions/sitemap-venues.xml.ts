import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // P1.1 — only include rows whose seo_indexable flag is true. The DB default
  // is true, but admin/editorial workflows can flip it to remove placeholder
  // or low-quality rows from search without deleting them.
  // Safety layer — exclude high-risk-country (safety_gated) venues so their
  // URLs are never published to crawlers. fetchRows uses the service-role key
  // (RLS bypassed), so this filter must be explicit.
  const rows = await fetchRows(
    env,
    'venues',
    'slug,updated_at',
    'slug=not.is.null&seo_indexable=eq.true&safety_gated=eq.false',
    5000,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/venues/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'weekly',
      priority: 0.6,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
