/**
 * Guards 99991791316555 — news and marketplace staging approvals now publish.
 *
 * A human approve in the staging inbox wrote `review_status='approved'` and
 * nothing else; publishing is a separate hourly drain cron per entity family,
 * and news and marketplace had none. 4,248 news rows and 5,924 marketplace rows
 * sat eligible and unpublished, 360 and 5,915 of them approved by a human,
 * oldest 2026-05-12.
 *
 * ASSERTIONS RUN OVER COMMENT-STRIPPED SQL. The header quotes every phrase
 * being asserted — including the old job-scoped function name, both rules and
 * the marketplace blockers — so an unstripped `toContain` passes against a
 * file whose executable statements have been deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791316555_news_marketplace_commit_drains.sql';
const DIR = join(process.cwd(), 'supabase', 'migrations');

const raw = readFileSync(join(DIR, MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

/**
 * The news batch body only.
 *
 * Ends at `comment on function`, NOT at the `grant` — the COMMENT's own string
 * literal explains the defect and therefore contains `p_job_id` and
 * `news_commit_staging_batch`. A `--` stripper does not remove it because it
 * is a string, so a slice that reached the grant would make the two negative
 * assertions below fail against correct code. A statement that quotes its own
 * defect breaks negative assertions in both directions; scope to the half of
 * the file the claim is about.
 */
const newsFn = sql.slice(
  sql.indexOf('create or replace function public.commit_news_staging_batch'),
  sql.indexOf('comment on function public.commit_news_staging_batch'),
);

describe('the file is what it claims', () => {
  it('exists exactly once', () => {
    expect(readdirSync(DIR).filter((f) => f.startsWith('99991791316555_'))).toEqual([MIGRATION]);
  });

  it('strips to a non-trivial body — control for every negative below', () => {
    expect(sql.length).toBeGreaterThan(2000);
    expect(newsFn.length).toBeGreaterThan(800);
  });
});

describe('the news drain is a backlog drain, not a DAG-run drain', () => {
  it('is named commit_news_staging_batch and takes only a limit', () => {
    // `news_commit_staging_batch` already exists, LOOKS like a drain, and is
    // scoped `WHERE job_id = p_job_id` — one DAG run, never revisited.
    expect(sql).toContain('function public.commit_news_staging_batch(p_limit integer default 50)');
    expect(newsFn).not.toContain('p_job_id');
    expect(newsFn).not.toContain('job_id =');
  });

  it('matches the family selector the other four drains use', () => {
    expect(newsFn).toContain("target_table = 'news_articles'");
    expect(newsFn).toContain("disposition in ('pending','approved')");
    expect(newsFn).toContain("ai_validation_status = 'approved'");
    expect(newsFn).toContain("review_status in ('auto','approved')");
    expect(newsFn).toContain('for update skip locked');
  });

  it('keeps the per-row exception arm so one bad row cannot abort the batch', () => {
    expect(newsFn).toContain('exception when others then');
    expect(newsFn).toContain("'commit_fn: '");
    expect(newsFn).toContain('ingestion_events');
  });
});

describe('RULE 1 — nothing without a passing verdict is crawler-visible', () => {
  // `news_articles.seo_indexable` DEFAULTS TO TRUE and the item function never
  // sets it. Measured: 0 of the 4,248 eligible rows carry quality_status
  // 'passed' (review 1,938, no verdict 1,248, rejected 1,062), so the naive
  // drain publishes 3,186 unjudged articles to crawlers.
  it('deindexes a committed row that is not passed', () => {
    expect(newsFn).toMatch(/set seo_indexable = false/);
    expect(newsFn).toMatch(/coalesce\(quality_status, ''\) <> 'passed'/);
  });

  it('only ever withholds — it never sets seo_indexable true', () => {
    expect(newsFn).not.toMatch(/seo_indexable\s*=\s*true/);
  });

  it('is scoped to INSERTED rows, so it cannot touch an existing article', () => {
    // An `updated` here would mean the selector and the item function disagree
    // about what exists — in which case flipping seo_indexable on somebody
    // else's live article is the last thing to do.
    expect(newsFn).toMatch(/res\.action = 'inserted'/);
    expect(newsFn).not.toMatch(/res\.action in \('inserted','updated'\)/);
  });

  it('guards on `and seo_indexable` so it writes only when it changes something', () => {
    expect(newsFn).toMatch(/and seo_indexable;/);
  });
});

describe('RULE 2 — a stale staging verdict can never downgrade a live article', () => {
  // commit_news_staging_item's UPDATE arm does
  // `quality_status = coalesce(v_quality_status, quality_status)`, so a months-old
  // 'review'/'rejected' overwrites a live 'passed'. Measured: 427 live indexable
  // articles sit in exactly that overlap (307 review + 120 rejected).
  it('excludes any row whose article already exists, by fingerprint AND by url', () => {
    const notExists = newsFn.match(/not exists \(/g) ?? [];
    expect(notExists.length).toBe(2);
    expect(newsFn).toContain('news_compute_fingerprint');
    expect(newsFn).toMatch(/a\.url = nullif\(btrim\(coalesce\(s\.normalized_data->>'url'/);
  });

  it('is a SELECTOR, not a post-hoc restore', () => {
    // A first draft snapshotted the live verdict afterwards and inferred "this
    // was passed" from seo_indexable being true — circular, since that flag is
    // what rule 1 writes. Not selecting the row cannot be circular.
    expect(newsFn).not.toMatch(/set quality_status = 'passed'/);
    expect(newsFn).not.toMatch(/v_prev_q|v_prev_idx/);
  });

  it('matches the item function keys in the same order (fingerprint, then url)', () => {
    expect(newsFn.indexOf('news_compute_fingerprint')).toBeLessThan(
      newsFn.indexOf("a.url = nullif(btrim(coalesce(s.normalized_data->>'url'"),
    );
  });

  it('carries no short-circuit that would disable the guard in place', () => {
    // Found by mutation: `where false and a.fingerprint = ...` keeps both
    // `not exists (` and the `news_compute_fingerprint` call present — so the
    // structural assertions above all still pass — while the guard matches
    // nothing and every one of the 1,367 overlapping rows becomes eligible
    // again. Asserting presence is not asserting effect.
    expect(newsFn).not.toMatch(/\bwhere\s+false\b/i);
    expect(newsFn).not.toMatch(/\band\s+false\b/i);
    expect(newsFn).not.toMatch(/\bor\s+true\b/i);
    // And each arm must still start by constraining the article, not by a
    // constant: `where a.<col> =` immediately after the sub-select.
    const arms = newsFn.match(/select 1 from public\.news_articles a\s*\n\s*where a\./g) ?? [];
    expect(arms.length).toBe(2);
  });
});

describe('both drains are scheduled AND registered', () => {
  it('schedules both crons', () => {
    expect(sql).toContain("cron.schedule('news-drain-commit', '56 * * * *'");
    expect(sql).toContain("cron.schedule('mp-drain-commit', '58 * * * *'");
  });

  it('unschedules first, guarded, so a re-run does not raise', () => {
    // cron.unschedule(text) raises when the job is absent.
    const n = sql.match(/perform cron\.unschedule\('[a-z-]+'\)\s*\n\s*where exists/g) ?? [];
    expect(n.length).toBe(2);
  });

  it('registers both in admin_automations with the live row shape', () => {
    // Copied from the live `city_drain_commit` row, not invented: `name` is the
    // JOBNAME (the reconciler matches on it), `trigger` is NOT NULL with no
    // default, and `action` carries a `jobname` key beside the command.
    expect(sql).toContain("'news_drain_commit', 'news-drain-commit'");
    expect(sql).toContain("'mp_drain_commit', 'mp-drain-commit'");
    expect(sql).toMatch(/jsonb_build_object\('type','schedule'\)/);
    expect(sql).toMatch(/'type','cron','jobname','news-drain-commit','command'/);
    expect(sql).toMatch(/'type','cron','jobname','mp-drain-commit','command'/);
  });

  it('reuses the existing marketplace batch rather than writing a second one', () => {
    expect(sql).toContain('public.commit_marketplace_staging_batch(100)');
    expect(sql).not.toMatch(/create or replace function public\.commit_marketplace_staging_batch/);
  });
});

describe('the marketplace relevance gate is NOT relaxed', () => {
  // The marketplace drain commits 0 today: 4,683 of 5,924 rows have no
  // classification_result and all 1,241 that do are merge_candidate. The cheap
  // way to make it publish something is to drop that gate, which commits
  // listings the LGBTQ+ classifier has never seen.
  it('asserts commit_marketplace_staging_batch still requires classification_result', () => {
    expect(sql).toContain("position('classification_result IS NOT NULL' in p.prosrc)");
    expect(sql).toContain('P5 failed');
  });

  it('does not alter that function at all', () => {
    expect(sql).not.toMatch(/alter function public\.commit_marketplace_staging_batch/i);
  });
});

describe('the sentinel makes a zero attributable', () => {
  const fn = sql.slice(sql.indexOf('function public.staging_commit_drain_signals'));

  it('reports targets_watched FIRST', () => {
    // Zero stranded rows over an empty watch list reads identically to a
    // drained pipeline.
    // Scoped to the jsonb_build_object: the `watched` CTE's own VALUES rows
    // ('venues','vn-drain-commit') match the same pattern and come first in
    // the file, so an unscoped match reports the CTE's first table name.
    const obj = fn.slice(fn.indexOf('select jsonb_build_object('));
    const keys = [...obj.matchAll(/'([a-z_]+)',/g)].map((m) => m[1]);
    expect(keys[0]).toBe('targets_watched');
  });

  it('names both marketplace blockers, so "committed 0" can be explained', () => {
    expect(fn).toContain('marketplace_blocked_unclassified');
    expect(fn).toContain('marketplace_blocked_merge_candidate');
  });

  it('watches all six staging targets and reports which lack a drain', () => {
    for (const t of [
      'venues',
      'events',
      'cities',
      'personalities',
      'news_articles',
      'marketplace_listings',
    ]) {
      expect(fn).toContain(`'${t}'`);
    }
    expect(fn).toContain('missing_drains');
  });

  it('counts the oldest HUMAN-approved row, not the oldest row', () => {
    // A machine row ageing is throughput; a human decision ageing is a
    // discarded decision.
    expect(fn).toMatch(/filter \(where s\.review_status = 'approved'\)/);
  });

  it('is service_role only', () => {
    // A SECURITY DEFINER aggregate granted to `authenticated` is granted to
    // every member.
    expect(sql).toMatch(
      /revoke all on function public\.staging_commit_drain_signals\(\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.staging_commit_drain_signals\(\) to service_role/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.staging_commit_drain_signals\(\)[^;]*authenticated/,
    );
  });
});

describe('postconditions assert the reached state', () => {
  const verify = sql.slice(sql.indexOf('do $verify$'));

  it('exists and raises on every check', () => {
    expect(verify.length).toBeGreaterThan(500);
    expect((verify.match(/raise exception 'P\d/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it('asserts the news function is not job-scoped', () => {
    expect(verify).toMatch(/like '%p_job_id%'/);
    expect(verify).toContain('P1 failed');
  });

  it('asserts both crons active and both registry rows enabled', () => {
    expect(verify).toMatch(/jobname = 'news-drain-commit' and active/);
    expect(verify).toMatch(/jobname = 'mp-drain-commit' and active/);
    expect(verify).toMatch(/slug in \('news_drain_commit','mp_drain_commit'\) and enabled\) <> 2/);
  });

  it('asserts NO watched target is left without a drain', () => {
    // The assertion the whole migration exists to make true.
    expect(verify).toMatch(/jsonb_array_length\(v_missing\) <> 0/);
  });

  it('asserts anon and authenticated cannot read the sentinel', () => {
    expect(verify).toMatch(/has_function_privilege\('anon'/);
    expect(verify).toMatch(/has_function_privilege\('authenticated'/);
  });

  it('carries no short-circuit', () => {
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/\bif\s+false\s+then\b/i);
  });
});
