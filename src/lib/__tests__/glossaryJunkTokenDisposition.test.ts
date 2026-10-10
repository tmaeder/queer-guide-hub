/**
 * 99991791619649 — twenty junk tokens leave the glossary.
 *
 * The invariants a later reader could plausibly undo, and why each is here:
 *
 * 1. The cohort is an EXPLICIT SLUG LIST, never a regex. A regex over this
 *    corpus catches `TV`, `DJ` and the ~20,000-use marketplace size facets.
 * 2. `TV`, `DJ`, `369`, `469` and `size-l` are asserted to SURVIVE. "The twenty
 *    are gone" is equally satisfied by a sweep that took everything.
 * 3. All THREE free-text arrays are cleared, asserted per table — a combined
 *    zero passes when one table was cleaned and another skipped.
 * 4. `deprecated_at` is set, because `search_documents_index_tags` keys on it
 *    and NOT on `status`.
 * 5. Assignments are deleted, because `assignment_to_non_active_tag` is a hard
 *    zero-invariant that would otherwise red every open PR.
 * 6. `Over 30` is REFILED, not deprecated — its name is correct.
 * 7. The verify block cannot be neutered: every comparison is `<>`, and no
 *    `where false` / `and false` short-circuit is permitted.
 *
 * Text checks run against the repo, so CI needs no credentials.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791619649_glossary_junk_token_disposition';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', `${MIGRATION}.sql`), 'utf8');

// The header names every slug it removes AND every control it spares, in the
// same words the assertions below look for — `tv`, `dj`, `369`, `469`,
// `size-l`, `attribute`, `deprecated_at`. An unstripped `toContain` therefore
// passes with the executable statement deleted, and an unstripped negative
// assertion fails on correct code.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verify = sql.slice(sql.indexOf('do $verify$'));
const statements = sql.slice(0, sql.indexOf('do $verify$'));

/** Every slug the migration dispositions. */
const COHORT = [
  'all',
  'other',
  'no',
  'us',
  'uk',
  'gb',
  'nz',
  'es',
  'it',
  'de',
  'cz',
  'tw',
  'lu',
  'ng',
  'mk',
  'mu',
  'pe',
  'a',
  'r',
  'b',
];

/** Read by hand and deliberately spared. A sweep that takes these is too wide. */
const CONTROLS = ['tv', 'dj', '369', '469', 'size-l'];

describe(`${MIGRATION} — the cohort`, () => {
  it('declares an attributed actor, because B is human_reviewed', () => {
    // log_unified_tag_change() RAISEs when an undeclared `system:%` actor
    // modifies a human_reviewed row. `B` is one, so this is load-bearing here
    // rather than attribution-only.
    expect(statements).toContain(`set_config('app.actor', 'migration:${MIGRATION}', true)`);
  });

  it('selects the cohort by explicit slug, never by a name regex', () => {
    expect(statements).toContain('where slug = any(v_slugs)');
    // A regex over names would catch the controls. `~` must not appear in the
    // statement half at all.
    expect(statements).not.toMatch(/name\s*~/);
  });

  it.each(COHORT)('includes %s in the slug list', (slug) => {
    expect(statements).toMatch(new RegExp(`'${slug}'`));
  });

  it('lists exactly 20 slugs, twice — the worklist and the verify block', () => {
    const arrays = raw.match(/v_slugs constant text\[\] := array\[/g) ?? [];
    expect(arrays).toHaveLength(2);
    for (const half of [statements, verify]) {
      const decl = half.slice(half.indexOf('array['), half.indexOf(']', half.indexOf('array[')));
      expect(decl.match(/'[a-z0-9]+'/g)).toHaveLength(20);
    }
  });

  it.each(CONTROLS)('never writes %s', (slug) => {
    // The controls may appear in the verify block (as controls); they must not
    // be in the cohort the statements act on.
    const decl = statements.slice(
      statements.indexOf('array['),
      statements.indexOf(']', statements.indexOf('array[')),
    );
    expect(decl).not.toMatch(new RegExp(`'${slug}'`));
  });
});

describe(`${MIGRATION} — what it deletes, and in what order`, () => {
  it('deletes assignments, relations and category rows', () => {
    expect(statements).toContain('delete from unified_tag_assignments where tag_id = any(v_ids)');
    expect(statements).toContain('delete from tag_relations');
    expect(statements).toContain('delete from tag_category_assignments where tag_id = any(v_ids)');
  });

  it('clears all three free-text tag arrays', () => {
    // Anchored on a WORD BOUNDARY, not a substring. `toContain('update
    // news_articles')` is satisfied by `update news_articles_OFF` — a mutation
    // that renames the target table so the statement writes nothing SURVIVED
    // the first mutation round for exactly that reason. The verify block's own
    // per-table check stays green under it too, because the mutation only
    // touches the statement half.
    for (const table of ['events', 'venues', 'news_articles']) {
      expect(statements).toMatch(new RegExp(`update ${table}(?![\\w])`));
    }
  });

  it('matches a whole lower-cased token, never a substring', () => {
    // `like '%us%'` here would strip "trust" and "museum" out of real tags.
    expect(statements).not.toMatch(/like\s+'%/);
    const hits = statements.match(/lower\(btrim\([xy]\)\)/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(6); // one filter + one guard per table
  });

  it('deprecates rather than deleting the tag row', () => {
    // A hard DELETE on unified_tags is unprecedented and irreversible;
    // restore_deprecated_tag undoes a deprecation.
    expect(statements).not.toMatch(/delete\s+from\s+unified_tags/);
    expect(statements).toContain("status             = 'deprecated'");
  });

  it('sets deprecated_at, which the search indexer keys on instead of status', () => {
    expect(statements).toContain('deprecated_at      = now()');
    expect(statements).toContain('seo_indexable      = false');
  });

  it('deletes the assignments BEFORE deprecating the tag', () => {
    // Not cosmetic: between the two statements the corpus carries assignments
    // pointing at a non-active tag, which is a hard zero-invariant. Same
    // transaction either way, but the order is the one a reader can check.
    expect(statements.indexOf('delete from unified_tag_assignments')).toBeLessThan(
      statements.indexOf("status             = 'deprecated'"),
    );
  });

  it('is soft on preconditions so a concurrent repair cannot abort db push', () => {
    expect(statements).toContain('raise notice');
    expect(statements).toContain('if v_ids is null then');
    expect(statements).toContain("and status is distinct from 'deprecated'");
  });
});

describe(`${MIGRATION} — Over 30 is refiled, not deprecated`, () => {
  it('changes only entity_kind, and only on an active concept', () => {
    expect(statements).toContain("set entity_kind = 'descriptor'");
    expect(statements).toContain("where slug = 'u30'");
    expect(statements).toContain("and entity_kind::text = 'concept'");
  });

  it('never deprecates u30 and never rewrites its name', () => {
    const block = statements.slice(statements.indexOf("set entity_kind = 'descriptor'"));
    expect(block).not.toMatch(/status\s*=\s*'deprecated'/);
    expect(block).not.toMatch(/\bset name\b|name\s*=\s*'/);
    // u30 is absent from the deprecation cohort.
    const decl = statements.slice(
      statements.indexOf('array['),
      statements.indexOf(']', statements.indexOf('array[')),
    );
    expect(decl).not.toContain("'u30'");
  });
});

describe(`${MIGRATION} — postconditions`, () => {
  it('counts the REACHED state positively, not rows in the bad state', () => {
    // Counting rows in a BAD state returns 0 for a slug that has vanished from
    // the corpus, which the soft preconditions above now permit.
    expect(verify).toContain('if v_bad <> 20 then');
    expect(verify).toContain("status = 'deprecated'");
    expect(verify).toContain('deprecated_at is not null');
  });

  it('asserts each free-text table separately', () => {
    for (const table of ['events', 'venues', 'news_articles']) {
      expect(verify).toMatch(new RegExp(`from ${table}\\b[\\s\\S]{0,160}?any\\(v_slugs\\)`));
    }
  });

  it('asserts the five spared controls are still active', () => {
    expect(verify).toContain("slug in ('tv', 'dj', '369', '469', 'size-l')");
    expect(verify).toContain('if v_bad <> 5 then');
  });

  it('asserts size-l keeps its assignments, so a wide sweep is caught', () => {
    expect(verify).toContain("u.slug = 'size-l'");
    expect(verify).toContain('if v_bad < 20000 then');
  });

  it('asserts Over 30 survived as a descriptor with its name intact', () => {
    expect(verify).toContain("entity_kind::text = 'descriptor' and name = 'Over 30'");
  });

  it('cannot be neutered', () => {
    const comparisons = verify.match(/if v_bad [<>=]+ /g) ?? [];
    expect(comparisons.length).toBeGreaterThanOrEqual(10);
    // Every gate is an inequality against an expected value, or a `<` floor on
    // the size-facet control. A loosened `>=` would pass on a sweep that took
    // more than it should.
    for (const c of comparisons) expect(['if v_bad <> ', 'if v_bad < ']).toContain(c);
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/\band false\b/i);
    // Every check reads the database rather than a pre-seeded counter.
    const reads = verify.match(/select count\(\*\) into v_bad/g) ?? [];
    expect(reads.length).toBe(comparisons.length);
  });
});
