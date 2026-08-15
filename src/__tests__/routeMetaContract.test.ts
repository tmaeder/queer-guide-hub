import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_META,
  STATIC_ROUTE_META,
  isIndexable,
  resolveMeta,
} from '../../functions/_lib/routeMeta';
import { STATIC_ROUTE_BODY } from '../../functions/_lib/routeBody';
import { INTENT_NAV } from '@/config/navigation';

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
  '/community',
  // Intent Router landing pages. (Shop's is /marketplace, already above.)
  '/going-out',
  '/rights',
  '/support',
  '/people',
];

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
    for (const path of ['/going-out', '/rights', '/support', '/marketplace', '/people']) {
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
    const offenders = bodyLinks
      .filter(({ href }) => href.startsWith('/') && isShadowedByRedirect(href))
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
  const INTENTS = ['going-out', 'travel', 'rights', 'support', 'people'];

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
      expect.arrayContaining(['/people/dating', '/people/friends', '/travel/book']),
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
    ]) {
      expect(isIndexable(path), `${path} should be noindex`).toBe(false);
    }
  });

  // resolveMeta is an exact match, so these four had no entry and served
  // DEFAULT_META — the homepage title, on four separate URLs. They are also
  // signed-in matching surfaces with nothing public to render, so they are
  // suppressed rather than given four near-duplicate titles competing with the
  // /people hub.
  it('excludes the /people matching modes', () => {
    for (const path of ['/people/friends', '/people/dating', '/people/travel', '/people/nearby']) {
      expect(isIndexable(path), `${path} should be noindex`).toBe(false);
    }
  });

  it('keeps public content routes indexable', () => {
    for (const path of ['/', '/venues', '/city/berlin', '/guides', '/organizations', '/help']) {
      expect(isIndexable(path), `${path} should be indexable`).toBe(true);
    }
  });

  // The noindex rule is a prefix regex; it must not swallow the hub itself or
  // any neighbouring path that merely starts with the same characters.
  it('does not over-match beyond the four modes', () => {
    for (const path of ['/people', '/peopleish', '/people/x']) {
      expect(isIndexable(path), `${path} should stay indexable`).toBe(true);
    }
  });
});

describe('resolveMeta', () => {
  it('returns the exact entry for a backfilled route rather than the default', () => {
    for (const path of ['/guides', '/cities', '/organizations', '/pride', '/community']) {
      const meta = resolveMeta(path);
      expect(meta.title, `${path} still resolves to the generic default`).not.toBe(
        DEFAULT_META.title,
      );
    }
  });
});
