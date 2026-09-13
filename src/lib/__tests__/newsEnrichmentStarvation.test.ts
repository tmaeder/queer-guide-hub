import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the podcast deterministic verdict and the enrichment sentinel.
 *
 * The defect: news rows cannot commit without a quality verdict, the verdict
 * stage ran at 480/day against ~4,200/day of inflow, and EVERY existing signal
 * was green — cron on schedule, breakers closed, budget headroom, and a
 * `stale_pending_by_entity` floor of 3,500 that a ~2,300-row backlog sat under
 * for four months. What has to survive is the shape that makes it visible.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

function latest(pattern: RegExp): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => pattern.test(f))
    .sort()
    .pop();
  if (!file) throw new Error(`no migration matching ${pattern}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Comments explain the trap; they must never SATISFY an assertion. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

describe('the podcast deterministic verdict', () => {
  const sql = stripComments(latest(/_podcast_deterministic_verdict\.sql$/));
  // SCOPED to the batch CTE — the selection that decides which rows get a
  // verdict. Every predicate also appears in the `remaining` count below it,
  // so a file-wide search would be satisfied by the counter while the real
  // gate was deleted.
  const batch = sql.slice(sql.indexOf('WITH batch AS ('), sql.indexOf('GET DIAGNOSTICS'));

  it('stamps a REAL verdict rather than weakening the commit gate', () => {
    // Relaxing news_commit_staging_batch is how 346 unjudged articles published
    // indexable in 2026-09. This migration must not touch that function.
    expect(sql).toMatch(/'quality_status', 'passed'/);
    expect(sql).not.toMatch(/news_commit_staging_batch/);
  });

  it('records the basis so the verdict is auditable and not mistaken for the LLM', () => {
    expect(sql).toMatch(/'basis', 'curated_show'/);
    expect(sql).toMatch(/'llm_used', false/);
    expect(sql).toMatch(/podcast-deterministic\.v1/);
  });

  it('requires the curation signal, which is the whole justification', () => {
    // The verdict says "a human admitted this show". If the show is not an
    // active curated podcast source, there is nothing to inherit.
    expect(batch).toMatch(/s\.feed_type = 'podcast'/);
    expect(batch).toMatch(/s\.is_active/);
  });

  it('requires an episode to have audio and to have passed the validator', () => {
    expect(batch).toMatch(/'audio_url',''\)\s*IS NOT NULL/);
    expect(batch).toMatch(/ai_validation_status,'pending'\) = 'approved'/);
  });

  it('never publishes an empty episode', () => {
    // The reader's own predicate (useNews / get_news_front require
    // `content <> ''`). A stricter floor was measured and rejected: the live
    // corpus has 2,826 of 14,064 episodes under 200 chars, 5th percentile 72.
    expect(batch).toMatch(/'content',''\)\s*<> ''/);
  });

  it('never overwrites a verdict that already exists', () => {
    expect(batch).toMatch(/enriched_data->>'quality_status',''\) = ''/);
  });

  it('invents no relevance score', () => {
    // The commit RPC reads relevance_score as nullable. A number here would be
    // indistinguishable from one the LLM derived by reading the episode.
    expect(sql).not.toMatch(/'relevance_score'/);
  });
});

describe('the failed-enrichment disposition', () => {
  const full = stripComments(latest(/_news_enrichment_failed_disposition\.sql$/));
  // Three DO blocks (A, A2, B) then the postcondition.
  const blocks = full.split('DO $$');

  it('rejects thin stubs and re-queues the ones that gained content', () => {
    // The SAME error label covers both, so the branches must discriminate on
    // CONTENT, never on the message: news_fulltext_backfill filled 309 of them
    // in after the failure (309 of 309 had updated_at > processed_at).
    const cohortA = blocks[1] ?? '';
    const cohortA2 = blocks[2] ?? '';
    expect(cohortA).toMatch(/disposition = 'rejected'/);
    expect(cohortA).toMatch(/< 200/);
    expect(cohortA2).toMatch(/enrichment_status = 'pending'/);
    expect(cohortA2).toMatch(/>= 200/);
  });

  it('cohort B re-queues rather than rejecting, and keys on the error code', () => {
    // Cohort B is real articles (mean 3,697 chars) that enrichment returned
    // nothing for. Without an assertion here a mutation that turns this block
    // into a rejection passes — found by mutation-testing this very file.
    const cohortB = blocks[3] ?? '';
    expect(cohortB).toMatch(/enrichment_status = 'pending'/);
    expect(cohortB).not.toMatch(/disposition = 'rejected'/);
    expect(cohortB).toMatch(/error_message = 'no_enrichment_data_produced'/);
  });

  it('bounds retries so a structurally-failing row cannot loop forever', () => {
    // Without a counter each pass re-costs an LLM call — the terminal-sentinel
    // lesson from the countries and cities engines.
    const retries = full.match(/enrichment_retries'\)::int, 0\) < 2/g) ?? [];
    expect(retries.length).toBeGreaterThanOrEqual(2);
  });

  it('does not touch rows that already carry a verdict', () => {
    // 'rejected' is terminal and 'review' awaits a human. Forcing either to
    // publish overrides a decision the pipeline made on purpose.
    expect(full).not.toMatch(/quality_status'\s*(=|IN)/);
  });

  it('asserts its own postcondition', () => {
    expect(full).toMatch(/RAISE EXCEPTION 'still % content-less stubs pending'/);
  });
});

describe('the enrichment sentinel', () => {
  const sql = stripComments(latest(/_news_enrichment_signals\.sql$/));

  it('compares capacity against inflow — the comparison nothing was making', () => {
    expect(sql).toMatch(/'staged_24h'/);
    expect(sql).toMatch(/'verdicts_24h'/);
  });

  it('reports the AGE of the queue head, not only its depth', () => {
    // Depth alone cannot separate a legitimate back-catalogue import from
    // starvation; a 3,500-row depth floor is exactly what hid this.
    expect(sql).toMatch(/'oldest_awaiting_verdict_hours'/);
  });

  it('counts rows whose failure label no longer describes them', () => {
    expect(sql).toMatch(/'stale_failure_label'/);
  });

  it('is service_role only', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.news_enrichment_signals\(\) FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe('the health check', () => {
  const js = readFileSync(join(__dirname, '../../../scripts/check-pipeline-health.mjs'), 'utf8');
  const section = js.slice(js.indexOf('news_enrichment_signals'));

  it('distinguishes an ABSENT key from a zero count', () => {
    expect(section).toMatch(/measured NOTHING/);
    expect(section).toMatch(/is missing the key/);
  });

  it('hard-fails on a stale queue head', () => {
    const age = section.slice(section.indexOf('const oldestH'), section.indexOf('const staged'));
    expect(age).toMatch(/oldestH > 72/);
    expect(age).toMatch(/FAILED = true/);
  });

  it('hard-fails on a stale failure label', () => {
    const stale = section.slice(
      section.indexOf('const staleLabel'),
      section.indexOf('const podcastsWaiting'),
    );
    expect(stale).toMatch(/FAILED = true/);
  });

  it('reports capacity vs inflow as a pair, and only warns on it', () => {
    // "nothing arrived" and "nothing was judged" call for opposite responses,
    // so the denominator stays visible and this line does not fail the build.
    const cap = section.slice(
      section.indexOf('const verdicts'),
      section.indexOf('const failedWithContent'),
    );
    expect(cap).toMatch(/verdicts < staged \/ 2/);
    expect(cap).not.toMatch(/FAILED = true/);
  });
});
