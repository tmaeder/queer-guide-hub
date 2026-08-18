import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ADMIN_ARCHETYPES,
  ARCHETYPES,
  getArchetypeForRoute,
  getArchetypeRouteLine,
  type ArchetypeKey,
} from '../adminArchetypes';

/**
 * The test that proves the thesis.
 *
 * `Admin Archetypes.dc.html` claims every admin route resolves to one of eight
 * frames. A claim like that decays the moment someone adds route forty-one, so
 * this reads the ROUTER — not a hand-maintained list — and fails the build
 * until the new route is assigned a frame or given a written exemption.
 *
 * It parses `src/routes.tsx` textually rather than importing it. That follows
 * the precedent already in this repo (`edgeNotFoundTokens.test.ts` parses
 * `functions/_middleware.ts`, `tokenCatalog.test.ts` parses `src/index.css`),
 * and it is the deliberate alternative to extracting the 40-route block into a
 * data file: the extraction was considered and rejected, because re-declaring
 * live routing to satisfy a test risks the routing itself — React Router ranks
 * by specificity, and `content/personalities` beating `content/:type` is
 * load-bearing — for an auditability benefit a parser already delivers.
 */

const ROUTES_SRC = readFileSync(resolve(__dirname, '../../routes.tsx'), 'utf8');

/** Element-bearing `/admin/*` routes, straight out of the router. */
function routerAdminPaths(): string[] {
  const start = ROUTES_SRC.indexOf('path="/admin"');
  expect(start, 'the /admin route block moved — this parser needs updating').toBeGreaterThan(-1);
  const block = ROUTES_SRC.slice(start);
  const end = block.indexOf('path="settings/professions"');
  expect(end, 'the /admin block no longer ends at settings/professions').toBeGreaterThan(-1);
  const scope = block.slice(0, block.indexOf('</Route>', end));

  const paths: string[] = [];
  if (/<Route index element=\{</.test(scope)) paths.push('(index)');
  for (const m of scope.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z]+)/g)) {
    // `<Navigate>` is a redirect, not a page, and has nothing to render in a frame.
    if (m[2] !== 'Navigate') paths.push(m[1]);
  }
  return paths;
}

describe('admin archetype registry', () => {
  it('finds the admin routes in the router (non-vacuity)', () => {
    // If the parser silently matched nothing, every assertion below would pass
    // by describing an empty set — the exact failure this suite exists to stop.
    expect(routerAdminPaths().length).toBeGreaterThanOrEqual(35);
  });

  it('assigns every admin route a frame or an explicit exemption', () => {
    const registered = new Map(ADMIN_ARCHETYPES.map((e) => [e.path, e]));
    const unassigned: string[] = [];
    for (const path of routerAdminPaths()) {
      const entry = registered.get(path);
      if (!entry) {
        unassigned.push(path);
        continue;
      }
      if (entry.archetype === null) {
        expect(
          entry.exempt?.trim(),
          `/admin/${path} is exempt but gives no reason — say why it is not one of the eight`,
        ).toBeTruthy();
      }
    }
    expect(
      unassigned,
      'these admin routes are in the router but not in src/config/adminArchetypes.ts — ' +
        'pick a frame (A–H) or add an `exempt` with a reason',
    ).toEqual([]);
  });

  it('never registers a route the router does not have', () => {
    // The reverse direction: a deleted route leaves a stale entry that quietly
    // inflates the coverage claim.
    const live = new Set(routerAdminPaths());
    const stale = ADMIN_ARCHETYPES.map((e) => e.path).filter((p) => !live.has(p));
    expect(stale, 'registry entries with no matching route in src/routes.tsx').toEqual([]);
  });

  it('registers each route exactly once', () => {
    const seen = new Set<string>();
    const dupes = ADMIN_ARCHETYPES.filter((e) =>
      seen.has(e.path) ? true : (seen.add(e.path), false),
    );
    expect(dupes.map((d) => d.path)).toEqual([]);
  });

  it('only names the eight archetypes', () => {
    const keys = Object.keys(ARCHETYPES) as ArchetypeKey[];
    expect(keys).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    for (const e of ADMIN_ARCHETYPES) {
      if (e.archetype) expect(keys).toContain(e.archetype);
      for (const sub of e.subFrames ?? []) expect(keys).toContain(sub);
    }
  });

  it('records the honest coverage rather than rounding it up', () => {
    // The design document says "every route resolves to one of eight". The
    // measured answer is 24 clean / 11 caveated / 5 exempt, and this pins that
    // shape so a future change has to move the number deliberately. A registry
    // that lets "nearly" drift into "yes" is worth less than no registry.
    const clean = ADMIN_ARCHETYPES.filter((e) => e.archetype && !e.caveat).length;
    const caveated = ADMIN_ARCHETYPES.filter((e) => e.archetype && e.caveat).length;
    const exempt = ADMIN_ARCHETYPES.filter((e) => e.archetype === null).length;
    expect({ clean, caveated, exempt }).toEqual({ clean: 24, caveated: 11, exempt: 5 });
    expect(clean + caveated + exempt).toBe(ADMIN_ARCHETYPES.length);
  });

  it('resolves a live pathname to its frame', () => {
    expect(getArchetypeForRoute('/admin/automation')).toBe('H');
    expect(getArchetypeForRoute('/admin/inbox')).toBe('F');
    expect(getArchetypeForRoute('/admin')).toBeNull(); // the shell itself
    expect(getArchetypeForRoute('/admin/design')).toBeNull(); // exempt
  });

  it('matches dynamic segments positionally', () => {
    expect(getArchetypeForRoute('/admin/business/abc-123')).toBe('B');
    expect(getArchetypeForRoute('/admin/content/venues')).toBe('A');
    // A static route must still beat the `:type` pattern it shadows.
    expect(getArchetypeForRoute('/admin/content/personalities')).toBe('A');
  });

  it('builds the header route line', () => {
    expect(getArchetypeRouteLine('/admin/content/venues')).toBe(
      'A · INDEX — /admin/content/venues',
    );
    expect(getArchetypeRouteLine('/admin/design')).toBeNull();
  });
});
