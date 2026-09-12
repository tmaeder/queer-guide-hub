import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the podcast recovery migration and its sentinel.
 *
 * The defect these exist to fix was invisible for two months: 5,729 episodes
 * committed as plain articles with the audio discarded, and nothing counted
 * them. The migration is a one-shot, so what has to survive is the PROPERTY
 * that makes it safe to re-run and the sentinel that stops it recurring.
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

/** Comments explain the trap; they must never be able to SATISFY an assertion. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

describe('the recovery migration', () => {
  const full = stripComments(latest(/_podcast_recover_stranded_episodes\.sql$/));
  // SCOPED to part 1, the UPDATE that restores the stranded rows.
  //
  // Not a detail: the first draft of this file asserted against the whole
  // migration and mutation-testing found two assertions VACUOUS. `a.audio_url
  // IS NULL` and `CONSTANT int := 300` each occur twice — once in the recovery
  // block and once in the postcondition / the duration block — so deleting the
  // idempotency guard and removing the batch cap both left the suite green.
  // An assertion that a string exists somewhere in a 170-line file asserts
  // almost nothing.
  // The file is three DO blocks: recover, fill durations, assert. Split on the
  // block opener, which survives comment stripping.
  const blocks = full.split('DO $$');
  const sql = blocks[1] ?? '';

  it('recovers from the staging row, never by re-fetching', () => {
    // Most of these episodes fell out of their feed's window months ago. A
    // re-fetch could not reach them; ingestion_staging still holds every URL.
    expect(sql).toMatch(/ingestion_staging/);
    expect(sql).toMatch(/target_record_id\s*=\s*a\.id/);
    expect(sql).toMatch(/normalized_data->'metadata'->>'audio_url'/);
  });

  it('is idempotent — a re-run selects nothing', () => {
    // Without `audio_url IS NULL` a second run would overwrite a URL some
    // other path had since corrected.
    expect(sql).toMatch(/a\.audio_url IS NULL/);
  });

  it('requires the staging row to agree it was a podcast', () => {
    // A podcast SOURCE can carry a non-episode item. The corroboration is free
    // here, so it is required rather than inferred from the feed type alone.
    expect(sql).toMatch(/normalized_data->'metadata'->>'media_type'\s*=\s*'podcast'/);
  });

  it('batches, because news_articles carries a per-row search trigger', () => {
    // Measured on prod: 2.48 ms/row. One 5,729-row statement is one statement
    // against the timeout, and a timeout is a full rollback.
    expect(sql).toMatch(/LIMIT v_batch/);
    expect(sql).toMatch(/v_batch\s+CONSTANT int\s*:=\s*300/);
  });

  it('never copies a staged image_url', () => {
    // Whole-file: no block anywhere may write image_url.
    // All 4,796 staged metadata.image_url values on artwork-less podcast rows
    // ARE the audio URL — the defect 20361118143700 exists to seal. Copying
    // them back would re-create a 5,607-row MP3-as-og:image fault.
    expect(full).not.toMatch(/set[\s\S]{0,200}image_url\s*=/i);
  });

  it('asserts its own postcondition', () => {
    expect(full).toMatch(/RAISE EXCEPTION 'podcast recovery incomplete/);
  });
});

describe('the sentinel', () => {
  const sql = stripComments(latest(/_news_podcast_signals\.sql$/));

  it('reports the RATE, not whether the cron ran', () => {
    // 256 of 265 sources reported a SUCCESSFUL fetch within 24h throughout the
    // outage, with consecutive_failures 0 on every one. Fetching worked; only
    // the commit did not. A liveness check is green in exactly that state.
    expect(sql).toMatch(/'episodes_staged_7d'/);
    expect(sql).toMatch(/'episodes_committed_7d'/);
  });

  it('counts stranded episodes with zero tolerance', () => {
    expect(sql).toMatch(/'stranded_as_article'/);
    expect(sql).toMatch(/'invalid_url_rejections_7d'/);
  });

  it('fixes the remaining-count that can never drain', () => {
    // The `batch` CTE required btrim(artwork_url) <> '' and `remaining` did
    // not, so a source with an empty-string artwork was counted as outstanding
    // work forever and never selected.
    const fn = sql.slice(sql.indexOf('run_news_podcast_artwork_fill'));
    const remaining = fn.slice(fn.indexOf("'remaining'"), fn.indexOf("'sources_with_artwork'"));
    expect(remaining).toMatch(/btrim\(s\.artwork_url\) <> ''/);
  });

  it('is service_role only', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.news_podcast_signals\(\) FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe('the health check', () => {
  const js = readFileSync(join(__dirname, '../../../scripts/check-pipeline-health.mjs'), 'utf8');
  // Scope to this section so an assertion cannot be satisfied by a sibling
  // check that happens to use the same words.
  const section = js.slice(js.indexOf('news_podcast_signals'));

  it('distinguishes an ABSENT key from a zero count', () => {
    // A sentinel deployed with a key missing would otherwise report the
    // cleanest possible corpus while checking none of it.
    expect(section).toMatch(/measured NOTHING/);
    expect(section).toMatch(/is missing the key/);
  });

  it('hard-fails on a stranded episode', () => {
    const stranded = section.slice(section.indexOf('const stranded'));
    expect(stranded.slice(0, 600)).toMatch(/FAILED = true/);
  });

  it('warns on a low commit rate rather than failing', () => {
    // The news quality gate legitimately rejects some episodes and the number
    // moves with the corpus, so this is a floor, not a target.
    const rate = section.slice(section.indexOf('const staged'));
    expect(rate.slice(0, 900)).toMatch(/pct < 40/);
    expect(rate.slice(0, 900)).not.toMatch(/FAILED = true/);
  });
});

describe('the news_sources column allowlist', () => {
  const sql = stripComments(latest(/_news_sources_podcast_public\.sql$/));

  it('revokes the table grant before granting columns', () => {
    // RLS filters ROWS, not columns. The policy `is_active = true` never
    // stopped `select=*` returning last_error / reliability_score to anon.
    expect(sql).toMatch(/REVOKE SELECT ON TABLE public\.news_sources FROM anon/);
    expect(sql).toMatch(/REVOKE SELECT ON TABLE public\.news_sources FROM PUBLIC/);
    expect(sql).toMatch(/GRANT SELECT \(/);
  });

  it('asserts the operational columns are unreachable, rather than trusting the GRANT', () => {
    expect(sql).toMatch(/still exposes operational columns to anon/);
    for (const col of [
      'last_error',
      'reliability_score',
      'auto_paused_reason',
      'consecutive_failures',
    ]) {
      expect(sql).toContain(`'${col}'`);
    }
  });

  it('leaves the authenticated role alone', () => {
    // A column grant is per-ROLE and `authenticated` is shared by the admin
    // console and every free signup. Narrowing it is its own change.
    expect(sql).not.toMatch(/REVOKE SELECT ON TABLE public\.news_sources FROM authenticated/);
  });

  it('the anon client no longer asks for every column', () => {
    const hook = readFileSync(join(__dirname, '../../hooks/useNews.tsx'), 'utf8');
    const block = hook.slice(hook.indexOf('fetchSources'), hook.indexOf('fetchSources') + 1400);
    expect(block).not.toMatch(/\.from\('news_sources'\)\s*\n\s*\.select\('\*'\)/);
    expect(block).toMatch(/artwork_url/);
  });
});
