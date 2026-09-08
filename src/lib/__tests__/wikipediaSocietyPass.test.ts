import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the second wave of the glossary comparison: the raveitsafe interaction
 * rows, and the Wikipedia LGBTQ-and-society/health/disability pass.
 *
 * Three migrations, three different things that can go wrong.
 *
 *   20360101101500  adds five substance pairs. The whole value of this table is
 *                   that a claim is attributed to whoever made it, so the source
 *                   name must be the artifact that was actually read — and it
 *                   must NOT arm the staleness gate, because a PDF has no
 *                   refresher and would be permanently late.
 *
 *   20360101101600  revives 14 rows a sweep culled. It must not rewrite their
 *                   prose (that is the banned LLM rewrite) and must not publish
 *                   them. Its loop variable is `rec` for a reason recorded below.
 *
 *   20360101101700  creates 20 terms. Same unpublished contract as every other
 *                   term-creation migration in this repo.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const MIX = '20360101101500_raveitsafe_dangerous_mixtures.sql';
const REVIVE = '20360101101600_wikipedia_lgbtq_society_revivals.sql';
const TERMS = '20360101101700_wikipedia_lgbtq_society_new_terms.sql';
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');

/**
 * The file with every `--` comment line removed.
 *
 * Load-bearing. These migrations carry long headers that restate what the SQL
 * does, so an assertion run against the raw file can be satisfied by the PROSE
 * while the guard it describes has been deleted. Mutation testing caught exactly
 * that: removing the alias-shadow guard's message left the header sentence
 * standing and the test still passed. Anything asserting that executable SQL
 * exists must go through here.
 */
const code = (f: string) =>
  read(f)
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

describe('raveitsafe interaction rows', () => {
  const sql = read(MIX);

  it('attributes the artifact that was read, never the CombiChecker', () => {
    // combi-checker.ch is a different tool by a different organisation and was
    // unreachable; nothing here came from it. Naming it would be a false
    // attribution, and substance_interaction_matrix() credits sources computed
    // from the cells it returns, so the lie would reach the page footer.
    expect(code(MIX)).toMatch(/'rave it safe'/);
    expect(code(MIX)).toMatch(/raveitsafe_Gefahrliche-Mischungen\.pdf/);
    expect(code(MIX)).not.toMatch(/combi-?checker/i);
  });

  it('writes the pair in canonical order rather than as authored', () => {
    // substance_interactions_canonical_order CHECKs tag_a_id < tag_b_id. Writing
    // the columns in the order the rows are listed aborts on roughly half of
    // them, depending on how the uuids happen to sort.
    expect(code(MIX)).toMatch(/least\(v_a, v_b\), greatest\(v_a, v_b\)/);
  });

  it('refuses to touch a pair another source already established', () => {
    expect(code(MIX)).toMatch(/already exist from another source/);
  });

  it('does not arm the staleness gate for a source with no refresher', () => {
    // §9 of check-pipeline-health.mjs derives its watched set from
    // ingestion_sources.target_table. A PDF cannot be refreshed, so a row there
    // would make this source permanently late — which is why eve&rave and FDA
    // have none either.
    expect(code(MIX)).not.toMatch(/insert\s+into\s+public\.ingestion_sources/i);
    expect(code(MIX)).toMatch(
      /from public\.ingestion_sources\s*\n?\s*where target_table = 'substance_interactions'/,
    );
    expect(code(MIX)).toMatch(/v_bad <> 1/);
  });

  it('uses only the seven allowed status values', () => {
    const allowed = new Set([
      'dangerous',
      'unsafe',
      'caution',
      'low_risk_decrease',
      'low_risk_no_synergy',
      'low_risk_synergy',
      'unknown',
    ]);
    const block = sql.slice(sql.indexOf('insert into _pair'), sql.indexOf('guards'));
    // the status is the third literal of each row tuple
    const used = [...block.matchAll(/^\s{4}\('[^']+',\s*'[^']+',\s*'([a-z_]+)'/gm)].map(
      (m) => m[1],
    );
    expect(used.length).toBe(5);
    for (const s of used) expect(allowed.has(s)).toBe(true);
  });
});

describe('society revivals', () => {
  const sql = read(REVIVE);

  it('does not rewrite the prose it revives', () => {
    // The bodies predate this migration and no human has read them. Rewriting
    // them here would be the LLM prose rewrite the repo banned after the judge
    // measured ~19% precision; the correct move is to revive unreviewed.
    const update = sql.slice(sql.indexOf('for rec in'), sql.indexOf('end loop;'));
    expect(update).not.toMatch(/long_description\s*=/);
    expect(update).not.toMatch(/\bdescription\s*=/);
  });

  it('revives unpublished with the tombstone fully cleared', () => {
    const update = sql.slice(sql.indexOf('for rec in'), sql.indexOf('end loop;'));
    expect(update).toMatch(/status\s*=\s*'active'/);
    expect(update).toMatch(/deprecated_at\s*=\s*null/);
    expect(update).toMatch(/deprecation_reason\s*=\s*null/);
    expect(update).toMatch(/seo_indexable\s*=\s*false/);
    expect(update).toMatch(/human_reviewed\s*=\s*false/);
    expect(update).toMatch(/verification_status\s*=\s*'unverified'/);
  });

  it('names its loop variable `rec`, not `r`', () => {
    // The guards alias the temp table as `_revive r`, and PL/pgSQL resolves a
    // qualified name to a DECLAREd variable before a table alias. A variable
    // named `r` makes every guard read an unassigned record and the migration
    // dies with 55000 "record \"r\" is not assigned yet" — which is exactly what
    // the first dry run did.
    expect(sql).toMatch(/^\s*rec\s+record;/m);
    expect(sql).not.toMatch(/^\s*r\s+record;/m);
    expect(sql).toMatch(/for rec in select \* from _revive/);
  });

  it('refuses a slug that is held as an alias of another tag', () => {
    // Two rows answering to one name. This is not hypothetical: it removed
    // `pinkwashing` (a live alias of rainbow-washing, so never a gap) and
    // `queer-theory` from the list.
    expect(code(REVIVE)).toMatch(
      /from _revive r\s*\n\s*where exists \(select 1 from public\.tag_aliases a where a\.alias_slug = r\.slug\)/,
    );
    expect(code(REVIVE)).toMatch(/raise exception[^\n]*held as an alias/);
  });

  it('repairs only the trauma summary line, not its body or identity', () => {
    const repair = sql.slice(sql.indexOf('repair: trauma'), sql.indexOf('assertions'));
    expect(repair).toMatch(/short_description\s*=/);
    expect(repair).not.toMatch(/long_description\s*=/);
    expect(repair).not.toMatch(/wikidata_id\s*=/);
  });

  it('asserts the exact revival count', () => {
    expect(sql).toMatch(/if v_n <> 15 then/);
  });
});

describe('society new terms', () => {
  const sql = read(TERMS);

  it('creates every row unpublished', () => {
    expect(sql).toMatch(/'active', false, false, 'unverified'/);
    expect(sql).toMatch(/are publishable — they must be created unreviewed and unindexed/);
  });

  it('aborts on any pre-existing slug in any status', () => {
    expect(code(TERMS)).toMatch(/raise exception[^\n]*already exist — resolve by hand/);
    expect(code(TERMS)).toMatch(
      /from _new n\s*\n\s*where exists \(select 1 from public\.tag_aliases a where a\.alias_slug = n\.slug\)/,
    );
  });

  it('asserts the exact creation count', () => {
    expect(sql).toMatch(/if v_made <> 20 then/);
  });

  it('records provenance and a category for every row', () => {
    expect(sql).toMatch(/editorial:general-knowledge/);
    expect(sql).toMatch(/lack a category or a provenance record/);
  });
});

describe('paragraph encoding across the whole pass', () => {
  // `\n` in a plain single-quoted PostgreSQL literal is a literal backslash-n,
  // not a newline, and renders the escape sequence to the reader. Measured on
  // prod: 0 active bodies contain one.
  for (const f of [MIX, REVIVE, TERMS]) {
    it(`${f} contains no literal backslash-n escape`, () => {
      expect(read(f)).not.toMatch(/\\n/);
    });
  }

  it('the new-terms bodies carry real paragraph breaks', () => {
    expect(read(TERMS)).toMatch(/[a-z.,;:)"]\n\n[A-Z]/);
  });
});
