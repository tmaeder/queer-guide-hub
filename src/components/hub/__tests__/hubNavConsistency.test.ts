import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every Hub page must render the same standalone wayfinding bar.
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

const REDIRECTS = ['LocalizedRedirect', 'LocalizedParamRedirect', 'Navigate', 'SettingsRedirect'];

/** /hub and /meet routes that render a page, i.e. excluding the redirect rows. */
function hubRoutes(): Array<{ path: string; component: string }> {
  const out: Array<{ path: string; component: string }> = [];
  for (const m of routesSrc.matchAll(
    /<Route\s+path="((?:hub|meet)(?:\/[^"]*)?)"\s+element=\{<(\w+)/g,
  )) {
    if (REDIRECTS.includes(m[2])) continue;
    out.push({ path: `/${m[1]}`, component: m[2] });
  }
  return out;
}

const sources = componentSources();
const routes = hubRoutes();

/** Hub pages carry the Hub bar; Meet pages carry the Meet bar. */
function hasSharedNavigation(jsx: string): boolean {
  return (
    jsx.includes('<HubNavBar />') ||
    jsx.includes('<MeetNavBar />') ||
    (jsx.includes('<IntentPageLayout') && /<(Hub|Meet)Nav[ />]/.test(jsx))
  );
}

function barFor(path: string): RegExp {
  return path.startsWith('/meet') ? /<MeetNav(Bar)?[ />]/ : /<HubNav(Bar)?[ />]|<HubShell/;
}

describe('hub and meet navigation is the same control on every page of its area', () => {
  // Positive control. Every assertion below is a `for` over `routes`, so a regex
  // that stops matching turns this file green while checking nothing — the
  // vacuous-sweep failure this repo keeps re-learning.
  it('finds the hub routes at all', () => {
    expect(routes.length).toBeGreaterThanOrEqual(15);
    expect(routes.map((r) => r.path)).toContain('/hub');
    expect(routes.map((r) => r.path)).toContain('/hub/friends');
    expect(routes.map((r) => r.path)).toContain('/meet/dating');
    expect(routes.map((r) => r.path)).toContain('/meet/groups/:groupId');
  });

  it('resolves each route component to a source file', () => {
    for (const r of routes) {
      expect(sources.has(r.component), `${r.path} -> ${r.component} source not found`).toBe(true);
    }
  });

  it('renders the shared navigation on every hub route', () => {
    for (const r of routes) {
      const src = sources.get(r.component) ?? '';
      // The intent layout embeds the same rail after its editorial opening.
      // HubShell is checked separately below.
      const ok = hasSharedNavigation(src) || src.includes('<HubShell');
      expect(ok, `${r.path} (${r.component}) renders no shared navigation`).toBe(true);
      // A /meet page must not wear the Hub bar (and vice versa).
      expect(
        barFor(r.path).test(src),
        `${r.path} (${r.component}) renders the wrong area bar`,
      ).toBe(true);
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
          hasSharedNavigation(jsx),
          `${r.component}: a returned screen renders no shared navigation`,
        ).toBe(true);
      }
    }
  });

  it('HubShell renders the shared bar rather than its own', () => {
    const shell = readFileSync(join(ROOT, 'src/components/hub/HubShell.tsx'), 'utf8');
    expect(shell).toContain('<HubNavBar />');
  });

  it('HubNavBar supplies the standalone placement with pb-0', () => {
    const bar = readFileSync(join(ROOT, 'src/components/hub/HubNavBar.tsx'), 'utf8');
    // pb-0 is what lets the bar sit above a page's own PageContainer without the
    // two stacking their vertical padding.
    expect(bar).toMatch(/<PageContainer className="hidden pb-0 pt-8 md:block">/);
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

  it('HubNav shows no identity block and no inbox badge (the inbox left the hub)', () => {
    const nav = readFileSync(join(ROOT, 'src/components/hub/HubNav.tsx'), 'utf8');
    // The avatar + handle link was removed on purpose: the hub is the
    // workspace, and the profile is one tap away in the account menu.
    expect(nav).not.toContain('HubIdentityBlock');
    expect(nav).not.toContain('useInboxUnreadCount');
    // Its only prop is presentational.
    expect(nav).toMatch(/export function HubNav\(\{ className \}: \{ className\?: string \}\)/);
  });
});
