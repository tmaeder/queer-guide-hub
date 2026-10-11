// Tests for `functions/_lib/detail.ts`. Lives under src/ so it is picked up by
// the project's vitest include glob — see vite.config.ts.
import { describe, it, expect } from 'vitest';
import { isDetailPath } from '../../../functions/_lib/detail';
import { isIndexable, STATIC_ROUTE_META } from '../../../functions/_lib/routeMeta';
import { resolvedRoutes } from '../../test/routeTable';

/**
 * The edge middleware hard-404s any URL that *looks* like an entity detail
 * route (`/<kind>/<slug>`) whose row does not exist — that is what makes a
 * deleted article return a real 404 instead of a soft 200. The cost is that a
 * genuine static SPA sub-route sharing that shape (`/news/all`) gets 404'd
 * before React ever runs, unless it is listed in `RESERVED_DETAIL_SLUGS`.
 *
 * That list was hand-maintained and rotted in BOTH directions.
 *
 * Under-reservation was the first failure: `/news/all` (the "Open archive"
 * CTA), `/news/me` and `/venues/guides` were all dead in production. Nothing
 * failed in CI, because nothing compared the list against the route table.
 *
 * Over-reservation was the second, and it needed the namespace split to fix:
 * the list was a FLAT set, so reserving `all` for the one real `/news/all`
 * page also made `/tags/all`, `/city/all`, `/venues/all` and
 * `/personalities/all` answer 200 at URLs with no row. Measured on prod
 * 2026-10-10 with a Googlebot UA: `/tags/all` 200 for a DEPRECATED tag, while
 * `/tags/us` (an equally deprecated tag that happened not to be reserved)
 * correctly 404'd.
 *
 * So check both directions against the real route table. A static route must
 * not be a detail path; the same slug under a namespace that does not own that
 * route must be.
 */

// The route table, with JSX nesting resolved — see src/test/routeTable.ts for
// why the bare `path="…"` attribute is not enough.
const ROUTES = resolvedRoutes();

// Every detail kind the edge matcher accepts. Hardcoded rather than derived
// from DETAIL_ROUTE_RE so this file states the intent independently — the
// positive control below fails loudly if a kind is renamed or dropped.
const DETAIL_KINDS = [
  'venue',
  'venues',
  'event',
  'events',
  'news',
  'podcasts',
  'personalities',
  'personality',
  'city',
  'country',
  'hotel',
  'hotels',
  'village',
  'villages',
  'tag',
  'tags',
  'history',
  'guides',
  'marketplace/brands',
];

// `tag/:slug` and `personality/:slug` are SlugAliasRedirect routes onto the
// plural namespace, so they inherit its reservations.
const KIND_ALIASES: Record<string, string> = { tag: 'tags', personality: 'personalities' };
const normalise = (kind: string) => KIND_ALIASES[kind] ?? kind;

// `/<detail kind>/<static segment>` — the shape that collides.
const STATIC_DETAIL_ROUTE_RE = new RegExp(
  `^/(${DETAIL_KINDS.map((k) => k.replace('/', '\\/')).join('|')})/([a-z0-9-]+)/?$`,
);

const RESERVED_ROUTES = ROUTES.filter((r) => STATIC_DETAIL_ROUTE_RE.test(r.path));
const STATIC_SUBROUTES = [...new Set(RESERVED_ROUTES.map((r) => r.path))].sort();

// Of those, the ones whose element is a client-side redirect rather than a page.
const STUBS = [
  ...new Set(RESERVED_ROUTES.filter((r) => r.isRedirectStub).map((r) => r.path)),
].sort();
const REAL_PAGES = STATIC_SUBROUTES.filter((p) => !STUBS.includes(p));

// The (namespace, slug) pairs the SPA actually serves, keyed by normalised kind.
const OWNED = new Map<string, Set<string>>();
for (const route of STATIC_SUBROUTES) {
  const [, kind, slug] = route.match(STATIC_DETAIL_ROUTE_RE)!;
  const key = normalise(kind);
  if (!OWNED.has(key)) OWNED.set(key, new Set());
  OWNED.get(key)!.add(slug);
}
const ALL_SLUGS = [...new Set([...OWNED.values()].flatMap((s) => [...s]))].sort();

describe('reserved detail slugs vs. the real route table', () => {
  it('finds static sub-routes to check (guards against a broken resolver)', () => {
    // Without these the whole file is vacuous: an empty route set satisfies
    // "every static route falls through" and every mirror case below too.
    expect(STATIC_SUBROUTES.length).toBeGreaterThan(5);
    expect(STATIC_SUBROUTES).toContain('/news/all');
    expect(STATIC_SUBROUTES).toContain('/venues/guides');
    expect(STATIC_SUBROUTES).toContain('/tags/interactions');
    // Resolved nesting, not the bare path attribute: this one lives at
    // /admin/personalities/milestones and must NOT be read as a detail route.
    expect(STATIC_SUBROUTES).not.toContain('/personalities/milestones');
  });

  it('every listed kind really is a detail kind', () => {
    // Otherwise a renamed or dropped kind silently removes a whole namespace
    // from the mirror check below, which would then pass having tested nothing.
    for (const kind of DETAIL_KINDS) {
      expect(isDetailPath(`/${kind}/zzz-probe-not-a-reserved-slug`), kind).toBe(true);
    }
  });

  it.each(STATIC_SUBROUTES)('%s is not treated as an entity detail path', (route) => {
    expect(
      isDetailPath(route),
      `${route} is a real SPA route but the edge middleware classifies it as ` +
        `an entity detail path, so a missing row 404s the page. Add its second ` +
        `segment under its FIRST segment in RESERVED_DETAIL_SLUGS ` +
        `(functions/_lib/detail.ts).`,
    ).toBe(false);
  });

  // The direction the flat set got wrong. Reserving a slug for the one
  // namespace that owns it must not reserve it anywhere else.
  const mirrorCases = DETAIL_KINDS.flatMap((kind) =>
    ALL_SLUGS.filter((slug) => !OWNED.get(normalise(kind))?.has(slug)).map(
      (slug) => [`/${kind}/${slug}`, kind, slug] as const,
    ),
  );

  it('has mirror cases to check', () => {
    expect(mirrorCases.length).toBeGreaterThan(20);
  });

  it.each(mirrorCases)('%s is a detail path — %s does not own "%s"', (path) => {
    expect(
      isDetailPath(path),
      `${path} is not a route in src/routes.tsx, so a missing row must 404. ` +
        `It is reserved under the wrong namespace in RESERVED_DETAIL_SLUGS ` +
        `(functions/_lib/detail.ts), which makes it answer 200 with no content.`,
    ).toBe(true);
  });

  it('404s the exact paths measured as soft-200s on prod', () => {
    // Named rather than left to the generated mirror: these four are the
    // reported defect, and a change to the resolver must not quietly drop them.
    expect(isDetailPath('/tags/all')).toBe(true);
    expect(isDetailPath('/city/all')).toBe(true);
    expect(isDetailPath('/venue/all')).toBe(true);
    expect(isDetailPath('/personalities/all')).toBe(true);
    // The control from the same measurement: already 404'd, must still.
    expect(isDetailPath('/tags/us')).toBe(true);
    // And the one page the reservation exists for.
    expect(isDetailPath('/news/all')).toBe(false);
  });

  it('lets an aliased singular namespace inherit its plural reservations', () => {
    // /tag/:slug is a SlugAliasRedirect onto /tags/:slug, so hard-404ing it at
    // the edge kills the redirect before React can run it.
    expect(isDetailPath('/tag/interactions')).toBe(false);
    expect(isDetailPath('/tag/sti-guide')).toBe(false);
    // Inheriting the namespace must not inherit OTHER namespaces' slugs.
    expect(isDetailPath('/tag/all')).toBe(true);
    expect(isDetailPath('/tag/compare')).toBe(true);
  });

  it('still treats a genuine entity slug as a detail path', () => {
    // Otherwise the fix above could "pass" by disabling detail routing entirely.
    expect(isDetailPath('/news/some-real-article-slug')).toBe(true);
    expect(isDetailPath('/venues/berghain')).toBe(true);
  });

  it('matches a maker page but never the maker INDEX', () => {
    // `marketplace/brands` is the one two-segment kind in DETAIL_ROUTE_RE. The
    // index is the asymmetric half and the one that can fail silently: if the
    // slug group ever went optional, `/marketplace/brands` would be treated as
    // a detail route, miss, and come back `indexable: false` — deleting the
    // whole makers directory from search while every per-maker check still
    // passed. `/marketplace` and `/marketplace/categories` are here for the
    // same reason: the new alternative must not widen to its own first segment.
    expect(isDetailPath('/marketplace/brands/cherrykitten')).toBe(true);
    expect(isDetailPath('/marketplace/brands')).toBe(false);
    expect(isDetailPath('/marketplace/brands/')).toBe(false);
    expect(isDetailPath('/marketplace')).toBe(false);
    expect(isDetailPath('/marketplace/categories')).toBe(false);
    // A deeper path is a listing route, not a maker.
    expect(isDetailPath('/marketplace/brands/a/b')).toBe(false);
  });
});

/**
 * Reserving a slug is what makes the edge serve that URL as a 200 PAGE, so it
 * hands the second surface — SEO metadata — a URL it was never designed for.
 * `routeMeta.ts`'s generic `/(kind)/(slug)` matcher then titles it from the
 * listing template: measured on prod 2026-10-10 with a Googlebot UA,
 * `/hotels/guides` served "Guides — Hotel | Queer Guide" and `/news/all`
 * served "All — New | Queer Guide" (note the stripped plural, which is the
 * tell that no exact entry exists).
 *
 * The two halves of the reserved set need OPPOSITE treatment, and conflating
 * them is the trap:
 *
 *  - A client-side `<Navigate>` stub is a redirect source. It must be
 *    NOINDEXED and must NOT get a STATIC_ROUTE_META entry — sitemap-static.xml
 *    is `Object.keys(STATIC_ROUTE_META).filter(isIndexable)`, so meta for a
 *    redirect advertises it in the sitemap. `/shop` is the precedent.
 *  - A real page must be indexable AND carry its own entry, or it falls through
 *    to the listing template (`/news/all`) or to DEFAULT_META.
 *
 * Scoped to the reserved set deliberately. Measured, 42 other static
 * client-side stubs are still indexable (`/africa`, `/home`, `/discover`,
 * `/cities/compare`, …) — legacy aliases whose fix is an edge 301 in
 * public/_redirects, not noindex. Widening this to every stub would ship red.
 */
describe('reserved routes vs. the SEO surface', () => {
  it('splits the reserved set into stubs and real pages (non-vacuity)', () => {
    // Either list going empty would make its it.each below test nothing.
    expect(STUBS.length).toBeGreaterThan(5);
    expect(REAL_PAGES.length).toBeGreaterThan(2);
    expect(STUBS).toContain('/venues/hotels');
    expect(STUBS).toContain('/news/me');
    // NewsArchive renders content; it is not a redirect and keeps its meta.
    expect(REAL_PAGES).toContain('/news/all');
    expect(REAL_PAGES).toContain('/city/compare');
  });

  it.each(STUBS)('%s is noindexed — it redirects away', (path) => {
    expect(
      isIndexable(path),
      `${path} is a client-side redirect that the edge answers 200, so a ` +
        `crawler indexes a page that bounces. Add it to CLIENT_REDIRECT_STUBS ` +
        `in functions/_lib/routeMeta.ts.`,
    ).toBe(false);
  });

  it.each(STUBS)('%s carries no STATIC_ROUTE_META entry', (path) => {
    expect(
      Object.keys(STATIC_ROUTE_META),
      `${path} redirects away, so meta for it would put a redirect source in ` +
        `sitemap-static.xml. Key the meta to the redirect TARGET instead.`,
    ).not.toContain(path);
  });

  it.each(REAL_PAGES)('%s is indexable and has its own meta entry', (path) => {
    expect(isIndexable(path), `${path} renders content and must stay indexable`).toBe(true);
    expect(
      Object.keys(STATIC_ROUTE_META),
      `${path} has no exact entry, so resolveMeta falls through to the generic ` +
        `/(kind)/(slug) listing template — that is what served ` +
        `"All — New | Queer Guide" on the news archive.`,
    ).toContain(path);
  });

  it('does not noindex the entity directories the stubs sit under', () => {
    // CLIENT_REDIRECT_STUBS must be EXACT paths. A `^/venues/` prefix would
    // suppress ten stubs by deindexing ~26k venue detail pages.
    expect(isIndexable('/venues')).toBe(true);
    expect(isIndexable('/venues/berghain')).toBe(true);
    expect(isIndexable('/events')).toBe(true);
    expect(isIndexable('/events/some-real-event')).toBe(true);
    expect(isIndexable('/news')).toBe(true);
    expect(isIndexable('/news/some-real-article')).toBe(true);
    // Trailing slash is normalised, so the suppression cannot be side-stepped.
    expect(isIndexable('/venues/hotels/')).toBe(false);
  });
});
