import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { functionBody, latestMatching } from './helpers/migrations';

/** The one-shot repair lives only in this file — see the note in its describe. */
const MIGRATION = '20261211120000_tag_slug_seal.sql';

/**
 * source-tags-extract slugifies with `name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`,
 * which never transliterates, so 'ü' becomes '-' and "Bühne" arrives as "b-hne".
 * It passes that slug into upsert({onConflict:'slug'}), and a caller-supplied
 * slug used to beat both triggers.
 *
 * The seal makes the name win — but ONLY for a non-ASCII name. That narrowness
 * is the invariant under test, in both directions:
 *
 *  - drop the non-ASCII test and the diacritic bug comes back;
 *  - widen it by so much as an `OR` and it reaches the ASCII namespace prefixes
 *    (mat-, vibe-, occ-, color-, genre-, news-), renaming mat-silicone (4,643
 *    uses) to silicone and collapsing occ-pride and news-pride — two different
 *    tags that share the name "Pride" — onto one slug.
 *
 * An earlier version of this file asserted only that the two branch bodies were
 * present. Mutation-testing showed that stayed GREEN when the condition was
 * inverted (`~` -> `!~`) and when `OR NEW.slug IS NOT NULL` was appended — the
 * literal hazard the migration header is mostly about. So the condition itself
 * is extracted and asserted, not merely the branches it guards.
 */

const TRIGGER_RE = /create\s+(or\s+replace\s+)?trigger\s+"?trg_unified_tags_normalize_slug"?/i;

describe('unified_tags_normalize_slug seal', () => {
  const body = functionBody('unified_tags_normalize_slug');

  /** The seal's IF condition, whitespace-normalised. */
  const cond = (() => {
    const m = body.match(/\bIF\s+([\s\S]*?)\s+THEN\b/i);
    expect(m, 'the function has no IF condition to seal on').not.toBeNull();
    return m![1].replace(/\s+/g, ' ');
  })();

  it('tests the name positively for non-ASCII', () => {
    // `!~` here would invert the seal: it would rewrite slugs for every ASCII
    // name and leave the diacritic names alone — precisely backwards.
    expect(cond).toMatch(/NEW\.name\s*~\s*'\[\^\\x00-\\x7F\]'/i);
  });

  it('has no widening disjunct', () => {
    // A disjunct reaches the ASCII namespace prefixes (mat-, news-, occ-) and
    // renames them. mat-silicone alone is 4,643 uses.
    expect(cond).not.toMatch(/\bor\b/i);
    expect(cond).not.toMatch(/!~/);
  });

  it('still honours a caller slug for a pure-ASCII name', () => {
    // The ELSE branch is what keeps the namespace prefixes addressable.
    expect(body).toMatch(/coalesce\(\s*NEW\.slug\s*,\s*NEW\.name\s*\)/i);
  });

  it('falls back to a digest rather than writing an empty slug', () => {
    expect(body).toMatch(/encode\(\s*digest\(/i);
  });
});

describe('the trigger that carries the seal', () => {
  // A column-scoped trigger fires only on the columns named in the UPDATE
  // statement. If a later migration narrows `BEFORE INSERT OR UPDATE OF name,
  // slug`, the seal silently stops firing and every text assertion above stays
  // green — so the scope is asserted too.
  const sql = latestMatching(TRIGGER_RE, 'the trg_unified_tags_normalize_slug trigger');
  const def = sql.slice(sql.search(TRIGGER_RE));
  const scope = def.slice(0, def.search(/\bon\s+("?public"?\.)?"?unified_tags"?/i));

  it('fires on INSERT, which is where the weekly extractor batch arrives', () => {
    expect(scope).toMatch(/before\s+insert\s+or\s+update\s+of/i);
  });

  it.each(['name', 'slug'])('fires on UPDATE OF %s', (col) => {
    expect(scope).toMatch(new RegExp(`\\b${col}\\b`));
  });
});

describe('the repair ships with the seal', () => {
  /**
   * The seal alone forks the corpus. Postgres evaluates the ON CONFLICT arbiter
   * AFTER the BEFORE-INSERT trigger, so once the trigger rewrites b-hne to
   * buhne the arbiter stops finding the stale row and inserts a twin carrying
   * zero usages. The gap between two migrations is one Sunday cron, so the
   * repair has to be in the same file as the seal.
   *
   * Pinned to the FILENAME, not to functionBody(...). The repair is a one-shot
   * that lives only here, while the function is long-lived — keying these to the
   * newest definition of the function would fail all of them the day a later
   * migration legitimately redefines it.
   */
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

  /**
   * Comments stripped FIRST. Prose must never be able to satisfy a guard: the
   * previous version of the scope test counted matches file-wide, and one of the
   * seven hits was inside a comment while two more were the seal and the
   * namespace guard — neither paired with an arm. Three of the four arms could
   * therefore lose the term, INCLUDING the rename arm that would rewrite
   * mat-silicone, and this file stayed green.
   */
  const stripped = sql.replace(/^\s*--.*$/gm, '');

  it('repairs the stale rows in the same migration', () => {
    expect(stripped).toMatch(/merge_tag_concept/i);
    expect(stripped).toMatch(/update public\.unified_tags u set slug/i);
  });

  it('scopes every repair arm to non-ASCII names', () => {
    // Proximity, per arm — not a file-wide count.
    const arms = [...stripped.matchAll(/slug is distinct from public\.normalize_tag_slug\(/gi)];
    expect(arms.length).toBeGreaterThan(0);
    for (const m of arms) {
      const window = stripped.slice(Math.max(0, m.index! - 400), m.index! + 400);
      expect(window, `unscoped arm at offset ${m.index}`).toMatch(/name ~ '\[\^\\x00-\\x7F\]'/);
    }
  });

  it('drives every arm from one materialised candidate set', () => {
    // The cap must bound the SET the arms consume. When each arm restated the
    // predicate, dropping the scope from the rename arm alone left the cap
    // reading 11, passing, and the rename touching 115 rows.
    expect(stripped).toMatch(/create temp table _slug_repair_candidates/i);
    expect((stripped.match(/_slug_repair_candidates/gi) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('caps the blast radius so a widened predicate aborts instead of renaming', () => {
    expect(stripped).toMatch(/refusing to run/i);
    expect(stripped).toMatch(/refusing to rename a facet/i);
  });

  it('leaves merged rows alone, since their slug is the redirect trail', () => {
    expect(stripped).toMatch(/status <> 'merged'/i);
  });

  it('refuses to orphan an entity tags[] array', () => {
    // The rename arm does not rewrite tags[]. Its safety was measured once, on
    // 2026-09-02; source-tags-extract runs `0 5 * * 0` and can write between
    // that measurement and the apply, so the check is re-taken at apply time.
    expect(stripped).toMatch(/would be orphaned/i);
    expect(stripped).toMatch(/c\.old_slug = any\(e\.tags\)/i);
  });

  it('names the row when a merged holder blocks both arms', () => {
    // Such a row falls through the merge arm (o.status <> 'merged') and the
    // rename arm (NOT EXISTS sees the holder), and would otherwise die three
    // blocks later at an assertion reporting a count rather than a cause.
    expect(stripped).toMatch(/held by a merged row/i);
  });

  it('clears the self-aliases a twin-named merge mints', () => {
    // merge_tag_concept inserts the loser's NAME as an alias on the canonical.
    // Every collision pair here is twin-named, so that is an alias identical to
    // its own tag's name — the shape tag_hygiene_stats().alias_equals_name
    // keeps at zero, a hard baseline that check-tag-hygiene.mjs reads from PROD.
    expect(stripped).toMatch(/delete from public\.tag_aliases/i);
    expect(stripped).toMatch(/lower\(a\.alias_name\) = lower\(t\.name\)/i);
  });

  it('demotes the loser primary before merging', () => {
    // merge_tag_concept repoints a differently-filed category assignment without
    // demoting it, and tag_category_assignments_one_primary_per_tag then raises
    // 23505. Measured on prod: this silently swallowed 2 of the 4 merges.
    expect(stripped).toMatch(/set is_primary = false/i);
  });

  it('raises the real error instead of swallowing a failed merge', () => {
    expect(stripped).toMatch(/v_failed := v_failed \+ 1/i);
    expect(stripped).toMatch(/merge\(s\) failed/i);
  });

  it.each([
    ['alias_equals_name', /alias_equals_name is a zero-invariant/i],
    ['assignment_to_non_active_tag', /assignment_to_non_active_tag is a zero-invariant/i],
  ])('asserts the %s zero-invariant it could break', (_k, re) => {
    expect(stripped).toMatch(re);
  });

  it('derives redirect_to_non_canonical rather than asserting it', () => {
    // A baselined oscillator, not an invariant — so it is printed, and the
    // number in scripts/tag-hygiene-baseline.json comes from an apply.
    expect(stripped).toMatch(/redirect_to_non_canonical is now/i);
  });
});
