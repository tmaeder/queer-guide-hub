import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
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
const BODY = readFileSync(join(process.cwd(), 'functions/_lib/routeBody.ts'), 'utf8');
const EN = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/locales/en.json'), 'utf8'));

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

  it('gives every category crawler prose, not an empty shell', () => {
    // These pages render client-side from an RPC, so a non-JS crawler sees
    // exactly what routeBody.ts provides and nothing else. This was NOT caught
    // by the meta assertion above: the six had meta entries and no body, and
    // the hub still linked `?view=` URLs it had stopped serving.
    for (const c of COMPETITION_CATEGORIES) {
      expect(BODY, `no routeBody for ${c.slug}`).toContain(`'/competitions/${c.slug}'`);
    }
  });

  it('never links a view the hub no longer serves', () => {
    // /competitions is a hub now. `?view=` belongs to the category pages, so a
    // hub link carrying one points at a tab that is not there.
    expect(BODY).not.toMatch(/'\/competitions\?view=/);
  });

  it('backs every category string with a real key, not a dead fallback', () => {
    // AN INLINE t() FALLBACK IS NOT A COPY CHANGE. If the key exists, the key
    // wins and the fallback is dead code; if it is missing, the string cannot
    // be translated. Production shipped the hub's OLD eyebrow, h1, intro and
    // meta for exactly this reason — new text was written as fallbacks under
    // keys that already held the previous copy, so none of it ever rendered.
    //
    // Asserting presence alone would not have caught that, so the VALUES must
    // agree too: a key that disagrees with its literal is the same bug, just
    // pointing the other way.
    const cat = EN.competitions?.category ?? {};
    for (const c of COMPETITION_CATEGORIES) {
      const leaf = c.labelKey.split('.').pop() as string;
      expect(cat[leaf], `${c.id} label key missing`).toBe(c.label);
      expect(cat[`${leaf}Blurb`], `${c.id} blurb key missing`).toBe(c.blurb);
      // Derived by CompetitionCategoryPage from labelKey — see its useMeta call.
      expect(cat[`${leaf}MetaTitle`], `${c.id} meta title key missing`).toBe(c.metaTitle);
      expect(cat[`${leaf}MetaDescription`], `${c.id} meta description key missing`).toBe(
        c.metaDescription,
      );
    }
  });

  it('serves the SAME meta to a crawler as to a reader', () => {
    // routeMeta.ts holds its own COPY of every title and description, and that
    // copy is what a bot and the initial HTML get, while the SPA renders
    // en.json. They drifted the moment four titles were rewritten to drop em
    // dashes: production served Google 'Leather & Fetish Titles — IML, MIR'
    // while the page itself said 'Leather and Fetish Titles: IML and MIR'.
    //
    // Presence is not enough — the previous version of this file asserted only
    // that a routeMeta entry EXISTED, which stayed green through exactly that.
    // This is the /tags/hiv failure: humans read one description, Google
    // indexed another.
    for (const c of COMPETITION_CATEGORIES) {
      expect(META, `${c.slug} crawler title drifted from the source of truth`).toContain(
        `title: '${c.metaTitle}'`,
      );
      expect(META, `${c.slug} crawler description drifted`).toContain(c.metaDescription);
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

  it('gives every category a distinct bullet that collides with no entity line', () => {
    // The header of competitionCategories.ts justifies six types over four
    // track colours by pointing at ROUTE_BULLET_MAP's own city C-green vs
    // country C-yellow: the LETTER carries identity. That only holds while the
    // letters are actually unique and no pair duplicates an existing entity
    // line — a competition bullet that renders identically to `personality` or
    // `trip` would make the product's wayfinding ambiguous rather than dense.
    const letters = COMPETITION_CATEGORIES.map((c) => c.bullet.letter);
    expect(new Set(letters).size, 'two categories share a bullet letter').toBe(letters.length);

    const taken = new Set(Object.values(ROUTE_BULLET_MAP).map((b) => `${b.letter}-${b.track}`));
    for (const c of COMPETITION_CATEGORIES) {
      const pair = `${c.bullet.letter}-${c.bullet.track}`;
      expect(taken.has(pair), `${c.id} reuses the entity bullet ${pair}`).toBe(false);
    }
  });

  it('never repeats a track colour on adjacent hub cards', () => {
    // The hub renders COMPETITION_CATEGORIES in order at 1, 2 and 3 columns.
    // Two same-coloured cards touching would read as one line split in half,
    // which is the opposite of what a line legend is for. Checked at every
    // column count the grid actually uses (grid-cols-1 / md:2 / lg:3).
    const tracks = COMPETITION_CATEGORIES.map((c) => c.bullet.track);
    for (const cols of [1, 2, 3]) {
      for (let i = 0; i < tracks.length; i++) {
        if (i % cols !== 0) {
          expect(tracks[i], `cols=${cols}: card ${i} repeats its left neighbour`).not.toBe(
            tracks[i - 1],
          );
        }
        if (i >= cols) {
          expect(tracks[i], `cols=${cols}: card ${i} repeats the card above`).not.toBe(
            tracks[i - cols],
          );
        }
      }
    }
  });

  it('names a real wayfinding glyph for every category', () => {
    // `icon` is typed as TransitIconName, so a typo is a compile error — but
    // TRANSIT_ICON_PATHS is the runtime table, and a name present in the union
    // with no path renders an empty <path d={undefined}>, i.e. an invisible
    // icon that no type check can see.
    for (const c of COMPETITION_CATEGORIES) {
      expect(TRANSIT_ICON_PATHS[c.icon], `${c.id} has no drawn glyph`).toBeTruthy();
    }
    const icons = COMPETITION_CATEGORIES.map((c) => c.icon);
    expect(new Set(icons).size, 'two categories share a glyph').toBe(icons.length);
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
