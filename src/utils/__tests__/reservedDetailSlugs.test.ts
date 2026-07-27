// Tests for `functions/_lib/detail.ts`. Lives under src/ so it is picked up by
// the project's vitest include glob — see vite.config.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDetailPath } from '../../../functions/_lib/detail';

/**
 * The edge middleware hard-404s any URL that *looks* like an entity detail
 * route (`/<kind>/<slug>`) whose row does not exist — that is what makes a
 * deleted article return a real 404 instead of a soft 200. The cost is that a
 * genuine static SPA sub-route sharing that shape (`/news/all`) gets 404'd
 * before React ever runs, unless it is listed in `RESERVED_DETAIL_SLUGS`.
 *
 * That list was hand-maintained and silently rotted: `/news/all` (the "Open
 * archive" CTA), `/news/me` and `/personalities/milestones` were all dead in
 * production. Nothing failed in CI, because nothing compared the list against
 * the actual route table.
 *
 * So compare it here. Every static two-segment route in `src/routes.tsx` must
 * NOT be classified as a detail path.
 */
const routesSrc = readFileSync(resolve(__dirname, '../../routes.tsx'), 'utf8');

// path="foo/bar" — two static segments, no ":param", no "*" splat.
const STATIC_SUBROUTES = [
  ...routesSrc.matchAll(/path="([a-z0-9-]+\/[a-z0-9-]+)"/g),
].map((m) => `/${m[1]}`);

describe('reserved detail slugs vs. the real route table', () => {
  it('finds static sub-routes to check (guards against a broken regex)', () => {
    expect(STATIC_SUBROUTES.length).toBeGreaterThan(5);
    expect(STATIC_SUBROUTES).toContain('/news/all');
  });

  it.each(STATIC_SUBROUTES)('%s is not treated as an entity detail path', (route) => {
    expect(
      isDetailPath(route),
      `${route} is a real SPA route but the edge middleware classifies it as ` +
        `an entity detail path, so a missing row 404s the page. Add its second ` +
        `segment to RESERVED_DETAIL_SLUGS in functions/_lib/detail.ts.`,
    ).toBe(false);
  });

  it('still treats a genuine entity slug as a detail path', () => {
    // Otherwise the fix above could "pass" by disabling detail routing entirely.
    expect(isDetailPath('/news/some-real-article-slug')).toBe(true);
    expect(isDetailPath('/venues/berghain')).toBe(true);
  });
});
