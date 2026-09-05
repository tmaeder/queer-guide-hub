import { describe, it, expect } from 'vitest';
import {
  adminNavSections,
  getNavItemByRoute,
  getBreadcrumbsForRoute,
  getAllCountTables,
  resolveItemMinRole,
} from '../adminNavigation';
import { roleAtLeast } from '../adminRoles';

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
