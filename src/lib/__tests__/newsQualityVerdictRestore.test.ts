import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 88 `ingestion_staging` news rows carried `quality_status='passed'` while
 * `auto_publish_blocked_reasons` was non-empty. `evaluatePublishGate` returns
 * 'passed' only when that list is EMPTY, and `apply_enrichment` is the only
 * function in the database that can write `enriched_data` — so the value arrived
 * from outside the pipeline, flipped the commit gate open, and published 87
 * off-topic PubMed/Nature abstracts as LGBTQ+ news.
 *
 * What this file pins is everything about the repair that a later reader could
 * plausibly "simplify" into a different, wrong shape:
 *
 *   1. The cohort is derived from `enrichment_audit`, not guessed. The gate's
 *      verdict is recoverable only from there.
 *   2. Content columns are NEVER written. The text was correct — commit reads
 *      `normalized_data`, not the empty `quality_decision` — and overwritten
 *      prose is not recoverable while a verdict is.
 *   3. Deindexing is asserted, not assumed. `trg_news_enforce_seo_indexable`
 *      does it; if that trigger is ever dropped, the migration must fail rather
 *      than leave rejected articles live.
 *   4. Soft on preconditions, hard on postconditions. An exact-count premise
 *      aborts on a correct tree and blocks every migration queued behind it.
 *   5. The sentinel is STAGING-ONLY and SECURITY INVOKER. On `news_articles` the
 *      same shape is a legitimate human batch-approve override on 5,930 rows; and
 *      a DEFINER counter over `ingestion_staging` is the reflex that leaked
 *      safety-gated events to anon once already.
 *   6. The sentinel carries positive controls. Zero rows scanned and a clean
 *      corpus both return zero for the invariants.
 *
 * Text checks against the repo, not the database, so this runs in CI without
 * credentials — same pattern as `newsNonImageUrlSeal.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATION = join(
  ROOT,
  'supabase',
  'migrations',
  '41000101100000_news_quality_verdict_restore.sql',
);
const HEALTH = join(ROOT, 'scripts', 'check-pipeline-health.mjs');

/**
 * The migration's header restates most of the phrases these assertions look
 * for, so a guard could be deleted from the SQL and still be "found" in prose.
 * Every SQL assertion runs against comment-stripped text.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function stripJsComments(js: string): string {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
}

const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
const health = stripJsComments(readFileSync(HEALTH, 'utf8'));

/** The DO block only — so a phrase in the sentinel cannot satisfy a repair assertion. */
const repair = sql.slice(sql.indexOf('DO $restore$'), sql.indexOf('END $restore$'));
/** The sentinel function body only. */
const sentinel = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.news_quality_verdict_signals'),
);

describe('verdict restore', () => {
  it('derives the cohort from enrichment_audit, taking the LAST quality-enhance write', () => {
    expect(repair).toMatch(/DISTINCT ON \(a\.staging_id\)/);
    expect(repair).toMatch(/a\.stage\s*=\s*'quality-enhance'/);
    // ORDER BY … created_at DESC is what makes DISTINCT ON the latest verdict
    // rather than an arbitrary one.
    expect(repair).toMatch(/ORDER BY a\.staging_id,\s*a\.created_at DESC/);
  });

  it('only restores rows the gate judged rejected or review', () => {
    expect(repair).toMatch(/gate_verdict IN \('rejected',\s*'review'\)/);
  });

  /**
   * Two PRs in flight break the unscoped form, and one of them would make this
   * migration abort and block `db push` for the whole repo:
   *
   *   #3667 (40500101100000, applies FIRST) retracts an empty-extraction verdict
   *   by deleting `quality_status`, leaving the audit row — so
   *   `current IS DISTINCT FROM audited` is true for a row correctly awaiting
   *   re-judge.
   *
   *   #3664 (45000101100000) stamps a deterministic 'passed' for curated podcast
   *   shows under `quality_pipeline_version='podcast-deterministic.v1'`. Chained
   *   after #3667 — which leaves `auto_publish_blocked_reasons` standing — that
   *   row trips BOTH invariants while being entirely legitimate.
   *
   * Both scopings must therefore survive in the cohort AND the postcondition:
   * without the version test the cohort would "restore" a deterministic verdict
   * back to rejected, silently undoing someone else's work.
   */
  const GATE_VERSION = /'news-quality\.2026\.04\.27\.0'/;

  it('scopes the cohort to rows that carry a verdict AND claim the gate issued it', () => {
    const cohort = repair.slice(
      repair.indexOf('CREATE TEMP TABLE'),
      repair.indexOf('SELECT count(*) INTO v_cohort'),
    );
    expect(cohort).toMatch(/s\.enriched_data \? 'quality_status'/);
    expect(cohort).toMatch(GATE_VERSION);
  });

  it('scopes the postcondition the same way, or it aborts on #3667 retractions', () => {
    const post = repair.slice(
      repair.indexOf('SELECT count(*) INTO v_left'),
      repair.indexOf('IF v_left > 0'),
    );
    expect(post).toMatch(/s\.enriched_data \? 'quality_status'/);
    expect(post).toMatch(GATE_VERSION);
  });

  it('never writes a content column', () => {
    // Scoped to the news_articles UPDATE: the repair must move the verdict and
    // nothing a reader sees. `content` also appears as a substring of other
    // identifiers, so each is anchored as an assignment target.
    const articleUpdate = repair.slice(repair.indexOf('UPDATE public.news_articles'));
    for (const col of ['title', 'content', 'excerpt', 'image_url', 'slug']) {
      expect(articleUpdate).not.toMatch(new RegExp(`\\b${col}\\s*=`));
    }
  });

  it('preserves the overwritten values on both surfaces', () => {
    expect(repair).toMatch(/'quality_verdict_restored'/);
    expect(repair).toMatch(/'overwritten_value'/);
    expect(repair).toMatch(/'verdict_restore'/);
    expect(repair).toMatch(/'prev_quality_status'/);
    expect(repair).toMatch(/'prev_seo_indexable'/);
  });

  it('re-enqueues a real re-judge, not a dry run, and skips rows already queued', () => {
    const insert = repair.slice(repair.indexOf('INSERT INTO public.quality_backfill_jobs'));
    expect(insert).toMatch(/'pending',\s*'backfill',\s*false/);
    expect(insert).toMatch(/NOT EXISTS/);
    expect(insert).toMatch(/j\.status IN \('pending',\s*'running'\)/);
  });

  it('is soft on preconditions — a re-run is a no-op, never an abort', () => {
    // No RAISE EXCEPTION may fire before any work is attempted; the only
    // exceptions in this file are the two postconditions below.
    const beforeWork = repair.slice(0, repair.indexOf('UPDATE public.ingestion_staging'));
    expect(beforeWork).not.toMatch(/RAISE EXCEPTION/);
    expect(repair).toMatch(/IF v_cohort > 0 THEN/);
  });

  it('asserts no staging row still disagrees with its audited verdict', () => {
    const post = repair.slice(repair.indexOf('SELECT count(*) INTO v_left'));
    expect(post).toMatch(/IS DISTINCT FROM g\.gate_verdict/);
    expect(post).toMatch(/IF v_left > 0 THEN[\s\S]{0,200}?RAISE EXCEPTION/);
  });

  it('asserts the deindex actually happened rather than trusting the trigger', () => {
    const post = repair.slice(repair.indexOf('SELECT count(*) INTO v_indexable'));
    expect(post).toMatch(/a\.seo_indexable IS TRUE/);
    expect(post).toMatch(/IF v_indexable > 0 THEN[\s\S]{0,200}?RAISE EXCEPTION/);
  });
});

describe('news_quality_verdict_signals', () => {
  it('is staging-only — it must never count news_articles', () => {
    expect(sentinel).toMatch(/FROM public\.ingestion_staging/);
    expect(sentinel).toMatch(/s\.target_table\s*=\s*'news_articles'/);
    // On news_articles, passed + blocked reasons is a legitimate human
    // batch-approve override on 5,930 rows. Counting it would make this sentinel
    // fire on correct data forever.
    expect(sentinel).not.toMatch(/FROM public\.news_articles/);
  });

  it('reports positive controls alongside the invariants', () => {
    expect(sentinel).toMatch(/'rows_scanned'/);
    expect(sentinel).toMatch(/'with_gate_audit'/);
  });

  it('exposes both zero-invariants', () => {
    expect(sentinel).toMatch(/'verdict_overwritten',\s*count\(\*\) FILTER/);
    expect(sentinel).toMatch(/'passed_with_blocked_reasons',\s*count\(\*\) FILTER/);
  });

  it('scopes BOTH invariants to rows claiming the gate version', () => {
    // A declared deterministic verdict (#3664) is not an out-of-band flip. Each
    // FILTER is sliced separately so one carrying `claims_gate` cannot satisfy
    // the assertion for the other.
    const overwritten = sentinel.slice(
      sentinel.indexOf("'verdict_overwritten'"),
      sentinel.indexOf("'passed_with_blocked_reasons'"),
    );
    const passed = sentinel.slice(
      sentinel.indexOf("'passed_with_blocked_reasons'"),
      sentinel.indexOf("'unverifiable_no_audit'"),
    );
    expect(overwritten).toMatch(/claims_gate/);
    expect(passed).toMatch(/claims_gate/);
    expect(sentinel).toMatch(/'news-quality\.2026\.04\.27\.0'\)\s*AS claims_gate/);
  });

  it('excludes rows whose verdict was retracted for re-judge', () => {
    // #3667 deletes `quality_status` so the row re-enters quality-enhance. That
    // is work in progress, not a contradiction.
    expect(sentinel).toMatch(/AND s\.enriched_data \? 'quality_status'/);
  });

  it('reports how many rows the invariants actually apply to', () => {
    // Without this, bumping the gate version scopes both invariants to the empty
    // set and they report a clean zero forever.
    expect(sentinel).toMatch(/'claiming_gate',\s*count\(\*\) FILTER \(WHERE claims_gate\)/);
  });

  it('separates unverifiable rows from clean ones', () => {
    // Retention cascades at 90 days, so a row can outlive its audit. That is
    // absence of evidence and must not be counted as agreement.
    expect(sentinel).toMatch(/'unverifiable_no_audit'/);
  });

  it('is SECURITY INVOKER and reachable only by service_role', () => {
    expect(sentinel).not.toMatch(/SECURITY DEFINER/);
    expect(sentinel).toMatch(
      /REVOKE ALL ON FUNCTION public\.news_quality_verdict_signals\(\) FROM anon/,
    );
    expect(sentinel).toMatch(
      /REVOKE ALL ON FUNCTION public\.news_quality_verdict_signals\(\) FROM authenticated/,
    );
    expect(sentinel).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.news_quality_verdict_signals\(\) TO service_role/,
    );
  });
});

describe('check-pipeline-health wiring', () => {
  const section = health.slice(health.indexOf('news_quality_verdict_signals'));

  it('calls the sentinel', () => {
    expect(health).toMatch(/rpc\/news_quality_verdict_signals/);
  });

  it('reports a failed probe instead of falling through to a clean zero', () => {
    const probe = section.slice(0, section.indexOf('} else {'));
    expect(probe).toMatch(/if \(!res\.ok\)/);
    expect(probe).toMatch(/measured NOTHING/);
  });

  it('hard-fails on each invariant', () => {
    const overwritten = section.slice(section.indexOf('const overwritten'));
    expect(overwritten).toMatch(/if \(overwritten > 0\)[\s\S]{0,600}?FAILED = true/);
    const contradictory = section.slice(section.indexOf('const contradictory'));
    expect(contradictory).toMatch(/if \(contradictory > 0\)[\s\S]{0,600}?FAILED = true/);
  });

  it('hard-fails when the check would be vacuous', () => {
    const controls = section.slice(
      section.indexOf('const scanned'),
      section.indexOf('const overwritten'),
    );
    expect(controls).toMatch(/scanned === 0[\s\S]{0,400}?FAILED = true/);
    expect(controls).toMatch(/withAudit === 0[\s\S]{0,400}?FAILED = true/);
    // Both invariants are scoped to rows claiming the gate version; if nothing
    // claims it, they are scoped to nothing and report a clean zero forever.
    expect(controls).toMatch(/claiming_gate[\s\S]{0,400}?FAILED = true/);
  });
});
