import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPETITION_CATEGORIES, categoryPath } from '@/lib/competitionCategories';

/**
 * The six category pages exist in FOUR places that can drift apart:
 * `competitionCategories.ts` (the source of truth), `src/routes.tsx` (what
 * actually renders), `functions/_lib/routeMeta.ts` (crawler title AND the
 * sitemap — that table is what `sitemap-static.xml` enumerates), and
 * `routeBody.ts` (the crawler's visible copy).
 *
 * A category present in one and missing from another fails silently in a
 * different way each time: no route is a 404, no meta is an untitled page that
 * never reaches the sitemap, no body is an empty shell for non-JS crawlers.
 */
const ROUTES = readFileSync(join(process.cwd(), 'src/routes.tsx'), 'utf8');
const META = readFileSync(join(process.cwd(), 'functions/_lib/routeMeta.ts'), 'utf8');

describe('competition category routes', () => {
  it('registers every category as a route', () => {
    for (const c of COMPETITION_CATEGORIES) {
      expect(ROUTES, `no route for ${c.slug}`).toContain(`competitions/${c.slug}`);
      expect(ROUTES, `route for ${c.slug} passes no category`).toContain(`category="${c.id}"`);
    }
  });

  it('never puts a param in the second path position', () => {
    // `/competitions/:category` ties with `/:locale/<X>` and resolves into
    // LocaleRouter's unknown-locale -> NotFound branch. Every category route
    // must be a literal segment. This is the single most repeated routing trap
    // in this file's history.
    expect(ROUTES).not.toMatch(/path="competitions\/:/);
  });

  it('gives every category a meta entry, which is also what puts it in the sitemap', () => {
    for (const c of COMPETITION_CATEGORIES) {
      expect(META, `no routeMeta for ${c.slug}`).toContain(`'/competitions/${c.slug}'`);
    }
  });

  it('keeps slugs unique and URL-safe', () => {
    const slugs = COMPETITION_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size, 'duplicate category slug').toBe(slugs.length);
    for (const s of slugs) expect(s, `${s} is not a clean slug`).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('builds paths through categoryPath rather than by hand', () => {
    for (const c of COMPETITION_CATEGORIES) {
      expect(categoryPath(c)).toBe(`/competitions/${c.slug}`);
    }
  });

  it('offers the grid only where editions actually have episodes', () => {
    // A title contest is decided in one night. Offering a grid view there is a
    // dead end, so `hasGrid` must stay false for the pageant and title types.
    const grid = Object.fromEntries(COMPETITION_CATEGORIES.map((c) => [c.id, c.hasGrid]));
    expect(grid.drag_series).toBe(true);
    expect(grid.drag_king).toBe(true);
    expect(grid.drag_pageant).toBe(false);
    expect(grid.trans_pageant).toBe(false);
    expect(grid.gay_title).toBe(false);
    expect(grid.leather_title).toBe(false);
  });
});
