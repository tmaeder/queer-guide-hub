/**
 * Guards 99991790497084_glossary_toilet_role_and_scat_merge.sql — the two items
 * the piss-play and fisting passes deferred.
 *
 * Assertions run over COMMENT-STRIPPED source and are SCOPED to the statement
 * they are about. The header quotes every defect verbatim and the verify block
 * greps for the same strings, so a file-wide `toContain` matches twice and passes
 * with either occurrence removed.
 *
 * Header claims are asserted against joined `prose`, because the header wraps
 * almost every sentence across two `--` lines and a single-line `toContain` reads
 * a wrapped claim as a missing one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790497084_glossary_toilet_role_and_scat_merge';
const DIR = join(process.cwd(), 'supabase/migrations');

function source(): string {
  const file = readdirSync(DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, file), 'utf8');
}

const raw = source();
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const statements = sql.split('do $verify$')[0];
const verify = sql.slice(sql.indexOf('do $verify$'));

const prose = raw
  .split('\n')
  .filter((l) => /^\s*--/.test(l))
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/**
 * Top-level UPDATE statements on unified_tags, located by the statement keyword
 * rather than a character window: the prose contains semicolons of its own, and
 * a fixed window reaches forward into the next statement.
 */
const tagUpdates = statements
  .split(/^update unified_tags set/m)
  .slice(1)
  .map(
    (c) =>
      c.split(
        /^(?:update unified_tags set|update tag_relations|update tag_category_assignments|insert into|delete from|do \$)/m,
      )[0],
  );

describe('toilet/scat pass — toilet is the kink role', () => {
  it('repairs the summary and body, guarded on the sweep output', () => {
    const t = tagUpdates.find((u) => u.includes("short_description = 'Sanitary hardware"));
    expect(t, 'no prose update for toilet').toBeTruthy();
    expect(t).toContain("slug = 'toilet' and status = 'active'");
    expect(t).toMatch(/receptacle within a negotiated dynamic/);
    expect(t).toMatch(/bare role noun/);
  });

  it('never writes description — the evidence the repair rests on', () => {
    for (const u of tagUpdates) expect(u).not.toMatch(/^\s*description\s*=/m);
  });

  it('clears the QID AND the cached wikipedia_url together', () => {
    // Nulling the identifier alone is the Kowloon mistake: the cached title
    // regenerates the plumbing prose on the next enrichment pass.
    const id = tagUpdates.find((u) => u.includes('wikidata_id = null'));
    expect(id, 'no identifier update').toBeTruthy();
    expect(id).toContain('wikipedia_url = null');
    expect(id).toContain("wikidata_id = 'Q7857'");
    // Never repointed to another entity.
    expect(statements).not.toMatch(/wikidata_id\s*=\s*'Q(?!7857)\d/);
  });

  it('deletes the thirteen plumbing aliases, scoped to toilet', () => {
    const del = statements.slice(statements.indexOf('delete from tag_aliases'));
    expect(del).toContain("t.slug = 'toilet'");
    for (const a of [
      'toilette',
      'klosett',
      'retirade',
      'closett',
      'rtchen',
      'lokus',
      'wc',
      'klo',
      'abort',
      'stilles-rtchen',
      'toilettes',
      'cabinets',
      'inodoro',
    ])
      expect(del).toContain(`'${a}'`);
  });

  it('tombstones the Wikidata-derived relations rather than deleting them', () => {
    // A rejected row is the tombstone the unique key uses to stop the verifier
    // re-proposing the same edge; a delete lets it come straight back.
    const rel = statements.slice(statements.search(/update tag_relations(?![\w])/));
    expect(rel).toContain("review_status = 'rejected'");
    expect(rel).toContain("r.review_status = 'auto'");
    expect(rel).toContain("r.relation_type = 'broader'");
    // Both directions: urinal -> toilet AND toilet -> amenities.
    expect(rel).toContain('r.target_tag_id');
    expect(rel).toContain('r.source_tag_id');
    expect(statements).not.toMatch(/delete from tag_relations/);
  });
});

describe('toilet/scat pass — the one real glossary duplicate', () => {
  it('merges scat into scat-play, keeping the row that holds the prose', () => {
    expect(statements).toContain('merge_tag_concept');
    expect(statements).toMatch(
      /v_keep, v_keep_cat\s*\n?\s*from unified_tags where slug = 'scat-play'/,
    );
    expect(statements).toMatch(/v_drop\s*\n?\s*from unified_tags where slug = 'scat'/);
    // Soft on preconditions.
    expect(statements).toContain('if v_keep is not null and v_drop is not null then');
  });

  it('demotes the loser primary BEFORE the merge — the 23505 trap', () => {
    // The two rows sit in different categories, so merge_tag_concept REPOINTS
    // the junction instead of deleting it, and two is_primary rows on one tag
    // violate tag_category_assignments_one_primary_per_tag.
    const demote = statements.indexOf('update tag_category_assignments a set is_primary = false');
    const merge = statements.indexOf('merge_tag_concept');
    expect(demote).toBeGreaterThan(-1);
    expect(demote).toBeLessThan(merge);
    expect(statements.slice(demote, merge)).toContain("slug = 'scat' and status = 'active'");
  });

  it('drops the inherited membership after, leaving one category', () => {
    const after = statements.slice(statements.indexOf('merge_tag_concept'));
    expect(after).toContain('delete from tag_category_assignments');
    expect(after).toContain('a.category_id is distinct from v_keep_cat');
    expect(verify).toMatch(/if v_cats <> 1 then/);
  });
});

describe('toilet/scat pass — postconditions', () => {
  it('is soft on preconditions', () => {
    expect(verify).toMatch(/if v_scope < 3 then/);
    expect(verify).toContain('refusing to report success');
  });

  it('states the reached state positively, not just the defect gone', () => {
    // "The plumbing prose is gone" is satisfied by a row that vanished.
    expect(verify).toMatch(/if v_role <> 1 then/);
    expect(verify).toMatch(/if v_ident <> 1 then/);
    expect(verify).toMatch(/if v_merged <> 1 then/);
  });

  it('requires the merge target to be ACTIVE', () => {
    expect(verify).toMatch(/k\.slug = 'scat-play' and k\.status = 'active'/);
    expect(verify).toMatch(/d\.status = 'merged'/);
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/description is not null\s+and\s+short_description is not null/);
  });

  it('makes all six facet refusals enforceable, counted per claim', () => {
    // A count(*) over an OR counts ROWS; 99991790451897's two dry runs both
    // failed on exactly that, so each refusal gets its own filter.
    for (const s of ['mat-latex', 'latex', 'anal', 'lube', 'lubricant', 'sextoy'])
      expect(verify).toMatch(
        new RegExp(
          `count\\(\\*\\) filter \\(where slug = '${s}'\\s+and status = 'active' and merged_into_id is null\\)`,
        ),
      );
    expect(verify).toMatch(/if v_refusals <> 6 then/);
  });

  it('PROVES the scope: description moves nowhere, identifiers only on toilet', () => {
    expect(sql).toContain('create temporary table _tsm_before');
    expect(verify).toContain('t.description is distinct from b.description');
    for (const col of ['short_description', 'long_description', 'wikidata_id', 'wikipedia_url'])
      expect(verify).toMatch(
        new RegExp(`t\\.${col}\\s+is distinct from b\\.${col}\\s+and b\\.slug <> 'toilet'`),
      );
    expect(verify).toMatch(/if v_collat <> 0 then/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_\w+\s+int\s*:=/);
    const reads = (verify.match(/from unified_tags/g) ?? []).length;
    expect(reads).toBeGreaterThanOrEqual(6);
  });
});

describe('toilet/scat pass — the reasoning is recorded', () => {
  it('names the audit trail as what settled the toilet sense', () => {
    expect(prose).toContain('2026-04-27 17:30:53');
    expect(prose).toContain('2026-04-27 19:00:48');
    expect(prose).toMatch(/ninety minutes LATER/);
    expect(prose).toContain('tag_change_log');
    // The earlier deferral is corrected, not quietly reversed.
    expect(prose).toMatch(/was over-cautious/);
  });

  it('records `toy` as the model for the role treatment', () => {
    expect(prose).toContain('Plaything');
    expect(prose).toMatch(/objectification role/);
  });

  it('records the measured reason for each facet refusal', () => {
    // mat- is a real namespace, not a duplicate — the most convincing pair.
    expect(prose).toContain('22-member material-facet namespace');
    expect(prose).toContain('mat-silicone 791');
    // anal is a facet, same shape as hiv-aids.
    expect(prose).toContain('872 of 872 marketplace_listing');
    expect(prose).toContain('hiv-aids');
    // lube family.
    expect(prose).toContain('241 marketplace_listing');
    // sextoy/sex-toy do not share an entity type.
    expect(prose).toMatch(/do not even share an entity type/);
  });

  it('states the general finding a later pass needs', () => {
    expect(prose).toMatch(/Check entity_type before proposing a merge/);
  });

  it('records what it left alone and why', () => {
    // tag_sources rows citing Q7857 stay: is_public = false, render nowhere.
    expect(prose).toContain('is_public = false');
    // sextoy's empty prose and sex-toy's missing category are noted, not fixed.
    expect(prose).toMatch(/ALL\s+THREE prose fields empty/);
  });
});
