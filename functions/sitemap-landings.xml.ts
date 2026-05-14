/**
 * Sitemap for the standalone landing pages: /spaces/:tag, /pride/:year, and
 * /pride/:year/:city. Slugs/years come from the static lists exported by
 * functions/_lib/landing.ts plus a dynamic city aggregation from Supabase.
 */
import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';
import { IDENTITY_SLUGS, PRIDE_YEARS } from './_lib/landing';

const today = () => new Date().toISOString().slice(0, 10);

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const lastmod = today();
  const entries: SitemapEntry[] = [];

  for (const slug of IDENTITY_SLUGS) {
    entries.push({
      loc: `${ORIGIN}/spaces/${encodeURIComponent(slug)}`,
      lastmod,
      changefreq: 'weekly',
      priority: 0.7,
    });
  }

  for (const year of PRIDE_YEARS) {
    entries.push({
      loc: `${ORIGIN}/pride/${year}`,
      lastmod,
      changefreq: 'weekly',
      priority: 0.6,
    });
  }

  // Pride per major city — fetch top cities by population so the sitemap
  // stays bounded. Skip if Supabase isn't configured.
  const cities = await fetchRows(
    env,
    'cities',
    'slug,is_major_city',
    'slug=not.is.null&is_major_city=eq.true',
    200,
  ).catch(() => []);

  for (const c of cities) {
    if (typeof c.slug !== 'string' || !c.slug) continue;
    for (const year of PRIDE_YEARS.slice(-3)) {
      entries.push({
        loc: `${ORIGIN}/pride/${year}/${encodeURIComponent(c.slug as string)}`,
        lastmod,
        changefreq: 'weekly',
        priority: 0.5,
      });
    }
  }

  return xmlResponse(urlsetXml(entries), 3600);
};
