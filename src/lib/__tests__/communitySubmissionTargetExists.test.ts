import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99800101100000_community_submission_reconcile_target_exists.sql.
 *
 * 99000101100000 approved a submission from its staging row's terminal
 * disposition and copied target_record_id into promoted_to_id, without ever
 * asking whether that record still exists. A staging row is immutable; the
 * record it created can be deleted, archived or merged away afterwards — which
 * dedup on this platform does routinely — so a submitter could be told "your
 * submission is live" about a page that 404s.
 *
 * Verified on prod in a rolled-back transaction with a POSITIVE CONTROL, because
 * the plain dry run proved nothing: on live data the gate is never reached
 * (would_approve=0, invalid_target=0). Against three synthetic rows the old
 * selector picked 3 INCLUDING the dead target; the new one picks 1 and excludes
 * it, with invalid_target=1 and unknown_target_table=1 reported separately.
 *
 * Assertions run against COMMENT-STRIPPED sql. The header states the rule
 * verbatim, so a `toContain` over the raw file is satisfied by the prose with
 * the statement deleted.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

function latestMigration(needle: string): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && readFileSync(join(MIGRATIONS, f), 'utf8').includes(needle))
    .sort()
    .pop();
  if (!file) throw new Error(`no migration contains ${needle}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Drop `--` line comments so header prose cannot satisfy an assertion. */
function statementsOf(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const raw = latestMigration('community_submission_target_exists');
const sql = statementsOf(raw);

/** Body of the helper, between CREATE FUNCTION and its ALTER. */
const helperBody = (() => {
  const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.community_submission_target_exists');
  const j = sql.indexOf('ALTER FUNCTION public.community_submission_target_exists', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

/** Body of the reconciler, between its CREATE and its ALTER. */
const fnBody = (() => {
  const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.run_community_submission_reconcile');
  const j = sql.indexOf('ALTER FUNCTION public.run_community_submission_reconcile', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

/** The verify block. */
const verifyBlock = (() => {
  const i = sql.indexOf('DO $verify$');
  expect(i).toBeGreaterThan(-1);
  return sql.slice(i);
})();

describe('target_exists helper — three answers, not two', () => {
  it('returns NULL for an unknown table, never false', () => {
    // THE DEFECT THIS FILE EXISTS TO PREVENT IN ITS OWN CODE. `ELSE false` says
    // "the target does not exist" about a table the CASE simply does not know —
    // absence of evidence recorded as evidence of absence. Measured on prod:
    // unknown table -> NULL, null id -> NULL, known table with no row -> false,
    // known table with a live row -> true. All four distinct.
    expect(helperBody).toMatch(/ELSE\s+RETURN NULL;/);
    expect(helperBody).not.toMatch(/ELSE\s+(RETURN\s+)?false/i);
  });

  it('returns NULL for a null id rather than treating it as deleted', () => {
    expect(helperBody).toMatch(/IF p_id IS NULL OR p_table IS NULL THEN\s*\n?\s*RETURN NULL;/);
  });

  it('covers all five tables source-community-submissions can target', () => {
    // 7 content types collapse onto these 5 (venue/hotel/place -> venues, etc).
    // A missing branch returns NULL and strands the row rather than approving it,
    // which is fail-safe — but it is still a gap, and the count makes it visible.
    for (const t of [
      'events',
      'venues',
      'marketplace_listings',
      'news_articles',
      'personalities',
    ]) {
      expect(helperBody).toContain(`WHEN '${t}' THEN`);
    }
  });

  it('is the ONLY place the target-table vocabulary lives', () => {
    // The draft this replaces inlined the same five-branch CASE at three sites.
    // Three copies of a vocabulary is a drift surface: add a sixth table, miss
    // one copy, and rows silently strand exactly where the branch was added.
    // Every other site must call the helper instead of re-listing the tables.
    const inlineEventsChecks =
      sql.match(/WHEN 'events' THEN EXISTS \(\s*SELECT 1 FROM public\.events/g) ?? [];
    expect(inlineEventsChecks).toHaveLength(0);
    const helperCalls = sql.match(/public\.community_submission_target_exists\(/g) ?? [];
    expect(helperCalls.length).toBeGreaterThanOrEqual(6);
  });

  it('is service_role only', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.community_submission_target_exists\(text, uuid\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.community_submission_target_exists\(text, uuid\) TO (authenticated|anon)/,
    );
  });
});

describe('reconciler — a publish requires a target that still exists', () => {
  it('gates published dispositions on IS TRUE, not on truthiness', () => {
    // `IS TRUE` and not `= true` / `AND s.target_exists`: NULL means "cannot
    // check", and a bare boolean test would let a NULL fall to the same side as
    // false in some rewrites. IS TRUE makes the three-valued logic explicit.
    expect(fnBody).toMatch(
      /s\.disposition IN \('committed', 'inserted', 'updated'\)\s*\n?\s*AND s\.target_exists IS TRUE/,
    );
  });

  it('still lets a rejection through without a target check', () => {
    // A rejected row never published anything, so it has no target to verify.
    // Requiring one would strand every rejection — 41 of the original 55.
    expect(fnBody).toMatch(/s\.disposition = 'rejected'\s*\n?\s*OR/);
  });

  it('prefers a VALID publish when a submission was staged more than once', () => {
    // A re-stage leaves several rows. Ordering by created_at alone would let a
    // later rejection, or a publish whose record was since deleted, mask a live
    // publish. The ordering key is "published AND still exists".
    expect(fnBody).toMatch(
      /ORDER BY \(st\.disposition NOT IN \('rejected', 'pending'\)[\s\S]{0,200}?IS TRUE\) DESC/,
    );
  });

  it('separates a DELETED target from an UNCHECKABLE one', () => {
    // Conflating them hides a vocabulary gap behind a data fact. invalid_target
    // keys on IS FALSE (the record is genuinely gone); unknown_target_table on
    // IS NULL (this function cannot check that table).
    expect(fnBody).toMatch(/v_invalid_target[\s\S]{0,600}?IS FALSE\)/);
    expect(fnBody).toMatch(/v_unknown_target_tbl[\s\S]{0,600}?IS NULL\)/);
    expect(fnBody).toMatch(/'invalid_target',\s*v_invalid_target/);
    expect(fnBody).toMatch(/'unknown_target_table',\s*v_unknown_target_tbl/);
  });

  it('leaves a dangling-target row at processing rather than guessing', () => {
    // Not approved (nothing to link to) and not rejected (it WAS published).
    // Neither label is true, so it stays unlabelled and counted — the same call
    // 99000101100000 made for the rows with no surviving staging row.
    const updates = sql.match(/UPDATE public\.community_submissions/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(fnBody).not.toMatch(/status = 'rejected'\s*,?\s*\n?[^\n]*invalid/i);
  });

  it('keeps every report key from the shipped version', () => {
    // A key that disappears reads as zero to the health script, which is the
    // exact shape being removed here.
    for (const k of ['approved', 'rejected', 'unresolved', 'unhandled']) {
      expect(fnBody).toMatch(new RegExp(`'${k}',\\s*v_`));
    }
  });

  it('keeps the partial-index predicate at every staging lookup', () => {
    // ix_ingestion_staging_submission_id is PARTIAL on `raw_data ? '_submission_id'`.
    // Postgres cannot prove `->>'k' = <text>` implies `? 'k'`, so a lookup missing
    // the `?` test loses the index and seq-scans 228k rows.
    const lookups = sql.match(/raw_data->>'_submission_id' = cs\.id::text/g) ?? [];
    expect(lookups.length).toBeGreaterThanOrEqual(4);
    const guarded =
      sql.match(/raw_data \? '_submission_id'\s*\n?\s*AND st\.raw_data->>'_submission_id'/g) ?? [];
    expect(guarded).toHaveLength(lookups.length);
  });
});

describe('postconditions', () => {
  it('asserts the premise it was written on, rather than assuming it', () => {
    // Measured at 0 approved-with-dangling-target before writing. If that is ever
    // non-zero the prevention shipped too late and a repair — which this file
    // deliberately does not contain — is actually needed. Failing loudly is the
    // point: silently repairing something never measured is the worse outcome.
    expect(verifyBlock).toMatch(/v_dangling/);
    expect(verifyBlock).toMatch(/status = 'approved'/);
    expect(verifyBlock).toMatch(/IF v_dangling <> 0 THEN/);
    expect(verifyBlock).toMatch(/RAISE EXCEPTION/);
  });

  it('exercises the helper truth table, including the NULL answers', () => {
    // A helper returning false for an unknown table passes every structural test
    // above and silently strands rows. Only calling it proves the difference.
    expect(verifyBlock).toMatch(/'not_a_table'[\s\S]{0,200}?IS NOT NULL THEN/);
    expect(verifyBlock).toMatch(/community_submission_target_exists\('events', NULL\)/);
    expect(verifyBlock).toMatch(/IS DISTINCT FROM false THEN/);
  });

  it('proves the reconciler still runs and still reports every key', () => {
    expect(verifyBlock).toMatch(/v_probe := public\.run_community_submission_reconcile\(1\)/);
    expect(verifyBlock).toMatch(/v_probe \? 'invalid_target'/);
    expect(verifyBlock).toMatch(/v_probe \? 'unknown_target_table'/);
  });

  it('does not write any data', () => {
    // Prevention only. The one UPDATE in this file is the reconciler's own, and
    // the probe call is bounded to a single row.
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bINSERT INTO public\.community_submissions\b/i);
  });
});
