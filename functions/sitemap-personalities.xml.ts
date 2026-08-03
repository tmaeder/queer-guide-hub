import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  // P1.1 — seo_indexable gate, PLUS visibility.
  //
  // seo_indexable alone is not enough: it defaults true and is only cleared by
  // the thin-content trigger, so it says nothing about whether a row is
  // published. fetchRows prefers the service-role key and so bypasses RLS —
  // without the visibility filter this sitemap advertised 4,669 draft
  // personalities to crawlers (measured 2026-08), among them every row the
  // namesake repair had just unpublished for carrying the wrong human's
  // identity.
  const rows = await fetchRows(
    env,
    'personalities',
    'slug,updated_at',
    'slug=not.is.null&seo_indexable=eq.true&visibility=eq.public&duplicate_of_id=is.null',
  );
  const entries: SitemapEntry[] = rows
    .filter((r) => typeof r.slug === 'string' && (r.slug as string).length > 0)
    .map((r) => ({
      loc: `${ORIGIN}/personalities/${encodeURIComponent(r.slug as string)}`,
      lastmod: typeof r.updated_at === 'string' ? (r.updated_at as string).slice(0, 10) : undefined,
      changefreq: 'monthly',
      priority: 0.5,
    }));
  return xmlResponse(urlsetXml(entries), 3600);
};
