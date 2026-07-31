/**
 * Every TYPE_META.adminHref must resolve to a real /admin route.
 *
 * Before 2026-07 two entries pointed at nothing: `image` → /admin/content/media
 * (not a registered content type, so it fell through to content/:type with an
 * unknown type) and `tag` → /admin/tags (a redirect stub). Four more pointed at
 * the bare /admin/content list rather than their own type, so clicking a node
 * in the graph explorer dumped you on an unfiltered list.
 *
 * Parses the route table out of src/routes.tsx rather than rendering it: this
 * catches a stale href the moment the route is renamed, without needing every
 * admin page's dependency tree mocked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TYPE_META } from '../contentGraphMeta';
import { getContentType } from '@/config/contentTypeRegistry';

const routesSrc = readFileSync(resolve(process.cwd(), 'src/routes.tsx'), 'utf8');

/**
 * Every child route declared under `<Route path="/admin">`, flagged by whether
 * it renders a real page or just bounces through <Navigate>. Splitting on
 * `<Route` keeps multi-line declarations intact.
 */
function adminRoutes(): { path: string; redirect: boolean }[] {
  const start = routesSrc.indexOf('path="/admin"');
  expect(start, 'could not locate the /admin route block in src/routes.tsx').toBeGreaterThan(-1);
  // The admin block ends at the locale router that follows it.
  const end = routesSrc.indexOf('path="/:locale?"', start);
  const block = routesSrc.slice(start, end === -1 ? undefined : end);
  return block
    .split('<Route')
    .map((chunk) => {
      const m = /^\s+path="([^"]+)"/.exec(chunk);
      return m ? { path: m[1], redirect: chunk.includes('<Navigate') } : null;
    })
    .filter((r): r is { path: string; redirect: boolean } => r !== null && r.path !== '/admin');
}

const ADMIN_ROUTES = adminRoutes();
const ADMIN_PATHS = ADMIN_ROUTES.map((r) => r.path);

function matches(pattern: string, rest: string): boolean {
  if (pattern === '*') return false; // the catch-all is not a real destination
  const patternParts = pattern.split('/');
  const hrefParts = rest.split('/');
  if (patternParts.length !== hrefParts.length) return false;
  return patternParts.every((p, i) => p.startsWith(':') || p === hrefParts[i]);
}

/** Does `href` match one of the declared admin child routes? */
function resolvesToAdminRoute(href: string): boolean {
  const rest = href.replace(/^\/admin\/?/, '');
  if (rest === '') return true; // /admin index
  return ADMIN_PATHS.some((pattern) => matches(pattern, rest));
}

/**
 * A redirect stub is a *legacy* destination, not a surface. Static routes win
 * over `content/:type`, so an href is only a stub if its most specific match
 * is one.
 */
function landsOnRedirectStub(href: string): boolean {
  const rest = href.replace(/^\/admin\/?/, '');
  if (rest === '') return false;
  const hits = ADMIN_ROUTES.filter((r) => matches(r.path, rest));
  if (hits.length === 0) return false;
  // Fewest params = most specific = what React Router picks.
  const best = hits.reduce((a, b) =>
    (a.path.match(/:/g)?.length ?? 0) <= (b.path.match(/:/g)?.length ?? 0) ? a : b,
  );
  return best.redirect;
}

describe('contentGraphMeta admin links', () => {
  it('parses a plausible admin route table', () => {
    expect(ADMIN_PATHS.length).toBeGreaterThan(40);
    expect(ADMIN_PATHS).toContain('content/:type');
    expect(ADMIN_PATHS).toContain('*');
  });

  it.each(Object.entries(TYPE_META))(
    '%s → adminHref resolves to a declared /admin route',
    (type, meta) => {
      expect(
        resolvesToAdminRoute(meta.adminHref),
        `TYPE_META.${type}.adminHref "${meta.adminHref}" matches no route in src/routes.tsx`,
      ).toBe(true);
    },
  );

  it.each(Object.entries(TYPE_META))(
    '%s → adminHref is a real surface, not a legacy redirect stub',
    (type, meta) => {
      expect(
        landsOnRedirectStub(meta.adminHref),
        `TYPE_META.${type}.adminHref "${meta.adminHref}" only resolves to a <Navigate> stub — link the real route`,
      ).toBe(false);
    },
  );

  it('never points at the bare /admin/content list — nodes must deep-link', () => {
    const lazy = Object.entries(TYPE_META).filter(([, m]) => m.adminHref === '/admin/content');
    expect(
      lazy.map(([t]) => t),
      'these types dump the user on an unfiltered list instead of their own surface',
    ).toEqual([]);
  });

  it('only uses content/:type hrefs for types the registry actually knows', () => {
    for (const [type, meta] of Object.entries(TYPE_META)) {
      const m = /^\/admin\/content\/([a-z_]+)$/.exec(meta.adminHref);
      if (!m) continue;
      expect(
        getContentType(m[1]),
        `TYPE_META.${type} links to /admin/content/${m[1]}, which is not a registered content type`,
      ).toBeTruthy();
    }
  });
});
