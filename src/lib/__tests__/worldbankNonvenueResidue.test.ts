import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * World Bank data products mis-ingested as venues — the residue of the 2026-06-08 pass.
 *
 * `20260608140001_archive_worldbank_dataset_nonvenues.sql` archived this cohort by
 * `data_source='unknown' AND (website ilike '%worldbank.org%' OR description ilike
 * '%world bank%')`. The rows that carry neither a worldbank.org website nor the literal
 * phrase survived it — "GDP ranking", "Doing Business", "Enterprise Surveys",
 * "Wage Bill and Pay Compression". A predicate keyed on a producer's self-identification
 * misses every row that fails to identify itself.
 *
 * Measured on prod 2026-10-03: the World Bank data-topic taxonomy in
 * `venue_sources.payload->'raw'->>'tags'` returns 75 rows — 54 already archived and
 * 21 still live. A description regex sees only 4 of those 21.
 *
 * This file guards the SHAPE of the disposition, not the count of rows in the database.
 * Every assertion runs against comment-stripped SQL: the migration's header quotes its own
 * predicates and row names verbatim, so a whole-file `toMatch` would pass with the
 * load-bearing statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
// A REFERENCE, not a citation: the test locates the migration by this string, so a renumber
// must move it too. `next-migration-version.mjs --renumber` reports a bare version like this
// as a citation and skips it — correct for prose, wrong here. Renumbered twice as main's
// ceiling overtook the original: 99991791043227 -> 99991791096760 -> 99991791105427.
const VERSION = '99991791105427';
const FILENAME = `${VERSION}_archive_worldbank_dataset_nonvenues_residue.sql`;

function raw(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.startsWith(VERSION));
  expect(files, `no migration found at version ${VERSION}`).toContain(FILENAME);
  return readFileSync(join(MIGRATIONS, FILENAME), 'utf8');
}

/**
 * Strip `--` comments, but ONLY outside a string literal.
 *
 * A bare `line.replace(/--.*$/, '')` was the first version and it was wrong in a way that
 * silenced the suite rather than failing it: the migration's control-C check contains the
 * regex literal `'--[^' || chr(10) || ']*'`, so the naive stripper truncated that statement
 * at the `--` and every assertion scoped to it passed against nothing. Caught by this file's
 * own parity check, which is the only reason it did not ship green.
 *
 * Parity is the test: an odd number of `'` before a `--` means it sits inside a literal. An
 * escaped `''` contributes two and so does not flip it.
 */
function statements(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      let quotes = 0;
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "'") quotes += 1;
        else if (line[i] === '-' && line[i + 1] === '-' && quotes % 2 === 0)
          return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

const SRC = raw();
const SQL = statements(SRC);

const COHORT_IDS = [
  '3b69184a-260d-4713-b537-fa9c87581c4c', // African Cities Diagnostic
  'aa6e3986-a1e5-4169-a743-6be1528a4218', // AidFlows
  '808a1e71-297e-4595-b11b-15853028754a', // Bolivia Agricultural Public Expenditure Review
  '5c4d821b-1333-4861-8887-70b2ab3a39c9', // Business Environment and Enterprise Performance Survey
  '1645f47c-dfcc-402a-8118-0ea70660b888', // Climate Change Data
  '5cd95040-20cf-4390-838f-e8bc7ac67503', // Climate Change Knowledge Portal: Ensemble Projections
  'ecdb6cde-a8d7-4f0c-95bc-27accead755f', // Climate Change Knowledge Portal: Historical Data
  'fa577ade-c5bd-4e4d-b157-fccdaaa59ed9', // Doing Business
  '8fb9d5bb-d785-4cd5-a422-8986a44212b6', // Enterprise Surveys
  '9b230730-c556-4094-811c-91c06364bc99', // GDP ranking
  'ed9de57a-f562-44d2-945f-2688e71a611e', // GDP ranking, PPP based
  'be9fe000-f10e-4e6a-9310-2c5a60e3cf0d', // Open Data for the Horn
  '30d936f6-038c-4ab4-be29-a8db50227b6c', // Rural Access Index (RAI)
  '9d09838c-9bb5-4e6f-b163-5296dae99d5d', // Socio-Economic Database for Latin America and the Caribbean
  'f15b5322-a9a5-4d88-a703-57574a6d4c8a', // The Changing Wealth of Nations
  'ba31c958-7f57-41ba-8c53-1ee738057c66', // Wage Bill and Pay Compression
  'd1f501fb-3d1d-4f50-96ff-edd68d688520', // WDR2013 Occupational Wages around the World
  '83ac2f8f-dfc6-4249-a242-c116647b145e', // WDR2013 Survey on Good Jobs
  '48de26de-5c0b-41ad-ad91-6e2e301ce667', // World Development Report 2011
  '3586c1ac-a9c0-4abe-bff0-eb5758526363', // World Development Report 2013 on Jobs Statistical Tables
  '7454ebce-c73f-477c-9132-ba5e6f8d51a2', // World Development Report 2014
];

describe('the comment stripper itself', () => {
  it('removes the header prose it exists to remove', () => {
    // Positive control: without this, every assertion below could be passing against
    // the header rather than against a statement.
    expect(SRC).toContain('A predicate keyed on a producer');
    expect(SQL).not.toContain('A predicate keyed on a producer');
  });

  it('leaves the statements intact', () => {
    expect(SQL).toMatch(/do\s+\$wb\$/i);
    expect(SQL).toMatch(/end\s+\$wb\$/i);
  });

  it('does not truncate a statement at a double dash inside a string literal', () => {
    // This file DOES contain such a line — control C's `'--[^' || chr(10) || ']*'` — so the
    // premise an earlier version of this test asserted ("every `--` starts a comment") is
    // deliberately false here. A line-based stripper eats the rest of that statement and
    // every assertion scoped to it then passes against nothing, which is a silence rather
    // than a failure. Assert the STRIPPER's behaviour instead of a premise about the corpus.
    const lines = SRC.split('\n');
    const offenders: string[] = [];
    let literalDashLines = 0;
    lines.forEach((line, i) => {
      const at = line.indexOf('--');
      if (at === -1) return;
      const quotesBefore = (line.slice(0, at).match(/'/g) ?? []).length;
      if (quotesBefore % 2 === 0) return; // an ordinary comment; stripping it is correct
      literalDashLines += 1;
      // The `--` is inside a literal, so the stripped output must keep the whole line.
      if (!statements(line).includes('--')) offenders.push(`line ${i + 1}: ${line.trim()}`);
    });
    // Positive control: zero such lines would make the assertion above vacuous.
    expect(
      literalDashLines,
      'no line carries a double dash inside a literal; this test measured nothing',
    ).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('still removes an ordinary trailing comment', () => {
    // The mirror of the test above: a quote-aware stripper that strips nothing would also
    // satisfy "literals survive".
    expect(statements('select 1; -- drop everything')).toBe('select 1; ');
    expect(statements("select '--keep'; -- drop")).toBe("select '--keep'; ");
  });
});

describe('worldbank residue: the frozen cohort', () => {
  it('names all 21 rows a human read, and no others', () => {
    for (const id of COHORT_IDS) {
      expect(SQL, `cohort id ${id} missing from the migration`).toContain(id);
    }
    const found = SQL.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    expect(new Set(found)).toEqual(new Set(COHORT_IDS));
  });

  it('asserts its own list length, so a dropped entry fails loudly', () => {
    expect(SQL).toMatch(/v_expected\s+integer\s*:=\s*21/i);
    expect(SQL).toMatch(/jsonb_array_length\(v_rows\)\s*<>\s*v_expected/i);
  });
});

describe('worldbank residue: reversible archival, one implementation', () => {
  it('archives through decide_venue_nonvenue rather than restating its UPDATE', () => {
    expect(SQL).toMatch(/public\.decide_venue_nonvenue\(/i);
    // The RPC writes the restore snapshot in exactly the shape
    // restore_venue_from_nonvenue() reads. A hand-rolled UPDATE would archive the row and
    // leave it unrestorable.
    expect(SQL).not.toMatch(
      /update\s+public\.venues\s+set[\s\S]{0,200}review_status\s*=\s*'archived'/i,
    );
  });

  it('never hard-deletes a venue', () => {
    // venues.id has FK dependants and the standing convention is reversible archival.
    expect(SQL).not.toMatch(/delete\s+from\s+public\.venues/i);
  });

  it('skips a row that is already archived instead of re-archiving it', () => {
    // Re-calling the RPC would snapshot review_status='archived'/seo_indexable=false AS the
    // restore target, turning restore_venue_from_nonvenue into a no-op and destroying the
    // only record of the row's pre-archive state.
    const guard = SQL.match(
      /if\s+exists\s*\([\s\S]{0,200}?v\.review_status\s*=\s*'archived'[\s\S]{0,120}?v_already\s*:=\s*v_already\s*\+\s*1/i,
    );
    expect(guard, 'no already-archived skip guard before the RPC call').not.toBeNull();
  });

  it('verifies the row is still the row that was read before overwriting it', () => {
    expect(SQL).toMatch(/v\.name\s*=\s*r\.name/i);
    expect(SQL).toMatch(/v_drifted\s*:=\s*v_drifted\s*\+\s*1/i);
  });
});

describe('worldbank residue: soft on preconditions, hard on the goal', () => {
  it('reports a missing, drifted or already-archived row instead of aborting', () => {
    // db push stops at the first failing file and takes every migration queued behind it,
    // so an exact-match premise here is a repo-wide blast radius, not protection.
    for (const counter of ['v_missing', 'v_drifted', 'v_already']) {
      expect(SQL).toContain(counter);
    }
    expect(SQL).toMatch(/raise\s+notice\s+'worldbank residue: archived=%/i);
  });

  it('distinguishes a failed archive from a skipped one', () => {
    // A failure that reads like a skip is how a half-applied repair reports success.
    expect(SQL).toMatch(/v_failed\s*:=\s*v_failed\s*\+\s*1/i);
    expect(SQL).toMatch(/format\('failed: %s/i);
  });

  it('raises on the state it exists to reach', () => {
    expect(SQL).toMatch(/v_unfinished\s*<>\s*0/i);
    expect(SQL).toMatch(
      /raise\s+exception\s+'worldbank residue: % rows are still the row that was read/i,
    );
  });

  it('scopes the goal to rows that are still the row that was read', () => {
    // A legitimate concurrent rename must be excluded from the work AND from the
    // assertion, or it blocks the merge queue rather than being surfaced.
    const scoped = SQL.match(
      /v_unfinished[\s\S]{0,400}?v\.name\s*=\s*e->>'name'[\s\S]{0,200}?review_status\s+is\s+distinct\s+from\s+'archived'/i,
    );
    expect(scoped, 'the unfinished count is not scoped to unrenamed rows').not.toBeNull();
  });
});

describe('worldbank residue: search eviction', () => {
  it('deletes the stale search document rather than waiting for the drain', () => {
    // trg_search_documents_venue only ENQUEUES into search_reindex_queue; the drain runs on
    // a cron, so without this the postcondition would assert an intention, not a state.
    expect(SQL).toMatch(/delete\s+from\s+public\.search_documents/i);
    expect(SQL).toMatch(/sd\.entity_type\s*=\s*'venue'/i);
  });

  it('scopes the delete to this cohort', () => {
    // Other archived venues are not this migration's to touch.
    const scoped = SQL.match(
      /delete\s+from\s+public\.search_documents[\s\S]{0,400}?v\.id\s*=\s*any\(v_ids\)/i,
    );
    expect(scoped, 'the search delete is not scoped to the cohort ids').not.toBeNull();
  });

  it('asserts the eviction stays self-maintaining', () => {
    // If a later CREATE OR REPLACE drops the archived predicate from the indexer, the drain
    // puts all 21 straight back and the DELETE degrades into a cosmetic one-off.
    expect(SQL).toMatch(/search_documents_index_venues/i);
    expect(SQL).toMatch(/review_status is distinct from ''archived''/i);
    expect(SQL).toMatch(
      /raise\s+exception\s+'worldbank residue: search_documents_index_venues no longer excludes/i,
    );
  });

  it('strips comments before asserting on pg_get_functiondef', () => {
    // pg_get_functiondef() returns the body INCLUDING its comments, and this is a PRESENCE
    // check — the direction that fails SILENTLY. Unstripped, a comment added to the indexer
    // mentioning the archived predicate makes this control pass while the predicate itself
    // is gone and all 21 rows are back in search. Enforced repo-wide by
    // scripts/check-functiondef-asserts.mjs after three `db push` aborts on main in one day;
    // asserted here too so the fix cannot be quietly undone in this file.
    const call = SQL.match(
      /position\([\s\S]{0,240}?pg_get_functiondef\(p\.oid\)[\s\S]{0,80}?\)\)/i,
    );
    expect(call, 'no pg_get_functiondef presence check found').not.toBeNull();
    expect(call![0]).toMatch(/regexp_replace\(\s*pg_get_functiondef\(p\.oid\)/i);
  });
});

describe('worldbank residue: postconditions have positive controls', () => {
  it('proves the frozen ids resolve before trusting any zero', () => {
    // Without this, a typo'd uuid matches nothing and every count below passes vacuously.
    expect(SQL).toMatch(/v_present\s*<\s*1/i);
    expect(SQL).toMatch(
      /raise\s+exception\s+'worldbank residue: the frozen id list resolves to no venues at all/i,
    );
  });

  it('proves the search probe sees a populated venue index', () => {
    // "0 of ours in search_documents" also passes against an empty table or a broken join.
    expect(SQL).toMatch(/v_control_docs\s*<\s*10000/i);
    expect(SQL).toMatch(
      /raise\s+exception\s+'worldbank residue: venue search index reads only % documents/i,
    );
  });

  it('asserts the end state the brief asked for', () => {
    expect(SQL).toMatch(/v_indexable\s*<>\s*0/i);
    expect(SQL).toMatch(/v_in_search\s*<>\s*0/i);
  });

  it('asserts reversibility rather than assuming it', () => {
    // Archiving instead of deleting is only worth anything if the restore snapshot is there.
    expect(SQL).toMatch(/'nonvenue_candidate'->'archived'\s*\?\s*'review_status'/i);
    expect(SQL).toMatch(/v_restorable\s*<>\s*v_now_archived/i);
  });

  it('refuses to report success when nothing happened', () => {
    expect(SQL).toMatch(/v_now_archived\s*<\s*1/i);
    expect(SQL).toMatch(
      /raise\s+exception\s+'worldbank residue: no row in the cohort is archived/i,
    );
  });
});

describe('worldbank residue: the migration parses', () => {
  it('uses a string literal in every RAISE format position', () => {
    // `raise exception 'a' || 'b'` is a 42601 that no test executing logic can reach and
    // that scripts/check-migration-sql.mjs cannot see inside a plpgsql body — the outer
    // grammar treats $wb$...$wb$ as one opaque literal. It nearly shipped here.
    const lines = SQL.split('\n');
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/\braise\s+(exception|notice)\b/i.test(line)) return;
      // The format string runs to the first unescaped comma or the end of the statement;
      // a `||` before that comma is concatenation in the format position.
      const after = line.replace(/^.*?\braise\s+(?:exception|notice)\s*/i, '');
      const upToComma = after.split(/',/)[0];
      if (upToComma.includes('||')) offenders.push(`line ${i + 1}: ${line.trim()}`);
      // A format string broken across lines and continued with `||` is the same defect.
      const next = lines[i + 1] ?? '';
      if (!/,\s*$/.test(line) && /^\s*\|\|/.test(next)) {
        offenders.push(`line ${i + 1} continues with ||: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it('records the batch key so the disposition is traceable', () => {
    expect(SQL).toMatch(/worldbank-open-data-residue-2026-10-03/);
  });
});
