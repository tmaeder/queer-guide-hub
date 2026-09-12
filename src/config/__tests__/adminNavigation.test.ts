import { describe, it, expect } from 'vitest';
import {
  adminNavSections,
  getNavItemByRoute,
  getBreadcrumbsForRoute,
  getAllCountTables,
  resolveItemMinRole,
  getRouteMinRole,
  ADMIN_ROUTE_ROLE_OVERRIDES,
} from '../adminNavigation';
import { roleAtLeast } from '../adminRoles';
import { ADMIN_QUEUES } from '../adminQueues';
import { contentTypeRegistry } from '../contentTypes';

describe('adminNavSections shape', () => {
  it('has cockpit, content, data, system sections', () => {
    expect(adminNavSections.map((s) => s.id)).toEqual(['cockpit', 'content', 'data', 'system']);
  });

  it('every item has unique id within its section', () => {
    for (const section of adminNavSections) {
      const ids = section.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every route is unique across the whole tree', () => {
    const routes = adminNavSections.flatMap((s) => s.items.map((i) => i.route));
    expect(new Set(routes).size).toBe(routes.length);
  });

  // The collapsed 64px rail drops section chrome and renders a flat icon list
  // (AdminSidebar's `if (collapsed)` branch), so a repeated icon is
  // unresolvable there — no label, no group, no section to disambiguate it.
  it('every item icon is unique across the whole tree', () => {
    const seen = new Map<unknown, string>();
    const dupes: string[] = [];
    for (const section of adminNavSections) {
      for (const item of section.items) {
        const prev = seen.get(item.icon);
        if (prev) dupes.push(`${item.id} shares an icon with ${prev}`);
        else seen.set(item.icon, item.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  // getBreadcrumbsForRoute links a section crumb to section.items[0].route.
  // If that item outranks the section, everyone who can see the section gets a
  // breadcrumb that 403s.
  it('no section leads with an item stricter than the section itself', () => {
    for (const section of adminNavSections) {
      const first = section.items[0];
      const sectionRole = section.minRole ?? 'editor';
      expect(
        roleAtLeast(sectionRole, resolveItemMinRole(first, section)),
        `${section.id} leads with ${first.id}, which needs a higher role than the section`,
      ).toBe(true);
    }
  });

  it('every group renders more than one row', () => {
    for (const section of adminNavSections) {
      const counts = new Map<string, number>();
      for (const item of section.items) {
        if (item.group) counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
      }
      for (const [group, n] of counts) {
        expect(n, `${section.id} › ${group} is a subheader over a single row`).toBeGreaterThan(1);
      }
    }
  });
});

describe('getNavItemByRoute', () => {
  it('finds an item by its exact route', () => {
    const item = getNavItemByRoute('/admin/content/venues');
    expect(item?.id).toBe('venues');
    expect(item?.countTable).toBe('venues');
  });

  it('returns undefined for unknown route', () => {
    expect(getNavItemByRoute('/admin/nope')).toBeUndefined();
  });
});

describe('getBreadcrumbsForRoute', () => {
  it("starts with the 'Admin Console' crumb", () => {
    const crumbs = getBreadcrumbsForRoute('/admin');
    expect(crumbs[0]).toEqual({ label: 'Admin Console', route: '/admin' });
  });

  it('builds [Admin Console, Section, Item] for a deep route', () => {
    const crumbs = getBreadcrumbsForRoute('/admin/content/venues');
    expect(crumbs.map((c) => c.label)).toEqual(['Admin Console', 'Content', 'Venues']);
  });

  it("omits section crumb for cockpit's /admin overview", () => {
    const crumbs = getBreadcrumbsForRoute('/admin');
    // Cockpit's section crumb is suppressed; only Admin Console + Overview.
    expect(crumbs.map((c) => c.label)).toEqual(['Admin Console', 'Overview']);
  });

  it('falls back to prefix match — first matching item wins', () => {
    // /admin/content/venues/123 startsWith '/admin' (Overview), which is
    // checked first and short-circuits. This is acceptable behaviour for
    // the current loop order; the breadcrumb still includes Admin Console.
    const crumbs = getBreadcrumbsForRoute('/admin/content/venues/123');
    expect(crumbs[0].label).toBe('Admin Console');
    expect(crumbs.length).toBeGreaterThan(1);
  });

  // The reachability property, swept over the whole tree rather than the two
  // hand-picked routes above. The public bar shipped two trails whose middle
  // crumbs carried no href (#3409) and a mobile ellipsis that hid three more
  // behind a non-interactive span (#3433); this is the admin analogue, and it
  // is a sweep because a defect of that shape arrives one route at a time.
  it('every crumb above the current page is a live link, on every route', () => {
    const routes = adminNavSections.flatMap((s) => s.items.map((i) => i.route));
    expect(routes.length).toBeGreaterThan(20);

    for (const route of routes) {
      const trail = getBreadcrumbsForRoute(route);
      for (const crumb of trail.slice(0, -1)) {
        expect(crumb.route, `${route}: crumb "${crumb.label}" has no destination`).toBeTruthy();
        // A crumb pointing at an unregistered path is a dead link that reads
        // exactly like a live one.
        expect(
          crumb.route === '/admin' || routes.includes(crumb.route!),
          `${route}: crumb "${crumb.label}" -> ${crumb.route} is not a nav route`,
        ).toBe(true);
      }
      // Positive control: the page you are ON must not be a link, so the
      // assertion above cannot pass by everything being linked.
      expect(trail.at(-1)!.route, `${route}: the current page must not link`).toBeUndefined();
    }
  });

  it('returns just the root crumb when nothing matches', () => {
    const crumbs = getBreadcrumbsForRoute('/totally/unrelated');
    expect(crumbs).toEqual([{ label: 'Admin Console', route: '/admin' }]);
  });
});

describe('getAllCountTables', () => {
  it('returns every item that has countTable configured', () => {
    const tables = getAllCountTables();
    expect(tables.length).toBeGreaterThan(5);
    for (const t of tables) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.table).toBe('string');
    }
  });

  it('returns at least venues and events', () => {
    const tables = getAllCountTables();
    const tableNames = tables.map((t) => t.table);
    expect(tableNames).toContain('venues');
    expect(tableNames).toContain('events');
  });
});

describe('getRouteMinRole', () => {
  it('resolves a plain content route to the Content floor', () => {
    // Positive control. A suite where everything came back 'admin' would satisfy
    // every "not reachable by an editor" assertion below while gating nothing
    // correctly, so the permissive cases have to be pinned too.
    expect(getRouteMinRole('/admin/content/venues')).toBe('editor');
    expect(getRouteMinRole('/admin/content/events')).toBe('editor');
  });

  it('inherits the nearest nav item by longest prefix', () => {
    expect(getRouteMinRole('/admin/settings')).toBe('moderator');
    expect(getRouteMinRole('/admin/business/some-uuid')).toBe('admin');
  });

  it('falls back to the console floor for an unmapped admin route', () => {
    expect(getRouteMinRole('/admin/nothing-here')).toBe('editor');
  });

  /**
   * The regression this block exists for.
   *
   * `/admin/settings` is moderator, and its comment claimed that covered "every
   * /admin/settings/* sub-page, via longest-prefix". Each of those sub-pages is a
   * <Navigate> to /admin/content/<vocab>, whose longest nav prefix is
   * /admin/content → editor, so the gate protected the redirect stubs and nothing
   * behind them. `getRouteMinRole` had no test of any kind.
   */
  const VOCABULARIES = [
    'venue_services',
    'event_types',
    'event_amenities',
    'event_services',
    'accessibility_attributes',
    'target_groups',
    'professions',
  ] as const;

  it.each(VOCABULARIES)('vocabulary %s is not reachable by an editor', (vocab) => {
    const min = getRouteMinRole(`/admin/content/${vocab}`);
    expect(min).toBe('moderator');
    expect(roleAtLeast('editor', min)).toBe(false);
    expect(roleAtLeast('moderator', min)).toBe(true);
  });

  it('gates the Business-console tables at the tier the console itself carries', () => {
    // /admin/business is adminOnly; these are the raw lists behind its own tabs.
    for (const t of ['hotels', 'marketplace_brands', 'organizations']) {
      const min = getRouteMinRole(`/admin/content/${t}`);
      expect(min).toBe('admin');
      expect(roleAtLeast('moderator', min)).toBe(false);
    }
    expect(getRouteMinRole('/admin/business')).toBe('admin');
  });

  it('never lets an override LOOSEN a route below its nav-derived floor', () => {
    // Asserted as a property over the whole table, so a future entry cannot
    // quietly open a page the nav tree already restricts.
    for (const [route, override] of Object.entries(ADMIN_ROUTE_ROLE_OVERRIDES)) {
      expect(roleAtLeast(getRouteMinRole(route), override)).toBe(true);
    }
  });

  it('every registry content type resolves at a deliberate tier', () => {
    // `content/:type` is a wildcard: adding a table to the registry publishes an
    // admin CRUD page for it whether or not anything links to it. Pinning the
    // editor-level set means a new type shows up in this diff and forces a
    // decision rather than defaulting open.
    const editorLevel = Object.keys(contentTypeRegistry)
      .filter((key) => getRouteMinRole(`/admin/content/${key}`) === 'editor')
      .sort();
    expect(editorLevel).toEqual([
      'cities',
      'cms_pages',
      'community_groups',
      'countries',
      'events',
      'feedback',
      'guides',
      'marketplace_listings',
      'milestones',
      'news_articles',
      'personalities',
      'queer_villages',
      'unified_tags',
      'venues',
    ]);
  });
});

describe('nav and queue role agreement', () => {
  /**
   * A queue you cannot see must not be a page you can open.
   *
   * `adminQueues.minRole` gates whether the cockpit shows the queue row;
   * `getRouteMinRole` gates whether the page opens. Three disagreed —
   * /admin/quality, /admin/content/group-requests and /admin/content/liveness
   * each declared `moderator` on the queue while resolving to `editor` as a
   * route, so the work was reachable by exactly the users it was hidden from.
   */
  it('no queue is stricter than the route it points at', () => {
    const mismatches = ADMIN_QUEUES.filter((q) => {
      // Every inbox queue shares the /admin/inbox route; only distinct pages can
      // disagree with their own gate.
      if (q.route.startsWith('/admin/inbox')) return false;
      return !roleAtLeast(getRouteMinRole(q.route), q.minRole);
    }).map((q) => `${q.route}: queue=${q.minRole} route=${getRouteMinRole(q.route)}`);

    expect(mismatches).toEqual([]);
  });

  it('checks a non-trivial number of queues (guards a vacuous filter)', () => {
    const checked = ADMIN_QUEUES.filter((q) => !q.route.startsWith('/admin/inbox'));
    expect(checked.length).toBeGreaterThanOrEqual(4);
  });
});
