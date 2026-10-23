import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const MIGRATION = '99991792729790_news_review_queue_automation.sql';
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

// Comment-stripped: the header quotes the identifiers these guards look for.
const strip = (src: string, marker: string) =>
  src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith(marker))
    .join('\n');

const sql = strip(read('supabase', 'migrations', MIGRATION), '--');
const verifyAt = sql.indexOf('do $verify$');
const apply = sql.slice(0, verifyAt);
const verify = sql.slice(verifyAt, sql.indexOf('$verify$;'));
const gate = strip(read('supabase', 'functions', 'pipeline-review-gate', 'index.ts'), '//');
const enhance = strip(read('supabase', 'functions', 'pipeline-quality-enhance', 'index.ts'), '//');
const health = read('scripts', 'check-pipeline-health.mjs');

describe('news review queue automation migration', () => {
  it('has an apply half and a verify half', () => {
    expect(verifyAt).toBeGreaterThan(0);
  });

  it('patches both commit functions to drop image, attribution and hash when suppressed', () => {
    expect(apply).toContain("'public.commit_news_staging_item(uuid,text)'::regprocedure");
    expect(apply).toContain("'public.news_commit_staging_batch(uuid,uuid,integer)'::regprocedure");
    expect(apply).toMatch(
      /image_suppressed''\)::boolean, false\) THEN\\n {4}v_image := NULL; v_image_attribution := NULL; v_image_hash := NULL;/,
    );
    expect(apply).toMatch(/<> 1 then\s+raise exception 'image_suppressed patch/);
  });

  it('patches the podcast verdict to stamp auto_publish, from the live definition', () => {
    expect(apply).toContain("'public.run_podcast_deterministic_verdict(integer)'::regprocedure");
    expect(apply).toMatch(/execute replace\(v_src, v_anchor, v_anchor \|\| ' ''auto_publish'', true,'\);/);
    expect(apply).toMatch(/raise exception 'podcast auto_publish patch: anchor not found exactly once'/);
  });

  it('stamps auto_publish on existing passed verdicts with nothing blocking', () => {
    expect(apply).toMatch(/jsonb_build_object\('auto_publish', true\)\s+where s\.target_table = 'news_articles'/);
  });

  it('raises only the quality-enhance batch, never the enrich-news one', () => {
    expect(apply).toMatch(/\(pipeline-quality-enhance''\.\*\?\)\\\{"batch_size":5/);
    expect(apply).toContain('{"batch_size":24,"concurrency":4}');
    expect(apply).not.toMatch(/pipeline-enrich-news''\.\*\?/);
  });

  it('resets empty verdicts to unjudged (attempt 1) rather than deciding them', () => {
    expect(apply).toMatch(/- 'quality_status' - 'quality_decision'/);
    expect(apply).toMatch(/'quality_attempts', 1/);
    expect(apply).toMatch(/\? 'empty_extraction';/);
  });

  it('relaxes only verdicts whose blocks are all image/entity-link', () => {
    expect(apply).toMatch(/<@ '\["image_unusable","entity_links_pending_review"\]'::jsonb;/);
    expect(apply).toMatch(/jsonb_array_length\(s\.enriched_data->'auto_publish_blocked_reasons'\) > 0/);
    expect(apply).toMatch(/s\.enriched_data->>'quality_status' = 'review'/);
  });

  it('every postcondition raises on a non-zero count', () => {
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      expect(verify).toMatch(new RegExp(`if v_bad <> 0 then raise exception '${p} failed`));
    }
    expect(verify).not.toMatch(/where false|if \(false\)|if v_bad < 0/);
  });

  it('sentinel is service_role only', () => {
    expect(sql).toMatch(/revoke all on function public\.news_staging_review_signals\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.news_staging_review_signals\(\) to service_role;/);
  });
});

describe('pipeline code half', () => {
  it('review gate publishes a passed verdict with nothing blocking', () => {
    expect(gate).toMatch(/qualityStatus === 'passed' && blockedList\.length === 0/);
    expect(gate).toMatch(/if \(qualityStatus && publishable && !lowReliability && !forceReview\)/);
  });

  it('quality-enhance retries empty/failed verdicts and uses staging relaxations', () => {
    expect(enhance).toMatch(/\(!decision \|\| extractionIsEmpty\(decision\)\) && prevAttempts \+ 1 < MAX_QUALITY_ATTEMPTS/);
    expect(enhance).toMatch(/stagingRelaxations: true/);
    expect(enhance).toMatch(/image_suppressed: gate\.suppressImage && !replacementImage/);
    expect(enhance).toMatch(/\.order\('enriched_data->quality_attempts'/);
    // A reset row may carry the older 'completed' status; it must stay selectable.
    expect(enhance).toMatch(/\.in\('enrichment_status', \['enriched', 'completed'\]\)/);
  });
});

describe('health script wiring', () => {
  it('calls the sentinel before the terminal exit and fails on both invariants', () => {
    const at = health.indexOf('/rest/v1/rpc/news_staging_review_signals');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(health.lastIndexOf('process.exit(1)'));
    const block = health.slice(at, health.indexOf('// §19'));
    expect(block).toMatch(/if \(empty > 0\) \{\n.*\n\s*FAILED = true/);
    expect(block).toMatch(/if \(relax > 0\) \{\n.*\n\s*FAILED = true/);
  });
});
