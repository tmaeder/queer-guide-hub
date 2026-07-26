import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';

/**
 * /place/:slug landmark pages. Sourced from geo_places (anon-readable; RLS hides
 * safety-gated rows) with an explicit gate filter for service-key runs, plus an
 * inner-join filter so needs_review seeds never leak into the sitemap.
 * (search_documents is NOT anon-readable, so it can't be the source here.)
 */
export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const rows = await fetchRows(
    env,
    'geo_places',
    'slug,updated_at,geo_landmark_profiles!inner(needs_review)',
    'place_type=eq.landmark&safety_gated=is.false&duplicate_of_id=is.null&seo_indexable=is.true&geo_landmark_profiles.needs_review=is.false',
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
