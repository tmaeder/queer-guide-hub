import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FACET = '60000101160000_hiv_aids_topic_facet.sql';
const SWEEP = '60000101160100_styleguide_drift_vibrant_sweep.sql';

/**
 * Comment-stripped. Both files carry long headers that quote the very strings
 * the guards look for — including the rejected rename and the old circular
 * description — so a `toContain` over raw source passes with the statement
 * deleted. Fifth recorded instance of that class in this repo.
 */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

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

describe('60000101160000 — hiv-aids stays a facet', () => {
  const apply = applyBlockOf(FACET);
  const verify = verifyBlockOf(FACET);

  it('declares an actor', () => {
    expect(apply).toContain(
      "set_config('app.actor', 'migration:60000101160000_hiv_aids_topic_facet', true)",
    );
  });

  it('repairs only while the description is still the circular one', () => {
    expect(apply).toContain("description ilike '%related news and research%'");
  });

  it('does NOT rename the tag — the rename moves the slug and title-cases the name', () => {
    // The apply half must not touch `name` at all. Scoped to the UPDATE's SET
    // list: the header discusses the rejected rename at length.
    expect(apply).not.toMatch(/\bname\s*=/);
  });

  it('does NOT merge, deprecate or deindex the facet', () => {
    expect(apply).not.toContain('merged_into_id');
    expect(apply).not.toContain('seo_indexable');
    expect(apply).not.toMatch(/status\s*=/);
  });

  it('asserts the slug did not move — the failure mode the rename would have caused', () => {
    expect(verify).toContain("WHERE t.slug = 'hiv-aids'");
    expect(verify).toContain('no row at slug hiv-aids');
  });

  it('asserts the name is unchanged, so a later edit cannot slip the rename in', () => {
    expect(verify).toContain("IF v_name <> 'HIV/AIDS' THEN");
  });

  it('asserts the facet survives with its assignments rather than only checking the prose', () => {
    expect(verify).toContain('IF v_uses < 250 THEN');
    expect(verify).toContain('AND merged_into_id IS NULL AND seo_indexable');
  });

  it('asserts the kept Wikidata id still yields diagnostic codes', () => {
    expect(verify).toContain('IF v_codes = 0 THEN');
  });

  it('asserts the definition rows it deliberately does not absorb are still active', () => {
    expect(verify).toContain("WHERE slug='hiv'  AND status='active'");
    expect(verify).toContain("WHERE slug='aids' AND status='active'");
  });
});

describe('60000101160100 — vibrant sweep', () => {
  const apply = applyBlockOf(SWEEP);
  const verify = verifyBlockOf(SWEEP);

  it('declares an actor', () => {
    expect(apply).toContain(
      "set_config('app.actor', 'migration:60000101160100_styleguide_drift_vibrant_sweep', true)",
    );
  });

  it('touches only reachable rows — indexable, not ghost/merged, not a duplicate', () => {
    expect(apply).toContain('c.duplicate_of_id is null');
    expect(apply).toContain('c.seo_indexable');
    expect(apply).toContain("coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')");
  });

  it('removes the adjective only where the following word is consonant-initial', () => {
    // The vowel case would strand the article ("a iconic port"), so the class
    // is what keeps those 37 rows out.
    expect(apply).toContain("'\\ma vibrant and ([b-df-hj-np-tv-z])', 'a \\1'");
    expect(apply).toContain("'\\ma vibrant ([b-df-hj-np-tv-z])', 'a \\1'");
  });

  it('never touches the ambiguous "and vibrant" shape', () => {
    expect(apply).not.toContain('and vibrant (');
    expect(apply).not.toMatch(/'\\mand vibrant/);
  });

  it('applies the "a vibrant and" rule BEFORE the bare "a vibrant" rule', () => {
    // Ordering is what removes the need for a negative lookahead: rule 1
    // consumes every consonant-initial "a vibrant and", and "and" cannot match
    // the consonant class afterwards.
    const andRule = apply.indexOf('\\ma vibrant and (');
    const bareRule = apply.indexOf('\\ma vibrant ([b-df-hj-np-tv-z])');
    expect(andRule).toBeGreaterThan(0);
    expect(bareRule).toBeGreaterThan(andRule);
  });

  it('preserves the original text under field_provenance, built with || not jsonb_set', () => {
    expect(apply).toContain("'from', t.before_txt");
    // Merges into any existing `description` provenance rather than replacing
    // it, and avoids jsonb_set(create_missing) — which creates only the LAST
    // path element and silently writes nothing when the parent key is absent
    // (the trap 21050101100000 recorded).
    expect(apply).toContain("coalesce(c.field_provenance -> 'description', '{}'::jsonb)");
    expect(apply).not.toContain('jsonb_set');
  });

  it('writes only rows the rules actually changed', () => {
    expect(apply).toContain('t.after_txt is distinct from t.before_txt');
  });

  it('counts the reached state positively', () => {
    expect(verify).toContain('IF v_fixed < 100 THEN');
  });

  it('asserts no ungrammatical residue was introduced', () => {
    expect(verify).toContain("description ~ '\\ma and\\M'");
    expect(verify).toContain('ungrammatical description');
    // The CONDITION, not just the needle — neutering it to `IF false` left the
    // regex and the message in place and the first draft stayed green.
    expect(verify).toContain('IF v_broken > 0 THEN');
  });

  it('asserts the deliberately-skipped shapes SURVIVE, so the sweep cannot over-reach', () => {
    expect(verify).toContain("description ~* '\\ma vibrant and [aeiou]'");
    expect(verify).toContain("description ~* '\\mand vibrant \\w'");
    expect(verify).toContain('the sweep over-reached');
    expect(verify).toContain('IF v_skipped = 0 THEN');
  });
});
