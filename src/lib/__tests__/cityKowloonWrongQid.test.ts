import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99200101100000_city_kowloon_wrong_qid.sql`.
 *
 * The restored `city_qid_gap_link` engine adopted Q1022918 — Kowloon Walled
 * City, demolished 1994, ~2.6 ha inside Kowloon City district — for a row
 * representing Kowloon, the urban area of ~2 million. All three guards pass on
 * it (1.9 km away, P31 "human settlement", the label contains the row's name),
 * so this is the namesake problem INVERTED: a nearby contained entity rather
 * than a distant same-named one.
 *
 * Three things the migration must do and this file exists to hold:
 *   - clear the cached `wikipedia_title` as well as the QID, because
 *     city-factual-backfill fetches Wikipedia BY CACHED TITLE, so clearing the
 *     identifier alone leaves the publishing mechanism intact;
 *   - write NO replacement identifier (Q216651 was recalled as "the correct
 *     Kowloon" and resolved live to Atmel AVR, a microcontroller family);
 *   - keep the correct Kowloon description.
 *
 * Every assertion runs against COMMENT-STRIPPED sql. The header explains the
 * cohort and therefore names the wrong QID, the Walled City and the rejected
 * repoint in prose; asserting over the raw file would let that prose satisfy
 * checks while the statement was gone — the trap `20360101101700` recorded.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '99200101100000_city_kowloon_wrong_qid.sql',
);

const raw = readFileSync(MIGRATION, 'utf8');

/** Strip `--` line comments so prose cannot satisfy a structural assertion. */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** The statements, i.e. everything the file actually executes. */
const statements = sql;

/**
 * The single UPDATE, sliced from `update public.cities` to the first
 * postcondition. NOT to the first `;` — the statement's own detail string
 * contains one, which silently truncated this slice mid-literal and made two
 * assertions read as failures against correct code. The venue-dedup trap
 * (`[^;]*` across a message that itself contains a semicolon), one file later.
 */
const updateStmt = (() => {
  const start = statements.indexOf('update public.cities');
  expect(start).toBeGreaterThan(-1);
  const end = statements.indexOf('select count(*)', start);
  expect(end).toBeGreaterThan(start);
  return statements.slice(start, end);
})();

const CITY_ID = '46fa9926-2131-45ab-965c-4dcbb26034bf';
const WRONG_QID = 'Q1022918';
/** Adopted correctly by the same cron run — the mirror control. */
const KEEP_QIDS = ['Q4970', 'Q58401', 'Q179608'];

describe('99200101100000 — the Kowloon wrong-QID repair', () => {
  it('targets exactly the one row, by id, and content-guards on the wrong QID', () => {
    // The id is a declared constant so every postcondition scopes to the same
    // row; the UPDATE references it rather than repeating the literal.
    expect(statements).toMatch(new RegExp(`v_city_id\\s+constant\\s+uuid\\s*:=\\s*'${CITY_ID}'`));
    expect(updateStmt).toMatch(/where\s+c\.id\s*=\s*v_city_id/);
    // Content guard: a repair by another session leaves this a no-op.
    expect(updateStmt).toMatch(/wikidata_qid\s*=\s*'Q1022918'/);
    // Keyed by id, never by slug or name — the `brisbane` lesson, where a
    // slug-keyed repair would have hit the legitimate Australian row.
    expect(updateStmt).not.toMatch(/where[\s\S]*\bslug\b/i);
  });

  it('clears the cached wikipedia_title as well as the identifier', () => {
    expect(updateStmt).toMatch(/wikidata_qid\s*=\s*null/);
    // The load-bearing half: the title is what city-factual-backfill fetches by.
    expect(updateStmt).toMatch(/wikipedia_title\s*=\s*null/);
  });

  it('writes NO replacement identifier — null, never repoint', () => {
    // Any Q-number other than the wrong one and the three mirror controls
    // would be a guessed identifier.
    const qids = new Set(statements.match(/\bQ\d+\b/g) ?? []);
    for (const q of qids) {
      expect([WRONG_QID, ...KEEP_QIDS]).toContain(q);
    }
    // And the wrong one is only ever read, never assigned.
    expect(updateStmt).not.toMatch(/wikidata_qid\s*=\s*'Q\d+'\s*,/);
  });

  it('stamps the terminal state the selector skips, so it cannot re-adopt', () => {
    // cities_due_for_refresh excludes this in its scope CTE, for EVERY scope.
    expect(updateStmt).toContain('data_unavailable');
    expect(updateStmt).toContain('wikidata_link');
    // The real reason is recorded alongside the mechanism's label.
    expect(updateStmt).toContain('wrong_entity_contained');
    expect(updateStmt).toContain('cleared_qid');
    expect(updateStmt).toContain('cleared_wikipedia_title');
  });

  it('merges enrichment_status with || and preserves prior wikidata_link keys', () => {
    // jsonb_set(create_missing) creates only the LAST path element and would
    // silently write nothing — the trap `21050101100000` recorded.
    expect(updateStmt).not.toContain('jsonb_set');
    expect(updateStmt).toMatch(/coalesce\(c\.enrichment_status->'wikidata_link'/);
  });

  it('never writes description — the correct Kowloon prose must survive', () => {
    expect(updateStmt).not.toMatch(/\bdescription\s*=/);
  });

  it('asserts the correct description survived, in both directions', () => {
    expect(statements).toMatch(/description is null/);
    expect(statements).toMatch(/description ilike '%Walled City%'/);
  });

  it('proves the row left the qid_gap pool, with a positive control', () => {
    expect(statements).toMatch(/cities_due_for_refresh\(1000,\s*'qid_gap'\)/);
    // An empty result set satisfies "the row is absent" while proving nothing.
    expect(statements).toMatch(/v_pool\s*=\s*0/);
  });

  it('asserts the correctly-adopted identifiers were NOT destroyed', () => {
    for (const q of KEEP_QIDS) expect(statements).toContain(q);
    expect(statements).toMatch(/correctly-adopted identifier\(s\) were destroyed/);
  });

  it('has five postconditions and none of them is loosened or short-circuited', () => {
    const conditions = statements.match(/if\s+v_\w+\s*<>\s*0\s+then/g) ?? [];
    expect(conditions).toHaveLength(5);
    // The `60000101160000` trap: neutering `<> 0` to `< 0` leaves every
    // string-anchored assertion green while the check has stopped checking.
    expect(statements).not.toMatch(/if\s+v_\w+\s*<\s*0\s+then/);
    // The `79000101100000` trap: a predicate can be neutered instead of the
    // condition.
    expect(statements).not.toMatch(/\bwhere\s+false\b/i);
    expect(statements).not.toMatch(/\band\s+false\b/i);
    // Every counter starts from a real query rather than being pre-seeded.
    expect(statements).not.toMatch(/v_bad\s+int\s*:=/);
  });

  it('declares the actor so the write is attributed', () => {
    expect(statements).toMatch(/set_config\('app\.actor',\s*'migration:city_kowloon_wrong_qid'/);
  });
});
