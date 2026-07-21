import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // Service key bypasses RLS — the seo_indexable + safety_gated filters must be
  // explicit (gated milestones are members-only, never crawler-visible).
  const rows = await fetchRows(
    env,
    'milestones',
    'slug,updated_at',
    'slug=not.is.null&seo_indexable=eq.true&status=eq.published&safety_gated=eq.false',
    5000,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/history/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'monthly',
      priority: 0.5,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
