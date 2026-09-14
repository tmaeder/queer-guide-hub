import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const PROSE = '50900101100000_glossary_residue_prose.sql';
const MERGE = '50900101100100_merge_graph_dead_targets.sql';

/**
 * Assertions run against COMMENT-STRIPPED sql. These migrations carry long
 * explanatory headers that quote the very strings the guards look for, so a
 * `toContain` over the raw file passes with the statement deleted — the vacuous
 * assertion class this repo has now recorded five times.
 */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

/**
 * The APPLY half only. Each migration's `do $verify$` block echoes the strings
 * its statements use, so an assertion about a statement must not be satisfiable
 * by the postcondition that checks it.
 */
const applyBlockOf = (file: string): string => {
  const sql = statementsOf(file);
  const end = sql.toLowerCase().indexOf('do $verify$');
  expect(end).toBeGreaterThan(0);
  return sql.slice(0, end);
};

const verifyBlockOf = (file: string): string => {
  const sql = statementsOf(file);
  const start = sql.toLowerCase().indexOf('do $verify$');
  expect(start).toBeGreaterThan(0);
  return sql.slice(start);
};

/** The single UPDATE that targets one slug, so an assertion cannot drift onto another. */
const updateFor = (apply: string, slugPredicate: string): string => {
  const at = apply.indexOf(slugPredicate);
  expect(at).toBeGreaterThan(0);
  const from = apply.lastIndexOf('update public.unified_tags', at);
  expect(from).toBeGreaterThan(-1);
  return apply.slice(from, at + slugPredicate.length + 400);
};

describe('50900101100000 — glossary residue prose', () => {
  const apply = applyBlockOf(PROSE);
  const verify = verifyBlockOf(PROSE);

  it('declares an actor, without which log_unified_tag_change RAISEs on the human_reviewed rows', () => {
    expect(apply).toContain(
      "set_config('app.actor', 'migration:50900101100000_glossary_residue_prose', true)",
    );
  });

  it('repairs sti-testing only while its description still defines STI', () => {
    const stmt = updateFor(apply, "where slug = 'sti-testing'");
    expect(stmt).toContain(
      "description ilike '%also referred to as a sexually transmitted disease%'",
    );
  });

  it('sti-testing gains human_reviewed, which is what keeps deprecate_unused_tags off a zero-usage row', () => {
    const stmt = updateFor(apply, "where slug = 'sti-testing'");
    expect(stmt).toContain('human_reviewed = true');
  });

  it('sti-testing prose no longer cites its own source to the reader', () => {
    const stmt = updateFor(apply, "where slug = 'sti-testing'");
    expect(stmt).not.toContain('According to a scientific article');
    expect(stmt).not.toContain('consult a healthcare provider');
  });

  it.each(['cialis', 'levitra', 'priapism'])(
    'fills %s only while its body is empty, so a human edit is never overwritten',
    (slug) => {
      const stmt = updateFor(apply, `where slug = '${slug}'`);
      expect(stmt).toContain("coalesce(long_description, '') = ''");
    },
  );

  it('fills chill only while BOTH its fields are empty', () => {
    const stmt = updateFor(apply, "where slug = 'chill'");
    expect(stmt).toContain("coalesce(description, '') = ''");
    expect(stmt).toContain("coalesce(long_description, '') = ''");
  });

  it('writes one UPDATE per slug — a set-based statement raises 27000 under the category triggers', () => {
    const updates = apply.match(/update public\.unified_tags/g) ?? [];
    expect(updates).toHaveLength(5);
    expect(apply).not.toMatch(/where slug in \(/i);
  });

  it('publishes nothing — no statement here touches seo_indexable', () => {
    expect(apply).not.toContain('seo_indexable');
  });

  it('the backslash-n guard uses position(), not a LIKE pattern where backslash is the escape char', () => {
    expect(verify).toContain("position('\\n' in coalesce(long_description,''))");
    expect(verify).not.toMatch(/LIKE '%\\n%'/);
  });

  it('counts the REACHED state positively, so a slug missing from the corpus fails rather than passes', () => {
    expect(verify).toContain('IF v_bodied <> 4 THEN');
  });
});

describe('50900101100100 — merge graph dead targets', () => {
  const apply = applyBlockOf(MERGE);
  const verify = verifyBlockOf(MERGE);

  it('declares an actor', () => {
    expect(apply).toContain(
      "set_config('app.actor', 'migration:50900101100100_merge_graph_dead_targets', true)",
    );
  });

  it('repoints onto abrosexual and refuses to do so unless that row is ACTIVE', () => {
    const stmt = updateFor(apply, "where t.slug = 'fluctuating-evolving'");
    // Scoped to the WHERE half on purpose. The SET subquery names the same
    // `a.slug = 'abrosexual' and a.status = 'active'` string, so an assertion
    // over the whole statement matches that occurrence and stays green with the
    // GUARD deleted — found by mutation, the same vacuous class as the STI
    // repoint test in 50400101100100's suite.
    const whereHalf = stmt.slice(stmt.indexOf("where t.slug = 'fluctuating-evolving'"));
    expect(whereHalf).toContain('and exists (select 1 from public.unified_tags a');
    expect(whereHalf).toContain("a.slug = 'abrosexual' and a.status = 'active'");
  });

  it('repoints only while the current target is deprecated', () => {
    const stmt = updateFor(apply, "where t.slug = 'fluctuating-evolving'");
    expect(stmt).toContain("w.id = t.merged_into_id and w.status = 'deprecated'");
  });

  it('DEINDEXES the five it demotes — merged is inert to crawlers, deprecated is not', () => {
    const at = apply.indexOf("where slug in ('jan-mikol-ek'");
    expect(at).toBeGreaterThan(0);
    const stmt = apply.slice(apply.lastIndexOf('update public.unified_tags', at), at);
    expect(stmt).toContain('seo_indexable      = false');
    expect(stmt).toContain('merged_into_id     = null');
    expect(stmt).toContain("status             = 'deprecated'");
  });

  it('withdraws a merge only while its target is actually deprecated', () => {
    const at = apply.indexOf("where slug in ('jan-mikol-ek'");
    const stmt = apply.slice(at);
    expect(stmt).toContain("w.id = unified_tags.merged_into_id and w.status = 'deprecated'");
  });

  it('drives the editorial key to zero and holds the three structural keys there', () => {
    expect(verify).toContain("IF (v_sig->>'target_deprecated')::int <> 0 THEN");
    expect(verify).toContain("(v_sig->>'target_merged')::int <> 0");
    expect(verify).toContain("(v_sig->>'target_missing')::int <> 0");
    expect(verify).toContain("(v_sig->>'self_merged')::int <> 0");
  });

  it('carries a positive control, because four zeroes from an empty merge graph is not a clean one', () => {
    expect(verify).toContain("v_total := (v_sig->>'merges_total')::int");
    expect(verify).toContain('IF v_total < 250 THEN');
  });

  it('asserts the repoint landed on the ACTIVE row rather than merely a different one', () => {
    expect(verify).toContain("WHERE t.slug = 'fluctuating-evolving' AND w.status = 'active'");
    expect(verify).toContain("IF v_target IS DISTINCT FROM 'abrosexual' THEN");
  });

  it('asserts nothing it touched is left publishable', () => {
    expect(verify).toContain('AND seo_indexable) THEN');
    expect(verify).toContain('a row touched here is still seo_indexable');
  });
});
