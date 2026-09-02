import { describe, it, expect } from 'vitest';
import { functionBody, latestMatching } from './helpers/migrations';

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
   */
  const sql = functionBody('unified_tags_normalize_slug');

  it('repairs the stale rows in the same migration', () => {
    expect(sql).toMatch(/merge_tag_concept/i);
    expect(sql).toMatch(/update public\.unified_tags u set slug/i);
  });

  it('scopes every repair arm to non-ASCII names', () => {
    // Without this term the predicate `slug <> normalize_tag_slug(name)` matches
    // 115 active rows, 106 of them namespaced prefixes.
    const arms = sql.match(/slug is distinct from public\.normalize_tag_slug\(/gi) ?? [];
    expect(arms.length).toBeGreaterThan(0);
    const nonAscii = sql.match(/name ~ '\[\^\\x00-\\x7F\]'/g) ?? [];
    expect(nonAscii.length).toBeGreaterThanOrEqual(arms.length);
  });

  it('caps the blast radius so a widened predicate aborts instead of renaming', () => {
    expect(sql).toMatch(/refusing to run/i);
  });

  it('leaves merged rows alone, since their slug is the redirect trail', () => {
    expect(sql).toMatch(/status <> 'merged'/i);
  });

  it('clears the self-aliases a twin-named merge mints', () => {
    // merge_tag_concept inserts the loser's NAME as an alias on the canonical.
    // Every collision pair here is twin-named, so that is an alias identical to
    // its own tag's name — the shape tag_hygiene_stats().alias_equals_name
    // keeps at zero, a hard baseline that check-tag-hygiene.mjs reads from PROD.
    expect(sql).toMatch(/delete from public\.tag_aliases/i);
    expect(sql).toMatch(/lower\(a\.alias_name\) = lower\(t\.name\)/i);
  });

  it('demotes the loser primary before merging', () => {
    // merge_tag_concept repoints a differently-filed category assignment without
    // demoting it, and tag_category_assignments_one_primary_per_tag then raises
    // 23505. Measured on prod: this silently swallowed 2 of the 4 merges.
    expect(sql).toMatch(/set is_primary = false/i);
  });
});
