/**
 * Sitemap for the standalone landing pages: /spaces/:tag, /pride/:year, and
 * /pride/:year/:city. Slugs/years come from the static lists exported by
 * functions/_lib/landing.ts plus a dynamic city aggregation from Supabase.
 */
import {
  withEdgeCache,
  fetchRows,
  urlsetXml,
  xmlResponse,
  ORIGIN,
  type Env,
  type SitemapEntry,
} from './_lib/sitemap';
import {
  IDENTITY_SLUGS,
  MIN_LANDING_EVENTS,
  prideYears,
  PRIDE_REGION_SLUGS,
  prideRegionCountries,
} from './_lib/landing';

const today = () => new Date().toISOString().slice(0, 10);

export const onRequest: PagesFunction<Env> = withEdgeCache(async ({ env }) => {
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
    'start_date,country,cities(slug,seo_indexable,duplicate_of_id,shell_status)',
    `event_type=eq.pride&duplicate_of_id=is.null&safety_gated=eq.false&city_id=not.is.null&start_date=gte.${years[0]}-01-01&start_date=lt.${years[years.length - 1] + 1}-01-01`,
    5000,
  ).catch(() => []);

  // Every landing below MIN_LANDING_EVENTS renders noindex (landing.ts), so
  // only advertise the ones that clear it. Counted from the same rows as the
  // pages' own queries; this set is a SUBSET of what each page counts (it
  // additionally requires city_id and excludes duplicates), so a URL listed
  // here can never render noindex — the error can only be omitting one.
  const yearCount = new Map<number, number>();
  const regionCount = new Map<string, number>();
  const cityCount = new Map<string, number>();
  for (const row of prideRows) {
    const start = typeof row.start_date === 'string' ? row.start_date : null;
    if (!start) continue;
    const year = Number(start.slice(0, 4));
    if (!years.includes(year)) continue;
    yearCount.set(year, (yearCount.get(year) ?? 0) + 1);
    const country = typeof row.country === 'string' ? row.country : null;
    if (country) {
      for (const region of PRIDE_REGION_SLUGS) {
        if (prideRegionCountries(region).includes(country)) {
          const k = `${year}/${region}`;
          regionCount.set(k, (regionCount.get(k) ?? 0) + 1);
        }
      }
    }
    const city = row.cities as Record<string, unknown> | null | undefined;
    if (!city) continue;
    const slug = typeof city.slug === 'string' ? city.slug : null;
    if (!slug) continue;
    if (city.seo_indexable !== true) continue;
    if (city.duplicate_of_id != null) continue;
    if (city.shell_status === 'ghost' || city.shell_status === 'merged') continue;
    const k = `${year}/${slug}`;
    cityCount.set(k, (cityCount.get(k) ?? 0) + 1);
  }

  for (const year of years) {
    if ((yearCount.get(year) ?? 0) < MIN_LANDING_EVENTS) continue;
    entries.push({
      loc: `${ORIGIN}/pride/${year}`,
      lastmod,
      changefreq: 'weekly',
      priority: 0.6,
    });
    for (const region of PRIDE_REGION_SLUGS) {
      if ((regionCount.get(`${year}/${region}`) ?? 0) < MIN_LANDING_EVENTS) continue;
      entries.push({
        loc: `${ORIGIN}/pride/${year}/region/${region}`,
        lastmod,
        changefreq: 'weekly',
        priority: 0.55,
      });
    }
  }

  for (const [key, n] of cityCount) {
    if (n < MIN_LANDING_EVENTS) continue;
    const [year, slug] = key.split('/');
    entries.push({
      loc: `${ORIGIN}/pride/${year}/${encodeURIComponent(slug)}`,
      lastmod,
      changefreq: 'weekly',
      priority: 0.5,
    });
  }

  // fetchRows returns [] when the first page fails, and the corpus always has
  // pride events, so zero rows means a failed fetch. Cache that briefly: an
  // hour-long cache once served a 5-entry sitemap with every /pride/ URL gone.
  return xmlResponse(urlsetXml(entries), prideRows.length === 0 ? 60 : 3600);
});
