/**
 * Sitemap for the standalone landing pages: /spaces/:tag, /pride/:year, and
 * /pride/:year/:city. Slugs/years come from the static lists exported by
 * functions/_lib/landing.ts plus a dynamic city aggregation from Supabase.
 */
import { fetchRows, urlsetXml, xmlResponse, ORIGIN, type Env, type SitemapEntry } from './_lib/sitemap';
import { IDENTITY_SLUGS, prideYears, PRIDE_REGION_SLUGS } from './_lib/landing';

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

  const years = prideYears();

  for (const year of years) {
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

  // Pride per city, derived from the events that EXIST.
  //
  // This used to be `is_major_city` cities × `PRIDE_YEARS.slice(-3)`, and
  // slice(-3) takes the last three years of a hardcoded 2024..2030 range —
  // 2028, 2029, 2030 — not the next three. Measured 2026-09-10: the corpus
  // held 197 pride events across 143 cities for 2026 and 128 across 124 for
  // 2027, and ZERO for 2028-2030. So the sitemap published ~600 city URLs for
  // years with no events and none at all for the year the site was in — 618 of
  // its 647 entries were speculative, each ~1,600 characters of template with
  // no content links, which is thin/doorway content at scale and a crawl-budget
  // drain.
  //
  // Deriving the pairs from events instead means a /pride/:year/:city URL is
  // advertised only when there is something on it, and the set self-maintains
  // as the calendar fills. The city gate matches sitemap-places.xml so a ghost
  // or merged shell cannot re-enter through this door.
  const prideRows = await fetchRows(
    env,
    'events',
    'start_date,cities(slug,seo_indexable,duplicate_of_id,shell_status)',
    `event_type=eq.pride&duplicate_of_id=is.null&safety_gated=eq.false&city_id=not.is.null&start_date=gte.${years[0]}-01-01&start_date=lt.${years[years.length - 1] + 1}-01-01`,
    5000,
  ).catch(() => []);

  const seen = new Set<string>();
  for (const row of prideRows) {
    const start = typeof row.start_date === 'string' ? row.start_date : null;
    const city = row.cities as Record<string, unknown> | null | undefined;
    if (!start || !city) continue;
    const slug = typeof city.slug === 'string' ? city.slug : null;
    if (!slug) continue;
    if (city.seo_indexable !== true) continue;
    if (city.duplicate_of_id != null) continue;
    if (city.shell_status === 'ghost' || city.shell_status === 'merged') continue;
    const year = Number(start.slice(0, 4));
    if (!years.includes(year)) continue;
    const key = `${year}/${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      loc: `${ORIGIN}/pride/${year}/${encodeURIComponent(slug)}`,
      lastmod,
      changefreq: 'weekly',
      priority: 0.5,
    });
  }

  return xmlResponse(urlsetXml(entries), 3600);
};
