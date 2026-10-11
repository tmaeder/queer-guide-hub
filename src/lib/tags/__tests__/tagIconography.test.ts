import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRANSIT_ICON_NAMES } from '@/components/transit/transitIconPaths';
import { parentOrder } from '@/components/resources/categoryMeta';
import { CATEGORY_LINES, DEFAULT_CATEGORY_ICON } from '@/lib/tags/categoryIdentity';
import {
  KIND_GLYPHS,
  TERM_GLYPHS_BY_STOP,
  STOP_GLYPHS,
  STOP_GLYPHS_BY_LINE,
  TAG_GLYPH_OVERRIDES,
  resolveTagGlyph,
} from '@/lib/tags/tagIconography';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const TREE = '20261006140000_tag_taxonomy_v3_tree.sql';

/**
 * The tree migration writes stops in TWO shapes, in two different blocks, and
 * parsing only one silently halves the coverage this file claims to check — the
 * positive control below is what caught exactly that:
 *
 *   block 2 "New L1 stops":  ('<name>', '<slug>', '<desc>', '<#color>', <sort>, '<parent-slug>')
 *   block 3 "Re-parent + rename": ('<slug>', '<name>', '<parent-slug>', <sort>)
 *
 * Note the slug and name swap places between them, so the shapes cannot be
 * merged into one regex without one of them mis-reading a name as a slug.
 * Both are parsed rather than retyped so the vocabulary cannot drift from DDL.
 */
function stopsFromTreeMigration(): { slug: string; parentSlug: string }[] {
  const sql = readFileSync(join(MIGRATIONS, TREE), 'utf8');

  const renamed = [
    ...sql.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*'[^']+'\s*,\s*'([a-z0-9-]+)'\s*,\s*\d+\s*\)/g),
  ].map((m) => ({ slug: m[1], parentSlug: m[2] }));

  const created = [
    ...sql.matchAll(
      /\(\s*'[^']+'\s*,\s*'([a-z0-9-]+)'\s*,\s*'[^']*'\s*,\s*'#[0-9a-f]{6}'\s*,\s*\d+\s*,\s*'([a-z0-9-]+)'\s*\)/gi,
    ),
  ].map((m) => ({ slug: m[1], parentSlug: m[2] }));

  return [...renamed, ...created];
}

/**
 * Stops added after the tree migration, each written in its own one-off shape
 * that the 4-tuple regex above cannot see. Verified present in those files by
 * the test below, so a typo here fails rather than silently shrinking coverage.
 *
 * KNOWN LIMIT, stated rather than implied: a FUTURE migration adding a stop in
 * yet another shape is not caught by this file. Only a prod-reading check could
 * see that, and it cannot be a PR gate — a stop added by a migration in the
 * same PR would only be coverable after the merge it would block. `Theory &
 * Scholarship` arriving in `20360401100000` is the proof the drift is real.
 */
const LATER_STOPS: { slug: string; parentSlug: string; migration: string }[] = [
  { slug: 'sex-positions', parentSlug: 'sex-kink', migration: '20261023100000_sex_positions_stop_and_refile.sql' },
  { slug: 'theory-scholarship', parentSlug: 'history-rights', migration: '20360401100000_theory_scholarship_category.sql' },
];

/** Parent slug → parent name, inverted from the one committed line table. */
const PARENT_NAME_BY_SLUG = new Map(
  Object.values(CATEGORY_LINES).map((l) => [l.slug, l.name] as const),
);

describe('tagIconography', () => {
  it('groups stops under exactly the eight canonical lines', () => {
    expect(Object.keys(STOP_GLYPHS_BY_LINE).sort()).toEqual([...parentOrder].sort());
  });

  it('resolves every glyph it names to a real icon path', () => {
    const all = [
      ...Object.values(STOP_GLYPHS),
      ...Object.values(TAG_GLYPH_OVERRIDES),
      ...Object.values(KIND_GLYPHS),
    ];
    // Positive control: an empty set would satisfy the loop vacuously.
    expect(all.length).toBeGreaterThan(60);
    for (const glyph of all) {
      expect(TRANSIT_ICON_NAMES, glyph).toContain(glyph);
    }
  });

  it('covers every stop the migrations create, and invents none', () => {
    const parsed = stopsFromTreeMigration();
    // Positive control. Without it, a regex that matches nothing also satisfies
    // "every stop has a glyph" and turns this file green while checking nothing.
    expect(parsed.length).toBeGreaterThanOrEqual(44);

    for (const { slug } of LATER_STOPS) {
      const sql = readFileSync(join(MIGRATIONS, LATER_STOPS.find((s) => s.slug === slug)!.migration), 'utf8');
      expect(sql, slug).toContain(`'${slug}'`);
    }

    const expected = new Set([...parsed.map((s) => s.slug), ...LATER_STOPS.map((s) => s.slug)]);
    expect(expected.size).toBe(46);

    for (const slug of expected) {
      expect(STOP_GLYPHS, `stop ${slug} has no glyph`).toHaveProperty(slug);
    }
    // And nothing extra: a stop that no longer exists is dead weight whose
    // comment will be trusted by the next reader.
    for (const slug of Object.keys(STOP_GLYPHS)) {
      expect(expected.has(slug), `${slug} is not a stop in any migration`).toBe(true);
    }
  });

  it('files every stop under the line the migration gives it', () => {
    const byLine = new Map<string, string>();
    for (const [line, stops] of Object.entries(STOP_GLYPHS_BY_LINE)) {
      for (const slug of Object.keys(stops)) {
        expect(byLine.has(slug), `${slug} is filed under two lines`).toBe(false);
        byLine.set(slug, line);
      }
    }
    for (const { slug, parentSlug } of [...stopsFromTreeMigration(), ...LATER_STOPS]) {
      const expectedLine = PARENT_NAME_BY_SLUG.get(parentSlug);
      if (!expectedLine) continue; // a parent row, not a stop
      expect(byLine.get(slug), `${slug} is filed wrong`).toBe(expectedLine);
    }
  });

  it('never gives two stops on the SAME line the same glyph', () => {
    // The load-bearing invariant. Two stops on one line sit side by side in the
    // same filtered grid, so a repeat there actively misleads; across lines a
    // repeat is cheap and several are deliberate.
    for (const [line, stops] of Object.entries(STOP_GLYPHS_BY_LINE)) {
      const glyphs = Object.values(stops);
      expect(new Set(glyphs).size, `${line} reuses a glyph across its own stops`).toBe(
        glyphs.length,
      );
    }
  });

  it('applies the tiers most-specific first', () => {
    // 1 override beats everything
    expect(
      resolveTagGlyph({
        slug: 'lesbian',
        stopSlug: 'sexual-orientation',
        parentName: 'Identity',
        entityKind: 'concept',
      }),
    ).toBe('sapphic');
    // 2 stop beats parent
    expect(
      resolveTagGlyph({ slug: 'whatever', stopSlug: 'fetishes-interests', parentName: 'Sex & Kink' }),
    ).toBe('gear-fetish');
    // 3 parent when the primary category IS a line (so tier 2 misses)
    expect(resolveTagGlyph({ slug: 'x', stopSlug: 'sex-kink', parentName: 'Sex & Kink' })).toBe(
      'consent',
    );
    // 4 entity kind when there is no category at all
    expect(resolveTagGlyph({ slug: 'x', entityKind: 'place' })).toBe('map');
    // 5 fallback
    expect(resolveTagGlyph({})).toBe(DEFAULT_CATEGORY_ICON);
    expect(resolveTagGlyph({ slug: 'nope', stopSlug: 'nope', parentName: 'nope' })).toBe(
      DEFAULT_CATEGORY_ICON,
    );
  });

  it('files every hand-picked term under a stop that exists', () => {
    // A renamed stop must fail loudly rather than silently orphan its terms
    // into a group nothing reads.
    for (const stop of Object.keys(TERM_GLYPHS_BY_STOP)) {
      expect(STOP_GLYPHS, `${stop} is not a stop`).toHaveProperty(stop);
    }
  });

  it('never hand-picks a glyph its stop would already have given', () => {
    // THE NON-REDUNDANCY INVARIANT. An entry is only worth its line if it
    // differs from what the term inherits anyway — `transgender` under
    // `gender-identity` is already `trans-pride`, so restating it is dead
    // weight that reads like a decision. This is what keeps the per-term layer
    // hand-picked rather than padded.
    const offenders: string[] = [];
    for (const [stop, terms] of Object.entries(TERM_GLYPHS_BY_STOP)) {
      for (const [term, glyph] of Object.entries(terms)) {
        if (glyph === STOP_GLYPHS[stop]) offenders.push(`${term} (${stop}) → ${glyph}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('carries enough hand-picked terms to be worth the tier', () => {
    // Positive control: the two assertions above are both satisfied by an
    // EMPTY map, which would quietly reduce the glossary to category marks.
    expect(Object.keys(TAG_GLYPH_OVERRIDES).length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(TERM_GLYPHS_BY_STOP).length).toBeGreaterThanOrEqual(20);
  });

  it('keys overrides by slug shape, not by display name', () => {
    // A key with a space or a capital matches no `unified_tags.slug` and is
    // silently inert — the documented `amenityIcons.ts` failure mode.
    for (const key of Object.keys(TAG_GLYPH_OVERRIDES)) {
      expect(key, key).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('breaks up the Sex & Kink pile the whole change exists to fix', () => {
    // The named regression. Before this module, all 2,415 active tags under
    // this line resolved to `consent`. Its six stops must now be six different
    // marks, and none of them the line's own.
    const stops = STOP_GLYPHS_BY_LINE['Sex & Kink'];
    const glyphs = Object.values(stops);
    expect(glyphs).toHaveLength(6);
    expect(new Set(glyphs).size).toBe(6);
    expect(glyphs).not.toContain('consent');
  });

  it('gives the five Health stops five different marks', () => {
    // The line that needed the two new drawings: Sexual Health and Body &
    // Reproductive Health both wanted `health`, and Substances & Recovery had
    // no candidate and fell to the global fallback.
    const glyphs = Object.values(STOP_GLYPHS_BY_LINE.Health);
    expect(glyphs).toHaveLength(5);
    expect(new Set(glyphs).size).toBe(5);
    expect(glyphs).toContain('harm-reduction');
    expect(STOP_GLYPHS['substances-harm-reduction']).not.toBe(DEFAULT_CATEGORY_ICON);
  });
});
