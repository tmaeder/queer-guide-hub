import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `/hub/*` route must render the same wayfinding bar, in the same place.
 *
 * This is a source scan rather than a render test on purpose: the 17 hub routes
 * are spread over nine page components with their own auth gates, loading
 * branches and lazy boundaries, and mounting each one needs a different set of
 * mocked hooks. What goes wrong here is never "the bar rendered badly" — it is
 * "a new /hub route shipped without the bar at all", or "one page passes
 * different props so the identity block and the unread badge appear on five
 * routes and vanish on twelve", which is the state this file was written after.
 */

const ROOT = process.cwd();
const ROUTES = join(ROOT, 'src', 'routes.tsx');

const routesSrc = readFileSync(ROUTES, 'utf8');

/** `const Foo = lazyRetry(() => import('./pages/Foo'))` and plain imports. */
function componentSources(): Map<string, string> {
  const map = new Map<string, string>();
  const add = (name: string, spec: string) => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return;
    const rel = spec.startsWith('@/') ? join('src', spec.slice(2)) : join('src', spec.slice(2));
    for (const ext of ['.tsx', '.ts']) {
      const file = join(ROOT, rel + ext);
      if (existsSync(file)) {
        map.set(name, readFileSync(file, 'utf8'));
        return;
      }
    }
  };
  for (const m of routesSrc.matchAll(
    /const\s+(\w+)\s*=\s*lazyRetry\(\(\)\s*=>\s*import\('([^']+)'\)\)/g,
  )) {
    add(m[1], m[2]);
  }
  for (const m of routesSrc.matchAll(/^import\s+(\w+)\s+from\s+'([^']+)';$/gm)) {
    add(m[1], m[2]);
  }
  return map;
}

/** Hub routes that render a page, i.e. excluding the `LocalizedRedirect` rows. */
function hubRoutes(): Array<{ path: string; component: string }> {
  const out: Array<{ path: string; component: string }> = [];
  for (const m of routesSrc.matchAll(/<Route\s+path="(hub(?:\/[^"]*)?)"\s+element=\{<(\w+)/g)) {
    if (m[2] === 'LocalizedRedirect' || m[2] === 'Navigate') continue;
    out.push({ path: `/${m[1]}`, component: m[2] });
  }
  return out;
}

const sources = componentSources();
const routes = hubRoutes();

describe('hub navigation is the same control on every /hub page', () => {
  // Positive control. Every assertion below is a `for` over `routes`, so a regex
  // that stops matching turns this file green while checking nothing — the
  // vacuous-sweep failure this repo keeps re-learning.
  it('finds the hub routes at all', () => {
    expect(routes.length).toBeGreaterThanOrEqual(12);
    expect(routes.map((r) => r.path)).toContain('/hub');
    expect(routes.map((r) => r.path)).toContain('/hub/dating');
    expect(routes.map((r) => r.path)).toContain('/hub/groups/:groupId');
  });

  it('resolves each route component to a source file', () => {
    for (const r of routes) {
      expect(sources.has(r.component), `${r.path} -> ${r.component} source not found`).toBe(true);
    }
  });

  it('renders HubNavBar on every hub route', () => {
    for (const r of routes) {
      const src = sources.get(r.component) ?? '';
      // HubShell is the one sanctioned indirection; it is asserted below.
      const ok = src.includes('<HubNavBar />') || src.includes('<HubShell');
      expect(ok, `${r.path} (${r.component}) renders no HubNavBar`).toBe(true);
    }
  });

  // File-level presence is not enough on its own: these pages return early for
  // signed-out, loading and not-found states, and the first version of this
  // suite stayed green when the bar was deleted from Cruising's MAIN return
  // because a loading branch still mentioned it. So check per returned screen.
  it('renders it in every returned screen, not just one branch', () => {
    const seen = new Set<string>();
    for (const r of routes) {
      if (seen.has(r.component)) continue;
      seen.add(r.component);
      const src = sources.get(r.component) ?? '';
      if (src.includes('<HubShell')) continue;
      const blocks = [...src.matchAll(/\n( +)return \(\n([\s\S]*?)\n\1\);/g)];
      expect(blocks.length, `${r.component}: found no return blocks to check`).toBeGreaterThan(0);
      for (const b of blocks) {
        const jsx = b[2];
        // A screen is a block that lays itself out. Bare redirects
        // (`<Navigate />`) and helper sub-components render no page chrome.
        if (!jsx.includes('<PageContainer') && !jsx.includes('<IntentPageLayout')) continue;
        expect(
          jsx.includes('<HubNavBar />'),
          `${r.component}: a returned screen renders no HubNavBar`,
        ).toBe(true);
      }
    }
  });

  it('HubShell renders the shared bar rather than its own', () => {
    const shell = readFileSync(join(ROOT, 'src/components/hub/HubShell.tsx'), 'utf8');
    expect(shell).toContain('<HubNavBar />');
  });

  it('HubNavBar is the only placement, and it is a sibling with pb-0', () => {
    const bar = readFileSync(join(ROOT, 'src/components/hub/HubNavBar.tsx'), 'utf8');
    // pb-0 is what lets the bar sit above a page's own PageContainer without the
    // two stacking their vertical padding.
    expect(bar).toMatch(/<PageContainer className="pb-0 pt-6 md:pt-8">/);
    expect(bar).toContain('<HubNav />');
  });

  it('no page configures HubNav, so the bar cannot differ between routes', () => {
    for (const [name, src] of sources) {
      if (!src.includes('HubNav')) continue;
      for (const prop of ['showIdentity', 'showUnread', 'unreadCount=', 'activeModule=']) {
        expect(src.includes(prop), `${name} passes ${prop} to HubNav`).toBe(false);
      }
    }
  });

  it('HubNav owns the identity block and the unread badge itself', () => {
    const nav = readFileSync(join(ROOT, 'src/components/hub/HubNav.tsx'), 'utf8');
    expect(nav).toContain('<HubIdentityBlock />');
    expect(nav).toContain('useInboxUnreadCount()');
    // Its only prop is presentational.
    expect(nav).toMatch(/export function HubNav\(\{ className \}: \{ className\?: string \}\)/);
  });
});
