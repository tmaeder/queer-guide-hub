import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

/**
 * /place/:slug landmark pages. Sourced from search_documents (only approved,
 * non-duplicate landmarks are indexed there) with an explicit safety filter —
 * fetchRows uses the service key, which bypasses RLS.
 */
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'search_documents',
    'slug,updated_at',
    'entity_type=eq.landmark&safety_gated=is.false&slug=not.is.null',
    1000,
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/place/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'monthly',
      priority: 0.5,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
