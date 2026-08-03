/**
 * Sitemap for the standalone landing pages: /spaces/:tag, /pride/:year, and
 * /pride/:year/:city. Slugs/years come from the static lists exported by
 * functions/_lib/landing.ts plus a dynamic city aggregation from Supabase.
 */
import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';
import { IDENTITY_SLUGS, PRIDE_YEARS, PRIDE_REGION_SLUGS } from './_lib/landing';

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
    for (const region of PRIDE_REGION_SLUGS) {
      entries.push({
        loc: `${ORIGIN}/pride/${year}/region/${region}`,
        lastmod,
        changefreq: 'weekly',
        priority: 0.55,
      });
    }
  }

  // Pride per major city. The 200 is a DELIBERATE editorial bound, not the
  // db-max-rows truncation fixed elsewhere: each city fans out to 3 pride
  // years, so this is already 600 URLs. Keep it explicit.
  const cities = await fetchRows(
    env,
    'cities',
    'slug,is_major_city',
    'slug=not.is.null&is_major_city=eq.true&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
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
