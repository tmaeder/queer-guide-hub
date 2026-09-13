/**
 * Data-driven content links for the crawler body of the hub pages.
 *
 * WHY THIS EXISTS
 *
 * Measured on production 2026-09-10: of the ~65 `href`s Googlebot received on
 * /venues, 57 were `/assets/*` bundles and five were site nav. ZERO pointed at
 * a venue. The same held for /cities, /tags, /personalities and /events — the
 * hub for 23,664 venue pages linked none of them. So all 61,718 URLs the
 * sitemaps publish were sitemap-only: no internal link equity, no crawl path,
 * and a dependency on Google's render budget at 60k scale. That is the classic
 * "Discovered – currently not indexed" shape.
 *
 * STATIC_ROUTE_BODY in routeBody.ts can only carry hand-written links, which is
 * why this is a separate, DB-backed module rather than more entries there.
 *
 * The two-hop payoff is the real prize: cityDetail already lists a city's
 * venues and events as real <a href> links, so linking cities from /cities
 * opens `/cities → /city/berlin → /venues/:slug` for the whole corpus. The
 * missing edge was only ever hub → detail.
 *
 * THREE RULES, none of them optional
 *
 * 1. BOT-ONLY. The caller invokes this inside the `isBot` branch of
 *    functions/_middleware.ts, so a human page view never pays for the query.
 *
 * 2. THE GATES ARE COPIED VERBATIM FROM THE SITEMAP GENERATORS, which are the
 *    already-reviewed source of truth for "may a crawler see this row".
 *    fetchRows PREFERS the service-role key and therefore BYPASSES RLS, so
 *    `safety_gated=eq.false` has to be stated explicitly — omitting it would
 *    publish venues and events in criminalizing countries to anonymous
 *    crawlers. That is the exact defect that hit villageDetail and
 *    personalityDetail before, and it is an outing risk, not a ranking bug.
 *    `cities` and `countries` have no safety_gated column by design (the safety
 *    layer gates venues/events/orgs, never the place page itself).
 *
 * 3. CONTENT PARITY. Every link here points at a page the SPA also renders in
 *    its own listing for the same route, so this stays inside the cloaking
 *    contract in docs/SEO.md — a subset of what a real user sees, never more.
 */
import { fetchRows, type Env } from './sitemap';

type HubSpec = {
  /** Postgres table to read. */
  table: string;
  /** Column holding the human-readable label. */
  labelColumn: string;
  /** URL prefix for the detail route, e.g. '/venues/'. */
  prefix: string;
  /**
   * PostgREST filter. Copied from the matching functions/sitemap-*.xml.ts —
   * change them together or the crawler body and the sitemap disagree about
   * what is publishable.
   */
  filter: string;
  /**
   * Ordering. Deliberately by quality/usage rather than `updated_at`: these are
   * the pages we most want crawled and they are a stable set, where
   * recently-touched would rotate the link target on every ingest run and never
   * accumulate equity anywhere.
   *
   * EVERY order MUST end in `,slug.asc`, and that is not cosmetic tidying.
   * The ranking columns are coarse: `venues.quality_score` has just 12 distinct
   * values across 23,664 rows, with 648 TIED AT THE TOP SCORE OF 95 — so the 60
   * links a hub emits are 60 rows drawn from a 648-row tie, and SQL guarantees
   * no ordering within a tie. Three consecutive live queries did return the
   * same 60, but that only demonstrates one plan against unchanged data;
   * `venues` is rewritten continuously by the truth engines, so a plan change,
   * a VACUUM or a score update can reshuffle the set. Rotating links are worse
   * than none: the crawl graph never settles and no page accumulates equity.
   * The tiebreaker makes the emitted set a deterministic function of the data.
   */
  order: string;
  limit: number;
  heading: string;
};

const HUBS: Record<string, HubSpec[]> = {
  '/venues': [
    {
      table: 'venues',
      labelColumn: 'name',
      prefix: '/venues/',
      filter: 'slug=not.is.null&seo_indexable=eq.true&safety_gated=eq.false&duplicate_of_id=is.null',
      order: 'quality_score.desc.nullslast,slug.asc',
      limit: 60,
      heading: 'LGBTQ+ venues on Queer Guide',
    },
  ],
  '/podcasts': [
    {
      table: 'news_sources',
      labelColumn: 'name',
      prefix: '/podcasts/',
      // Copied verbatim from functions/sitemap-podcasts.xml.ts, per this file's
      // rule that a hub's gate and its sitemap's gate are the same literal.
      filter: 'slug=not.is.null&feed_type=eq.podcast&is_active=eq.true&episode_count=gt.0',
      order: 'episode_count.desc.nullslast,slug.asc',
      limit: 80,
      heading: 'LGBTQ+ podcasts on Queer Guide',
    },
  ],
  '/events': [
    {
      table: 'events',
      labelColumn: 'title',
      // start_date is interpolated by the caller — see EVENTS_TODAY_TOKEN.
      prefix: '/events/',
      filter:
        'slug=not.is.null&seo_indexable=eq.true&status=neq.cancelled&safety_gated=eq.false&duplicate_of_id=is.null&start_date=gte.__TODAY__',
      order: 'start_date.asc,slug.asc',
      limit: 60,
      heading: 'Upcoming LGBTQ+ events',
    },
  ],
  '/cities': [
    {
      table: 'cities',
      labelColumn: 'name',
      prefix: '/city/',
      filter:
        'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
      order: 'completeness_score.desc.nullslast,slug.asc',
      limit: 80,
      heading: 'LGBTQ+ city guides',
    },
  ],
  '/places': [
    {
      table: 'cities',
      labelColumn: 'name',
      prefix: '/city/',
      filter:
        'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
      order: 'completeness_score.desc.nullslast,slug.asc',
      limit: 60,
      heading: 'LGBTQ+ city guides',
    },
    {
      table: 'countries',
      labelColumn: 'name',
      prefix: '/country/',
      filter:
        'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
      order: 'name.asc,slug.asc',
      limit: 60,
      heading: 'Countries',
    },
  ],
  '/tags': [
    {
      table: 'unified_tags',
      labelColumn: 'name',
      prefix: '/tags/',
      // unified_tags has no duplicate_of_id — merges use merged_into_id, and
      // status=eq.active already excludes a merged row.
      filter: 'slug=not.is.null&status=eq.active&seo_indexable=eq.true',
      order: 'usage_count.desc.nullslast,slug.asc',
      limit: 80,
      heading: 'Most-used glossary terms',
    },
  ],
  '/personalities': [
    {
      table: 'personalities',
      labelColumn: 'name',
      prefix: '/personalities/',
      filter:
        'slug=not.is.null&seo_indexable=eq.true&visibility=eq.public&duplicate_of_id=is.null',
      order: 'completeness_score.desc.nullslast,slug.asc',
      limit: 60,
      heading: 'Notable LGBTQ+ people',
    },
  ],
  '/hotels': [
    {
      table: 'hotels',
      labelColumn: 'name',
      prefix: '/hotels/',
      filter:
        'slug=not.is.null&seo_indexable=eq.true&safety_gated=eq.false&duplicate_of_id=is.null&archived_at=is.null',
      order: 'completeness_score.desc.nullslast,slug.asc',
      limit: 60,
      heading: 'LGBTQ+ friendly hotels',
    },
  ],
};

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stringField = (row: Record<string, unknown>, key: string): string | null => {
  const v = row[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
};

/** True if this path has a data-driven link block. */
export function isHubPath(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(HUBS, pathname);
}

/** The hub paths, for tests and for the seo-check content-link assertion. */
export const HUB_PATHS = Object.keys(HUBS);

/**
 * Build the crawler link block for a hub path. Returns '' for a non-hub path,
 * and '' if every query came back empty — never a heading with nothing under
 * it, which would read as a broken section to a crawler.
 *
 * Failure is soft on purpose: fetchRows already logs and returns partial rows
 * on a bad response, and a hub page that loses its link block is strictly no
 * worse than the state before this module existed. It must never take the page
 * down.
 */
export async function buildHubLinksHtml(env: Env, pathname: string): Promise<string> {
  const specs = HUBS[pathname];
  if (!specs) return '';

  const today = new Date().toISOString().slice(0, 10);

  const sections = await Promise.all(
    specs.map(async (spec) => {
      try {
        const rows = await fetchRows(
          env,
          spec.table,
          `slug,${spec.labelColumn}`,
          spec.filter.replace('__TODAY__', today),
          spec.limit,
          spec.order,
        );
        const items = rows
          .map((r) => {
            const slug = stringField(r, 'slug');
            const label = stringField(r, spec.labelColumn);
            if (!slug || !label) return null;
            return `<li><a href="${spec.prefix}${encodeURIComponent(slug)}">${escape(label)}</a></li>`;
          })
          .filter((x): x is string => x !== null);
        if (items.length === 0) return '';
        return `<section><h2>${escape(spec.heading)}</h2><ul>\n        ${items.join('\n        ')}\n      </ul></section>`;
      } catch (err) {
        console.warn(`[hubLinks] ${pathname} ${spec.table} failed: ${String(err)}`);
        return '';
      }
    }),
  );

  const body = sections.filter(Boolean).join('\n    ');
  if (!body) return '';
  return `\n  <nav aria-label="Browse" data-prerendered="hub-links">\n    ${body}\n  </nav>`;
}
