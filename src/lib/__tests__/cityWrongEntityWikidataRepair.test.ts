import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the pair that repairs eleven cities publishing another place's encyclopedia
// article, and the sentinel that watches for the repair being undone.
//
// Dry-run on prod in a rolled-back transaction before merge: both verify blocks
// passed, 11 rows cleared, 5 mayors, 11 descriptions preserved, 11 identifiers
// released, controls intact. The repair's verify block was mutation-tested 5/5
// against live data, and the sentinel was behaviourally tested by re-introducing a
// wikipedia_title, a retracted description and a refuted qid -- all three
// invariants fired.
//
// THE FINDING THIS FILE EXISTS TO PROTECT: clearing `wikidata_qid` alone does not
// stop the wrong article. `city-factual-backfill/index.ts:451` reads the cached
// `wikipedia_title` and refetches the article BY THAT TITLE independently of the
// QID, and description fill is fill-if-empty, so a repair that leaves the title
// standing is rewritten by the next nightly pass. 20261102100000 cleared QIDs only
// (it had no wrong titles to deal with); this pair clears both.

const REPAIR = '99991790358713_city_wrong_entity_wikidata_repair.sql';
const SIGNALS = '99991790359075_city_wikidata_signals.sql';

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8');

// Every assertion runs against comment-stripped SQL. Both headers name the rows,
// the excluded rows and the mechanism in prose, so a whole-file `toContain` would be
// satisfiable by the comments with the statement deleted.
const strip = (raw: string) =>
  raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const repairRaw = read(REPAIR);
const signalsRaw = read(SIGNALS);
const repair = strip(repairRaw);
const signals = strip(signalsRaw);

// Statements only. Each verify block echoes the slugs and the identifiers, so a
// whole-file match passes with the real UPDATE gone.
const repairStmt = repair.split('do $verify$')[0];
const repairVerify = repair.slice(repair.indexOf('do $verify$'));
const signalsVerify = signals.slice(signals.indexOf('do $verify$'));
const signalsFn = signals.slice(0, signals.indexOf('do $verify$'));

// Scoped slices. Every predicate in this function also appears in the `v_examples`
// subquery, so a whole-function `toMatch` is satisfied by that copy while the real
// counter is gutted — the vacuous-assertion class this repo has shipped repeatedly.
// Mutation testing caught exactly that here: dropping the scope from the
// `v_title_back` query left the test green because the examples query still had it.
const stmtInto = (name: string) => {
  const i = signalsFn.indexOf(`into ${name}`);
  if (i < 0) return '';
  const end = signalsFn.indexOf(';', i);
  return signalsFn.slice(signalsFn.lastIndexOf('select', i), end);
};
const titleBackStmt = stmtInto('v_title_back');
const qidRegressedStmt = stmtInto('v_qid_regressed');

const REPAIRED = [
  'frisco-us-xyxtu',
  'par-gb-n8jw1',
  'pittsburg-us-8m9nd',
  'saint-peters-gb-y5sot',
  'kos-gr-9jvjc',
  'city-of-troy',
  'arabkir',
  'ganda',
  'guara',
  'n-yf',
  'oetz',
] as const;

describe('the city wrong-entity repair', () => {
  it('clears every one of the eleven hand-verified rows', () => {
    for (const slug of REPAIRED) expect(repairStmt).toContain(`'${slug}'`);
    // Exactly eleven target rows, so a widened sweep fails here as well as in the
    // migration's own count.
    const rows = repairStmt.match(/^\s{4}\('[a-z0-9-]+',\s+'Q\d+',/gm) ?? [];
    expect(rows).toHaveLength(11);
  });

  it('clears wikipedia_title, not only the identifier', () => {
    // The whole novel finding. Without this the repair silently undoes itself on
    // the next nightly backfill pass.
    expect(repairStmt).toMatch(/wikipedia_title\s*=\s*null/);
    expect(repairStmt).toMatch(/wikidata_qid\s*=\s*null/);
    expect(repairStmt).toMatch(/description\s*=\s*null/);
  });

  it('preserves the prior value rather than only deleting it', () => {
    // Retraction that does not record what it removed is destruction.
    expect(repairStmt).toContain("'retracted_value', t.qid");
    expect(repairStmt).toMatch(/'from',\s*to_jsonb\(c\.description\)/);
    expect(repairStmt).toMatch(/'from',\s*to_jsonb\(c\.mayor\)/);
  });

  it('reuses the provenance key the earlier city repair established', () => {
    // 20261102100000 put this under field_provenance.wikidata_qid.retracted_value.
    // Inventing a second key means one query no longer finds every such repair,
    // and the sentinel reads this exact path.
    expect(repairStmt).toContain("'wikidata_qid'");
    expect(repairStmt).toContain("'retracted_value'");
    expect(signalsFn).toContain("'wikidata_qid'->>'retracted_value'");
  });

  it('builds provenance with || and never jsonb_set create_missing', () => {
    // jsonb_set(..., create_missing => true) creates only the LAST path element, so
    // on a row with no `description` key it writes nothing and the retraction is
    // lost silently. 21050101100000 lost a whole retraction to exactly this.
    expect(repairStmt).not.toMatch(/jsonb_set/);
    expect(repairStmt).toMatch(/coalesce\(c\.field_provenance,\s*'\{\}'::jsonb\)\s*\n?\s*\|\|/);
  });

  it('does not touch population', () => {
    // Repair only the wrong FIELDS. Checked per row on prod: Frisco 154,407, Kos
    // 19,244, Par 9,462 and Pittsburg 69,424 are each that row's OWN population;
    // the wrong value was a provenance candidate that fill-if-empty never applied.
    expect(repairStmt).not.toMatch(/population\s*=\s*null/);
  });

  it('is soft on preconditions so a concurrent repair cannot abort db push', () => {
    // A row a sibling session already fixed must be SKIPPED, not raised on. A hard
    // precondition here aborts `db push` for the whole repo and takes every queued
    // migration with it.
    expect(repairStmt).toMatch(/c\.wikidata_qid is not distinct from t\.qid/);
    expect(repairStmt).not.toMatch(/get diagnostics/);
  });

  it('excludes the two rows whose own coordinates are the broken half', () => {
    // Burj Hammoud sits at longitude exactly 0.000000 and its QID is CORRECT;
    // Quebec-Ouest's coordinates are ~170 km from Quebec City. Distance alone
    // cannot tell a wrong identifier from wrong coordinates, which is why this
    // repairs 11 and not the 167 the sweep flagged.
    expect(repairStmt).not.toMatch(/\('burj-hammoud',/);
    expect(repairStmt).not.toMatch(/\('qu-bec-ouest-canada',/);
    // And the exclusion is asserted at run time, not merely by omission.
    expect(repairVerify).toContain("slug = 'burj-hammoud'");
    expect(repairVerify).toContain("'Q895235'");
  });

  it('asserts the reached state positively, never a count of bad rows', () => {
    // Counting rows in a BAD state returns zero for a slug that has gone missing
    // from the corpus entirely -- the vacuous shape this repo has shipped before.
    expect(repairVerify).toMatch(/v_repaired\s*<>\s*11/);
    expect(repairVerify).toMatch(/v_preserved\s*<>\s*11/);
    expect(repairVerify).toMatch(/v_mayors\s*<>\s*5/);
  });

  it('keeps the two controls that a blanket null-everything sweep would break', () => {
    expect(repairVerify).toMatch(/v_control_pop\s*<>\s*1/);
    expect(repairVerify).toMatch(/v_burj\s*<>\s*1/);
  });

  it('asserts the identifiers are released so the real cities can adopt them', () => {
    // uq_cities_wikidata_qid is partial on duplicate_of_id IS NULL, so a junk row
    // holding Q62 blocks San Francisco (668 venues / 3,829 events) forever.
    expect(repairVerify).toMatch(/v_released\s*<>\s*0/);
  });

  it('has no statement_timeout, which is a no-op under db push', () => {
    expect(repair).not.toMatch(/set\s+local\s+statement_timeout/i);
  });
});

describe('the city wikidata sentinel', () => {
  it('watches all three ways the repair can be undone', () => {
    for (const key of ['qid_regressed', 'wrong_title_back', 'retracted_desc_back']) {
      expect(signalsFn).toContain(`'${key}'`);
    }
  });

  it('detects the cached title coming back independently of the identifier', () => {
    // The identifier coming back and the TITLE coming back are separate failures.
    // `suspension` kept serving an account-ban definition for ten days after its id
    // was cleared, which is why the tag work needed two sentinels.
    expect(signalsFn).toContain("'retracted_wikipedia_title'");
    expect(signalsFn).toMatch(/wikipedia_title is not null/);
  });

  it('scopes the title check to retractions that recorded a title', () => {
    // 20261102100000's two rows had no wrong title to clear. Without this scope
    // they would make the invariant fire forever and it would be re-baselined away.
    // Asserted against the v_title_back STATEMENT, not the whole function: the same
    // predicate appears in the examples subquery and satisfied a whole-file match
    // with this counter gutted.
    expect(titleBackStmt).not.toBe('');
    expect(titleBackStmt).toMatch(
      /field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null/,
    );
    expect(titleBackStmt).toMatch(/wikipedia_title is not null/);
  });

  it('keys the qid regression on the row’s OWN refuted value', () => {
    // Comparing against any refuted value anywhere would fire whenever one city
    // legitimately adopts an id another row was cleared of.
    expect(qidRegressedStmt).not.toBe('');
    expect(qidRegressedStmt).toMatch(
      /wikidata_qid\s*=\s*field_provenance->'wikidata_qid'->>'retracted_value'/,
    );
  });

  it('reports probe_ok and the corpus size separately from the counts', () => {
    // An empty table, a revoked grant and a clean corpus all return the same
    // reassuring zeroes.
    expect(signalsFn).toContain("'probe_ok', true");
    expect(signalsFn).toContain("'rows_with_qid'");
    expect(signalsVerify).toMatch(/probe_ok/);
  });

  it('carries two positive controls, so the invariants cannot watch an empty set', () => {
    expect(signalsVerify).toMatch(/rows_with_qid'\)::int\s*<\s*1000/);
    expect(signalsVerify).toMatch(/dispositioned'\)::int\s*<\s*11/);
  });

  it('gates the three invariants at zero on the day it ships', () => {
    // Introduced already-red is introduced already-ignored.
    expect(signalsVerify).toMatch(/qid_regressed'\)::int\s*<>\s*0/);
    expect(signalsVerify).toMatch(/wrong_title_back'\)::int\s*<>\s*0/);
    expect(signalsVerify).toMatch(/retracted_desc_back'\)::int\s*<>\s*0/);
  });

  it('never gates on the work-list size', () => {
    // 167 of 2,959 failed the coordinate bound; ~154 still need a human per row.
    // Gating on that ships red on arrival.
    expect(signalsFn).toContain("'coord_unswept'");
    expect(signalsVerify).not.toMatch(/coord_unswept'\)::int\s*(<>|>)\s*\d/);
  });

  it('revokes before granting, so the definer aggregate is not anon-callable', () => {
    // CREATE FUNCTION already granted EXECUTE to PUBLIC; granting to service_role
    // revokes nothing.
    expect(signals).toMatch(/revoke all on function public\.city_wikidata_signals\(\) from public/);
    expect(signals).toMatch(/revoke all on function public\.city_wikidata_signals\(\) from anon/);
    expect(signals).toMatch(
      /revoke all on function public\.city_wikidata_signals\(\) from authenticated/,
    );
    expect(signals).toMatch(
      /grant execute on function public\.city_wikidata_signals\(\) to service_role/,
    );
  });

  it('is security definer with a pinned search_path', () => {
    expect(signalsFn).toMatch(/security definer/);
    expect(signalsFn).toMatch(/set search_path to 'public', 'pg_temp'/);
  });
});

describe('the health script consumes the sentinel', () => {
  const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
  // Scoped to the CITY block. The personality sentinel one section above carries a
  // byte-identical `s.probe_ok !== true`, so a whole-file match is satisfied by that
  // copy with the city check neutered — mutation testing caught exactly that.
  const cityBlock = (() => {
    const i = health.indexOf('rpc/city_wikidata_signals');
    return i < 0 ? '' : health.slice(i, health.indexOf('// 5b.', i));
  })();

  it('calls the RPC and treats a failed probe as broken rather than clean', () => {
    // A sentinel nothing reads is the Village-relink failure: shipped, wired to
    // nothing, dead for months.
    expect(cityBlock).not.toBe('');
    // Anchored on the CONDITION, not on the message text it prints -- a message
    // survives `if (false)`.
    expect(cityBlock).toMatch(/probe_ok\s*!==\s*true/);
    expect(cityBlock).toMatch(/FAILED\s*=\s*true/);
  });

  it('hard-fails the three invariants and only prints the work list', () => {
    for (const key of ['qid_regressed', 'wrong_title_back', 'retracted_desc_back']) {
      expect(cityBlock).toContain(key);
    }
    // Reported, never gated.
    expect(cityBlock).toContain('coord_unswept');
    expect(cityBlock).not.toMatch(/coord_unswept[^\n]*>\s*0/);
  });

  it('carries the corpus-size positive control', () => {
    expect(cityBlock).toMatch(/rows_with_qid\s*\?\?\s*0\)\s*<\s*1000/);
  });
});
