import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_META,
  STATIC_ROUTE_META,
  isIndexable,
  resolveMeta,
} from '../../functions/_lib/routeMeta';
import { STATIC_ROUTE_BODY } from '../../functions/_lib/routeBody';
import { INTENT_NAV } from '@/config/navigation';
import { clientRedirectPaths } from '../test/routeTable';

/**
 * Contract tests for the edge SEO tables.
 *
 * These exist because the failure modes here are all SILENT in production:
 *
 *  - A route missing from STATIC_ROUTE_META falls through to DEFAULT_META,
 *    whose title is byte-identical to the homepage's, AND is omitted from
 *    sitemap-static.xml (which is Object.keys(STATIC_ROUTE_META) filtered by
 *    isIndexable). `/guides` shipped in the primary nav in exactly this state.
 *  - A STATIC_ROUTE_BODY key shadowed by a public/_redirects 301 is dead copy
 *    that no crawler can ever reach. `/help-hotlines` sat dead for months while
 *    the canonical `/help` served the generic fallback body.
 *
 * Both are caught here at merge time instead of by scripts/seo-check.mjs the
 * next morning.
 */

const REPO = join(__dirname, '..', '..');
const redirects = readFileSync(join(REPO, 'public', '_redirects'), 'utf8');

/** Source paths that public/_redirects rewrites away before React ever runs. */
const redirectedSources = redirects
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/)[0])
  .filter(Boolean);

const isShadowedByRedirect = (path: string) =>
  redirectedSources.some((src) =>
    src.endsWith('/*') ? path.startsWith(src.slice(0, -2) + '/') : src === path,
  );

// seo-check.mjs only enforces length bounds on the 12 routes it samples. 14 of
// the pre-existing entries sit outside those bounds and are deliberately not in
// that sample, so asserting bounds table-wide would be a large unrelated
// rewrite. Instead: enforce them on the sampled routes plus anything added from
// here on, which is where a regression would actually be introduced.
const LENGTH_ENFORCED = [
  '/',
  '/venues',
  '/events',
  '/marketplace',
  '/hotels',
  '/travel',
  '/map',
  '/personalities',
  '/tags',
  '/news',
  '/about',
  '/blog',
  // Backfilled 2026-08 — authored to spec, so hold them to it.
  '/guides',
  '/cities',
  '/organizations',
  '/pride',
  '/hub/feed',
  // Intent Router landing pages — DERIVED, not hand-listed, for the reason the
  // INTENT_ROUTES docblock below already gives. This list hand-wrote '/support'
  // long after the support intent moved to '/help', so it held a
  // LocalizedRedirect to landing-page standards and never mentioned the real
  // landing page: exactly the '/shop' failure that docblock describes, sitting
  // two lines above it. Deriving makes the drift unspellable.
  ...INTENT_NAV.map((i) => i.to),
].filter((p, i, a) => a.indexOf(p) === i);

/**
 * Every Intent Router path must be indexable and carry its own meta + body.
 *
 * Read from INTENT_NAV rather than hand-listed: `/shop` sat here for a week
 * after the shop intent moved to /marketplace would have made this table lie,
 * and the failure mode is a redirect source being held to landing-page rules.
 */
const INTENT_ROUTES = [...new Set(INTENT_NAV.map((i) => i.to))];

describe('STATIC_ROUTE_META', () => {
  it('gives every entry a title distinct from the homepage default', () => {
    const offenders = Object.entries(STATIC_ROUTE_META)
      .filter(([path, meta]) => path !== '/' && meta.title === DEFAULT_META.title)
      .map(([path]) => path);
    expect(
      offenders,
      'these routes are indistinguishable from the homepage in search results',
    ).toEqual([]);
  });

  it('has globally unique titles', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [path, meta] of Object.entries(STATIC_ROUTE_META)) {
      const prior = seen.get(meta.title);
      if (prior) dupes.push(`${path} duplicates ${prior}: "${meta.title}"`);
      else seen.set(meta.title, path);
    }
    expect(dupes).toEqual([]);
  });

  it.each(LENGTH_ENFORCED)('%s has title 30-60 and description 70-160 chars', (path) => {
    const meta = STATIC_ROUTE_META[path];
    expect(meta, `${path} is missing from STATIC_ROUTE_META`).toBeDefined();
    expect(meta.title.length, `title: "${meta.title}"`).toBeGreaterThanOrEqual(30);
    expect(meta.title.length, `title: "${meta.title}"`).toBeLessThanOrEqual(60);
    expect(meta.description.length).toBeGreaterThanOrEqual(70);
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it('gives every Intent Router route its own meta and crawler body', () => {
    for (const path of INTENT_ROUTES) {
      expect(STATIC_ROUTE_META[path], `${path} missing from STATIC_ROUTE_META`).toBeDefined();
      expect(STATIC_ROUTE_BODY[path], `${path} missing from STATIC_ROUTE_BODY`).toBeDefined();
      expect(isIndexable(path), `${path} must stay indexable`).toBe(true);
    }
  });

  it('makes intent pages link downward into the browse routes', () => {
    // Intent pages are hubs. If they stopped linking out to the canonical
    // browse/detail routes they would compete with them instead of feeding them.
    // Derived from INTENT_NAV, not hand-listed: this loop named '/support',
    // which has no body at all now that it is a noindexed LocalizedRedirect,
    // and never named '/help' — the page the intent has actually pointed at.
    for (const path of INTENT_ROUTES) {
      const links = STATIC_ROUTE_BODY[path]?.links ?? [];
      expect(links.length, `${path} should link out`).toBeGreaterThanOrEqual(3);
    }
  });

  it('does not describe the marketplace as verified queer-owned', () => {
    // 24 of 2,583 brands carry ownership_tags (0.93%). Ownership is a per-brand
    // label, never a claim over the catalogue.
    const marketplace = STATIC_ROUTE_META['/marketplace'];
    expect(marketplace.title.toLowerCase()).not.toContain('queer-owned');
    expect(STATIC_ROUTE_BODY['/marketplace']?.h1.toLowerCase()).not.toContain('queer-owned');
  });

  it('keeps every indexable entry out of the redirect shadow', () => {
    const offenders = Object.keys(STATIC_ROUTE_META).filter(
      (path) => isIndexable(path) && isShadowedByRedirect(path),
    );
    expect(
      offenders,
      'these appear in sitemap-static.xml but 301 away at the edge before React runs',
    ).toEqual([]);
  });

  /**
   * The check above sees `public/_redirects` only, so it is blind to a route
   * whose element is a client-side `<Navigate>` / `LocalizedRedirect`. The edge
   * answers those 200 — React has not run — so they look like pages to every
   * gate we had: this file, the Intent Router check (which reads INTENT_NAV,
   * and neither was in it), and seo-check.mjs (whose fetch saw a 200 with the
   * route's own body and canonical).
   *
   * `/places` (-> /travel) and `/support` (-> /help) both sat in
   * sitemap-static.xml with a full STATIC_ROUTE_BODY behind them, advertising
   * crawler copy at URLs that bounce every human. Nothing was red.
   */
  it('has no key whose route is a client-side redirect', () => {
    const stubs = clientRedirectPaths();
    // Positive control: an empty stub set would make this assertion vacuous,
    // and the parser is a regex over routes.tsx, so it can silently find none.
    expect(stubs.size, 'the route-table parser found no redirect stubs').toBeGreaterThan(20);

    const offenders = Object.keys(STATIC_ROUTE_META).filter((p) => stubs.has(p));
    expect(
      offenders,
      'these routes redirect client-side, so meta for them puts a redirect ' +
        'source in sitemap-static.xml. Key the meta to the redirect TARGET and ' +
        'add the source to CLIENT_REDIRECT_STUBS in functions/_lib/routeMeta.ts.',
    ).toEqual([]);
  });

  it('keeps report-sharing capability URLs out of search indexes by default', () => {
    expect(isIndexable('/share/redirect-report/00000000-0000-4000-8000-000000000001')).toBe(false);
  });
  it('keeps the authenticated member link workspace out of search indexes', () => {
    expect(isIndexable('/links-workspace')).toBe(false);
    expect(isIndexable('/links-workspace/')).toBe(false);
  });
  it('keeps /places and /support noindexed as well as meta-less', () => {
    // Named, because deleting the meta entry alone leaves NOTHING watching the
    // noindex half: the gate above only inspects META KEYS, and these two are
    // no longer keys. Dropped from CLIENT_REDIRECT_STUBS they would become
    // indexable again, fall through to DEFAULT_META and put two more
    // homepage-titled URLs in the index — outside the sitemap, so quieter than
    // before and still wrong.
    //
    // NOT generalised to "every client-side stub must be noindexed": measured
    // 2026-10-11, 42 other static stubs are still indexable (/africa, /home,
    // /discover, /cities/compare, …). Those are legacy aliases whose fix is an
    // edge 301 in public/_redirects, so that assertion would ship red.
    for (const path of ['/places', '/support']) {
      expect(isIndexable(path), `${path} redirects away and must stay noindex`).toBe(false);
      expect(Object.keys(STATIC_ROUTE_META), `${path} must not be a meta key`).not.toContain(path);
      expect(Object.keys(STATIC_ROUTE_BODY), `${path} must not carry a body`).not.toContain(path);
    }
    // Mirror: the redirect TARGETS must stay indexable, with their own meta.
    for (const path of ['/travel', '/help']) {
      expect(isIndexable(path), `${path} is a real page`).toBe(true);
      expect(STATIC_ROUTE_META[path], `${path} needs its own meta`).toBeDefined();
    }
  });
});

describe('STATIC_ROUTE_BODY', () => {
  it('has no key shadowed by a public/_redirects rule', () => {
    const offenders = Object.keys(STATIC_ROUTE_BODY).filter(isShadowedByRedirect);
    expect(
      offenders,
      'this crawler copy is unreachable — the path 301s away at the edge. Key it to the redirect TARGET.',
    ).toEqual([]);
  });

  it('only carries bodies for indexable routes', () => {
    // functions/_middleware.ts gates the bot-body injection on `indexable`, so
    // a body for a noindex route is dead weight that reads as intentional.
    const offenders = Object.keys(STATIC_ROUTE_BODY).filter((p) => !isIndexable(p));
    expect(offenders).toEqual([]);
  });

  // A crawler body exists to give the bot somewhere to go next. Sending it to a
  // page that resolves to DEFAULT_META wastes the link and puts another
  // homepage-titled URL in the index. This caught 7 at introduction, including
  // all three /community/* targets of the /people body — the /people SEO fix
  // had moved the same defect one hop down without anyone noticing.
  const bodyLinks = Object.entries(STATIC_ROUTE_BODY).flatMap(([key, body]) =>
    (body.links ?? []).map((l) => ({ from: key, href: l.href.split('?')[0].replace(/\/+$/, '') })),
  );

  it('never links the crawler at a page that serves the homepage title', () => {
    const offenders = bodyLinks
      .filter(({ href }) => href.startsWith('/'))
      // Published machine files do not have HTML page titles. Only exempt
      // a machine-format link when its file really exists in public/.
      .filter(
        ({ href }) =>
          !(/\.(json|txt|xml)$/.test(href) && existsSync(join(process.cwd(), 'public', href))),
      )
      .filter(({ href }) => isIndexable(href))
      .filter(({ href }) => resolveMeta(href).title === DEFAULT_META.title)
      .map(({ from, href }) => `${from} -> ${href}`);
    expect(
      [...new Set(offenders)],
      'give these routes their own STATIC_ROUTE_META entry, noindex them, or link somewhere else',
    ).toEqual([]);
  });

  it('never links the crawler at a redirect source', () => {
    // `/resources` 301s to `/tags`; five body entries pointed at it, so every
    // one spent a crawl hop on a redirect.
    //
    // Client-side stubs count too, and they used to slip through BOTH link
    // checks: this one saw `public/_redirects` only, and the homepage-title
    // check above SKIPS a noindexed href — so once /places was noindexed, a
    // body link aimed at it became invisible to everything. Found by mutation
    // (re-pointing a link back at /places passed the whole suite); four such
    // links existed, three at /places and one at /support.
    const stubs = clientRedirectPaths();
    // Positive control: an empty set would silently disable the new half.
    expect(stubs.size, 'the route-table parser found no redirect stubs').toBeGreaterThan(20);

    const offenders = bodyLinks
      .filter(({ href }) => href.startsWith('/') && (isShadowedByRedirect(href) || stubs.has(href)))
      .map(({ from, href }) => `${from} -> ${href}`);
    expect([...new Set(offenders)], 'link the redirect TARGET instead').toEqual([]);
  });
});

/**
 * The six Intent Router hubs are the site's primary navigation, and their child
 * routes kept shipping without meta: `/people/{friends,dating,travel,nearby}`
 * and `/travel/book` all served DEFAULT_META — a title byte-identical to the
 * homepage's, on five separate URLs. `resolveMeta` is an exact match, so a
 * parent entry never covers a child.
 *
 * Parsing `src/routes.tsx` rather than trusting a hand-kept list, because a
 * hand-kept list is exactly what let these through. Precedent for reading the
 * route table in a test: src/utils/__tests__/reservedDetailSlugs.test.ts.
 */
describe('intent child routes', () => {
  const routesSrc = readFileSync(join(REPO, 'src', 'routes.tsx'), 'utf8');
  // `shop` was dropped when /shop folded into /marketplace. Deliberately NOT
  // replaced with 'marketplace': that would pull in /marketplace/share,
  // /marketplace/missions and /marketplace/guides, three pre-existing meta gaps
  // unrelated to this merge. They are worth fixing — in their own change.
  const INTENTS = ['going-out', 'travel', 'rights', 'support', 'hub'];

  // path="<intent>/<static-segment>" — params and splats are dynamicMeta's job.
  const children = [
    ...new Set(
      [...routesSrc.matchAll(/path="([a-z0-9-]+\/[a-z0-9-]+)"/g)]
        .map((m) => `/${m[1]}`)
        .filter((p) => INTENTS.includes(p.split('/')[1])),
    ),
  ].sort();

  it('finds the known children (guards the regex itself)', () => {
    expect(children).toEqual(
      expect.arrayContaining(['/hub/dating', '/hub/friends', '/travel/book']),
    );
  });

  it.each(children)('%s has its own meta or is noindex', (path) => {
    if (!isIndexable(path)) return; // deliberately suppressed, nothing to assert
    expect(
      resolveMeta(path).title,
      `${path} is indexable but resolves to DEFAULT_META — the homepage title`,
    ).not.toBe(DEFAULT_META.title);
  });
});

describe('isIndexable', () => {
  it('excludes personal and query-shaped surfaces', () => {
    for (const path of [
      '/auth',
      '/admin/users',
      '/profile/settings',
      '/settings',
      '/favorites',
      '/search',
      '/hub/plans',
      '/cruising',
    ]) {
      expect(isIndexable(path), `${path} should be noindex`).toBe(false);
    }
  });

  // resolveMeta is an exact match, so these four had no entry and served
  // DEFAULT_META — the homepage title, on four separate URLs. They are also
  // signed-in matching surfaces with nothing public to render, so they are
  // suppressed rather than given four near-duplicate titles competing with the
  // /people hub.
  it('excludes private and consent-gated Hub connection modes', () => {
    for (const path of ['/hub/friends', '/hub/dating', '/hub/travel', '/hub/nearby']) {
      expect(isIndexable(path), `${path} should be noindex`).toBe(false);
    }
  });

  it('keeps public content routes indexable', () => {
    for (const path of [
      '/',
      '/venues',
      '/city/berlin',
      '/guides',
      '/organizations',
      '/help',
      '/hub/feed',
      '/hub/members',
      '/hub/groups',
      '/hub/people',
    ]) {
      expect(isIndexable(path), `${path} should be indexable`).toBe(true);
    }
  });

  it('suppresses legacy People URLs without matching neighbouring paths', () => {
    expect(isIndexable('/people')).toBe(false);
    expect(isIndexable('/people/x')).toBe(false);
    expect(isIndexable('/peopleish')).toBe(true);
  });
});

describe('resolveMeta', () => {
  it('returns the exact entry for a backfilled route rather than the default', () => {
    for (const path of [
      '/guides',
      '/cities',
      '/organizations',
      '/pride',
      '/hub/feed',
      '/hub/members',
      '/hub/groups',
      '/hub/people',
    ]) {
      const meta = resolveMeta(path);
      expect(meta.title, `${path} still resolves to the generic default`).not.toBe(
        DEFAULT_META.title,
      );
    }
  });
});

it('gives newly managed competition category routes distinct metadata', () => {
  const meta = resolveMeta('/competitions/types/community-awards');
  expect(meta.title).toContain('Community Awards Competitions');
  expect(meta.description).toContain('community awards');
});
