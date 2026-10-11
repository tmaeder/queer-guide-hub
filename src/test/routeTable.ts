/**
 * The SPA route table, read out of `src/routes.tsx` with JSX nesting resolved.
 *
 * Shared by the tests that compare an edge-side table against the real routes
 * (`reservedDetailSlugs.test.ts`, `routeMetaContract.test.ts`). It lives here
 * rather than in either of them because a second copy of this parser is the
 * drift surface: both callers need the same answer to "what URL does this
 * <Route> actually serve, and does it redirect away?".
 *
 * Reading the `path="…"` attribute alone is NOT enough, and that shortcut has
 * already cost a defect: `path="personalities/milestones"` is nested under
 * `/admin`, so its real URL is `/admin/personalities/milestones` and it never
 * reaches the edge detail matcher — yet `milestones` sat in
 * RESERVED_DETAIL_SLUGS on the strength of that attribute, reserving the slug
 * across every namespace and making `/personalities/milestones` answer 200.
 *
 * This is a regex over source, not a real JSX parse. It is good enough because
 * the thing it reads is a flat, hand-written table of literal `path="…"`
 * strings — but every consumer must carry a positive control asserting it
 * found the routes it expects, or an empty result reads as "nothing to check".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ResolvedRoute = {
  /** Full URL path with parent segments prepended, e.g. `/admin/postfach`. */
  path: string;
  /** True when the element is a client-side redirect rather than a page. */
  isRedirectStub: boolean;
};

/** Elements that render a redirect instead of a page. */
const REDIRECT_ELEMENTS = /<(Navigate|LocalizedRedirect|SlugAliasRedirect)\b/;

export function resolvedRoutes(
  routesPath = resolve(__dirname, '..', 'routes.tsx'),
): ResolvedRoute[] {
  const lines = readFileSync(routesPath, 'utf8').split('\n');
  const stack: string[] = [];
  const out: ResolvedRoute[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const _ of lines[i].match(/<\/Route>/g) ?? []) stack.pop();
    if (!/<Route\b/.test(lines[i])) continue;

    // A <Route> opening tag can wrap over several lines; read until it closes.
    let tag = '';
    for (let j = i; j < lines.length && j < i + 12; j++) {
      tag += lines[j];
      if (/\/>|>\s*$/.test(lines[j])) break;
    }

    const segment = tag.match(/path="([^"]*)"/)?.[1] ?? '';
    out.push({
      path: `/${[...stack, segment]
        .filter(Boolean)
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/^\//, '')}`,
      isRedirectStub: REDIRECT_ELEMENTS.test(tag),
    });

    // A self-closing <Route /> has no children, so it must not become a parent.
    if (!/\/>/.test(tag.slice(tag.indexOf('<Route')))) stack.push(segment);
  }
  return out;
}

/**
 * Paths whose element is a client-side redirect. The edge still answers these
 * 200 (React has not run yet), so a crawler sees a page — which is why they
 * must never carry STATIC_ROUTE_META (that would put a redirect source in
 * sitemap-static.xml) and should be noindexed instead.
 *
 * Distinct from `public/_redirects` sources, which never reach React at all.
 */
export function clientRedirectPaths(routesPath?: string): Set<string> {
  return new Set(
    resolvedRoutes(routesPath)
      .filter((r) => r.isRedirectStub)
      .map((r) => r.path),
  );
}
