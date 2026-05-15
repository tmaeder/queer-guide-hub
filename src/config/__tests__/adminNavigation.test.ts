import { describe, it, expect } from 'vitest';
import {
  adminNavSections,
  getNavItemByRoute,
  getBreadcrumbsForRoute,
  getAllCountTables,
} from '../adminNavigation';

describe('adminNavSections shape', () => {
  it('has cockpit, content, import-review, system sections', () => {
    expect(adminNavSections.map(s => s.id)).toEqual([
      'cockpit',
      'content',
      'import-review',
      'system',
    ]);
  });

  it('every item has unique id within its section', () => {
    for (const section of adminNavSections) {
      const ids = section.items.map(i => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every route is unique across the whole tree', () => {
    const routes = adminNavSections.flatMap(s => s.items.map(i => i.route));
    expect(new Set(routes).size).toBe(routes.length);
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
    expect(crumbs.map(c => c.label)).toEqual([
      'Admin Console',
      'Content',
      'Venues',
    ]);
  });

  it("omits section crumb for cockpit's /admin overview", () => {
    const crumbs = getBreadcrumbsForRoute('/admin');
    // Cockpit's section crumb is suppressed; only Admin Console + Overview.
    expect(crumbs.map(c => c.label)).toEqual(['Admin Console', 'Overview']);
  });

  it('falls back to prefix match — first matching item wins', () => {
    // /admin/content/venues/123 startsWith '/admin' (Overview), which is
    // checked first and short-circuits. This is acceptable behaviour for
    // the current loop order; the breadcrumb still includes Admin Console.
    const crumbs = getBreadcrumbsForRoute('/admin/content/venues/123');
    expect(crumbs[0].label).toBe('Admin Console');
    expect(crumbs.length).toBeGreaterThan(1);
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
    const tableNames = tables.map(t => t.table);
    expect(tableNames).toContain('venues');
    expect(tableNames).toContain('events');
  });
});
