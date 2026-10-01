import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION = '99991790880121_news_passed_articles_regain_indexable.sql';
const HEALTH = join(process.cwd(), 'scripts', 'check-pipeline-health.mjs');

/**
 * Assertions run against COMMENT-STRIPPED sql. This migration's header quotes
 * the identifiers, the column names and even the shape of the predicate the
 * guards below look for, so a `toContain` over the raw file passes with the
 * statement deleted — the vacuous-assertion class this repo has recorded
 * repeatedly (`queernessProseRetraction`, `tagProseRoundFive`, and the
 * `mergeCoreReversibility` suite whose first pass had three such assertions).
 */
const statementsOf = (): string =>
  readFileSync(join(MIGRATIONS, MIGRATION), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

/** The apply half only: a `do $verify$` block echoes the strings it checks. */
const applyBlock = (): string => {
  const sql = statementsOf();
  const end = sql.toLowerCase().indexOf('do $verify$');
  expect(end).toBeGreaterThan(0);
  return sql.slice(0, end);
};

const verifyBlock = (): string => {
  const sql = statementsOf();
  const start = sql.toLowerCase().indexOf('do $verify$');
  expect(start).toBeGreaterThan(0);
  return sql.slice(start);
};

/** The trigger function body, which is where both branches have to coexist. */
const triggerFn = (): string => {
  const sql = applyBlock();
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.news_enforce_seo_indexable');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$function$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

/** The one-shot sweep statement, scoped so a sibling statement cannot satisfy it. */
const sweepStatement = (): string => {
  const sql = applyBlock();
  const start = sql.indexOf('UPDATE public.news_articles a');
  expect(start).toBeGreaterThan(0);
  const end = sql.indexOf(';', sql.indexOf("r.after->>'seo_indexable' = 'false'", start));
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

const signalsFn = (): string => {
  const sql = applyBlock();
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.news_index_signals');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$fn$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
};

describe('a news article the gate PASSED regains indexability', () => {
  it('keeps the de-index branch that forces false for review and rejected', () => {
    // This half was always right and is the reason the whole seal exists:
    // 20260714192445 added it after rejected articles leaked into
    // sitemap-news.xml as soft-404s. Losing it while adding the restore would
    // trade one defect for a worse one.
    const fn = triggerFn();
    expect(fn).toMatch(
      /NEW\.quality_status IN \('rejected','review'\)\s+AND NEW\.seo_indexable IS DISTINCT FROM false/i,
    );
    expect(fn).toMatch(/NEW\.seo_indexable\s*:=\s*false/i);
  });

  it('restores on the TRANSITION out of review, not on any passed row', () => {
    // The transition is the entire safety argument. While a row is
    // review/rejected the branch above forces the column false on every write,
    // so in that state it carries no human decision and restoring discards
    // none. A restore keyed on `NEW.quality_status = 'passed'` ALONE would
    // instead re-index every article a human had deliberately de-indexed.
    const fn = triggerFn();
    expect(fn).toMatch(/OLD\.quality_status IN \('rejected','review'\)/i);
    expect(fn).toMatch(/NEW\.quality_status = 'passed'/i);
    expect(fn).toMatch(/TG_OP = 'UPDATE'/i);
    expect(fn).toMatch(/NEW\.seo_indexable\s*:=\s*true/i);
  });

  it('requires zero blockers AND the gate\u2019s own publish verdict before restoring', () => {
    const fn = triggerFn();
    expect(fn).toMatch(
      /coalesce\(array_length\(NEW\.auto_publish_blocked_reasons, ?1\), ?0\) = 0/i,
    );
    expect(fn).toMatch(/NEW\.quality_decision->>'shouldPublish' = 'true'/i);
  });

  it('compares shouldPublish as TEXT, never as a boolean cast', () => {
    // A `::boolean` cast on malformed jsonb raises, and this is a BEFORE
    // trigger on a table every ingest path writes — the raise would not break
    // indexability, it would break every write to news_articles.
    const fn = triggerFn();
    expect(fn).not.toMatch(/quality_decision->>'shouldPublish'\)?::bool/i);
  });

  it('makes the two branches exclusive, so neither can undo the other', () => {
    // Written as IF / ELSIF rather than two independent IFs: with two, a row
    // could in principle satisfy both and the later assignment would win
    // silently depending on statement order.
    expect(triggerFn()).toMatch(/ELSIF TG_OP = 'UPDATE'/i);
  });

  it('preserves the search_path pin the live definition carries', () => {
    // CREATE OR REPLACE drops a SET clause exactly as silently as it drops a
    // branch — 99991789807686 recorded the same hazard for proconfig.
    expect(triggerFn()).toMatch(
      /SET search_path TO 'pg_catalog', 'public', 'extensions', 'auth', 'storage'/i,
    );
  });
});

describe('the one-shot sweep', () => {
  it('excludes any row a human deliberately de-indexed', () => {
    // 12 human writes to seo_indexable exist in content_revisions, 9 of them
    // to false. Zero of them are in this cohort today, but the clause is in the
    // predicate rather than resting on that measurement: content versioning
    // only started 2026-09-14, so "none on record" is an 11-day window.
    const sweep = sweepStatement();
    expect(sweep).toMatch(/NOT EXISTS/i);
    expect(sweep).toMatch(/r\.actor_kind IS DISTINCT FROM 'system'/i);
    expect(sweep).toMatch(/r\.after->>'seo_indexable' = 'false'/i);
  });

  it('probes content_revisions CORRELATED on the candidate row', () => {
    // Not a style point: content_revisions is 3.28M rows / 1.68 GB across 25
    // tables. Uncorrelated this measured 15,138 ms — past the 8 s
    // statement_timeout PostgREST's `authenticator` role pins — and correlated
    // on the ~267 candidates it measures 1,201 ms for identical answers.
    const sweep = sweepStatement();
    expect(sweep).toMatch(/r\.source_id = a\.id/i);
    expect(sweep).toMatch(/r\.source_table = 'news_articles'/i);
  });

  it('writes seo_indexable and nothing else', () => {
    // The verdict, the prose and the blocked reasons are not this file's
    // business; a sweep that touched quality_status would be rewriting the
    // gate's own decision.
    //
    // SCOPED TO THE SET CLAUSE. A `/SET[\s\S]*quality_status\s*=/` ban reaches
    // forward into the WHERE clause, where `a.quality_status = 'passed'` is the
    // legitimate selector — so it failed against correct code on the first run.
    // Same reach-forward defect as tagProseConceptAsCommunity's first draft.
    const sweep = sweepStatement();
    const setStart = sweep.indexOf('SET ');
    const setEnd = sweep.search(/\bWHERE\b/i);
    expect(setStart).toBeGreaterThan(0);
    expect(setEnd).toBeGreaterThan(setStart);
    const setClause = sweep.slice(setStart, setEnd);
    expect(setClause).toMatch(/SET seo_indexable = true/i);
    expect(setClause).not.toMatch(/quality_status/i);
    expect(setClause).not.toMatch(/auto_publish_blocked_reasons/i);
    expect(setClause).not.toMatch(/quality_decision/i);
  });

  it('declares an actor so the sweep is attributable in content_revisions', () => {
    expect(applyBlock()).toMatch(/set_config\('app\.actor', 'migration:99991790880121/i);
  });
});

describe('the postconditions', () => {
  it('counts the REACHED state rather than rows in the bad state', () => {
    // A count of rows in the bad state returns zero for a cohort that has
    // vanished entirely, which the soft human-de-index exclusion can
    // legitimately produce — 50300101100100 recorded that inversion.
    const verify = verifyBlock();
    expect(verify).toMatch(/v_indexable < 20000/i);
    expect(verify).toMatch(/P1b?[\s\S]{0,80}measuring nothing|measuring nothing/i);
  });

  it('asserts the two mirrors an over-reaching sweep would break', () => {
    const verify = verifyBlock();
    // Rejected rows must stay deindexed...
    expect(verify).toMatch(/quality_status = 'rejected' AND seo_indexable = true/i);
    // ...and a passed row WITH a stated blocker is legitimately deindexed.
    expect(verify).toMatch(/coalesce\(array_length\(auto_publish_blocked_reasons, ?1\), ?0\) > 0/i);
  });

  it('asserts the producer ASSIGNS true rather than one phrasing of a condition', () => {
    // 20810101100100 aborted db push repo-wide by asserting a phrasing that a
    // later rewrite preserved; the branch predicate is asserted in this file
    // instead, where a false alarm costs one PR rather than the whole queue.
    const verify = verifyBlock();
    expect(verify).toMatch(/seo_indexable\\s\*:=\\s\*true/);
    expect(verify).not.toMatch(/ELSIF TG_OP/i);
  });

  it('refuses a loosened comparison anywhere in the block', () => {
    // 76000101100000: neutering `<> 0` to `< 0` leaves every string-anchored
    // assertion green while the check has stopped checking.
    const verify = verifyBlock();
    expect(verify).not.toMatch(/v_bad\s*<\s*0/);
    expect(verify).not.toMatch(/v_rejected\s*<\s*0/);
    expect(verify).toMatch(/v_bad <> 0/);
    expect(verify).toMatch(/v_rejected <> 0/);
    // A pre-seeded counter would make a count-based check vacuous.
    expect(verify).not.toMatch(/v_bad\s+bigint\s*:=/i);
    // The short-circuit shape ONLY. A bare /\bfalse\b\s+and\b/ also matches
    // `seo_indexable = false AND ...`, which is the legitimate predicate — it
    // failed against correct code on the first run.
    expect(verify).not.toMatch(/\bWHERE\s+false\b/i);
  });

  it('cross-checks the sentinel against the repair it watches', () => {
    const verify = verifyBlock();
    expect(verify).toMatch(/news_index_signals\(\)->>'deindexed_despite_publish_verdict'/i);
    expect(verify).toMatch(/news_index_signals\(\)->>'trigger_attached'/i);
  });
});

describe('the sentinel', () => {
  it('reports the cohort size and trigger attachment separately from the count', () => {
    // Zero deindexed rows over an empty cohort is vacuous, not clean; and an
    // absent seal and a repaired corpus otherwise give the same zero.
    const fn = signalsFn();
    expect(fn).toMatch(/'passed_unblocked_total'/);
    expect(fn).toMatch(/'passed_unblocked_indexable'/);
    expect(fn).toMatch(/'deindexed_despite_publish_verdict'/);
    expect(fn).toMatch(/'human_deindexed_excluded'/);

    // trigger_attached must be COMPUTED, not a literal. Asserting the key
    // alone SURVIVED mutation: replacing the whole EXISTS subquery with `true`
    // keeps the key, satisfies the migration's own P5 postcondition, and turns
    // the health gate on a missing seal into decoration.
    const at = fn.indexOf("'trigger_attached'");
    expect(at).toBeGreaterThan(0);
    const value = fn.slice(at, at + 400);
    expect(value).toMatch(/EXISTS\s*\(/i);
    expect(value).toMatch(/FROM pg_trigger/i);
    expect(value).toMatch(/tgname = 'trg_news_enforce_seo_indexable'/i);
    expect(value).toMatch(/tgenabled <> 'D'/i);
  });

  it('probes content_revisions correlated, like the sweep', () => {
    const fn = signalsFn();
    expect(fn).toMatch(/r\.source_id = a\.id/i);
    // The deindexed-only pre-filter is what keeps the anti-join on the small side.
    expect(fn).toMatch(/a\.seo_indexable = false/i);
  });

  it('is service_role only', () => {
    // A DEFINER aggregate granted to `authenticated` is granted to every
    // member — review_queue_signals recorded that.
    const apply = applyBlock();
    expect(apply).toMatch(/REVOKE ALL ON FUNCTION public\.news_index_signals\(\) FROM PUBLIC/i);
    expect(apply).toMatch(/REVOKE ALL ON FUNCTION public\.news_index_signals\(\) FROM anon/i);
    expect(apply).toMatch(
      /REVOKE ALL ON FUNCTION public\.news_index_signals\(\) FROM authenticated/i,
    );
    expect(apply).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.news_index_signals\(\) TO service_role/i,
    );
  });
});

describe('the health script reads it', () => {
  const health = (): string => readFileSync(HEALTH, 'utf8');

  it('calls the RPC rather than merely naming it', () => {
    // 99980101100100: a `toContain('<fn name>')` is satisfied by the name
    // appearing in a comment, so an unwired sentinel passes. Anchor on the
    // fetch URL that does the work.
    expect(health()).toContain('/rest/v1/rpc/news_index_signals');
  });

  it('gates on the stranded count, the probe, and the seal', () => {
    const src = health();
    const at = src.indexOf('/rest/v1/rpc/news_index_signals');
    expect(at).toBeGreaterThan(0);
    const section = src.slice(at, at + 2600);
    expect(section).toMatch(/deindexed_despite_publish_verdict/);
    expect(section).toMatch(/trigger_attached !== true/);
    expect(section).toMatch(/probe_ok !== true/);
    // Three separate FAILED assignments: a broken probe, a missing seal and a
    // non-zero count must not collapse into one branch.
    expect((section.match(/FAILED = true/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('fails on an empty cohort instead of reporting it clean', () => {
    const src = health();
    const at = src.indexOf('/rest/v1/rpc/news_index_signals');
    const section = src.slice(at, at + 2600);
    expect(section).toMatch(/passed_unblocked_total[\s\S]{0,40}< 1000/);
  });
});
