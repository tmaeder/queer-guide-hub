import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789904650_platform_health_repairs.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('platform health repairs', () => {
  it('makes empty worklists index-addressable with the same predicates callers use', () => {
    expect(sql).toMatch(/news_articles_refetch_worklist_idx[\s\S]*enrichment_status->'refetch'/i);
    expect(sql).toMatch(
      /marketplace_listings_image_mirror_worklist_idx[\s\S]*image_hashes = '\[\]'::jsonb/i,
    );
    expect(sql).toMatch(
      /ingestion_staging_news_target_record_idx[\s\S]*target_table = 'news_articles'/i,
    );
    expect(sql).toMatch(/ingestion_staging_podcast_created_idx[\s\S]*media_type' = 'podcast'/i);
  });

  it('repairs Hamilton only behind the measured Canadian-data signature', () => {
    const update = sql.slice(
      sql.indexOf('update public.cities'),
      sql.indexOf('update public.admin_automations'),
    );
    expect(update).toMatch(/wikidata_qid = 'Q30985'/);
    expect(update).toMatch(/population = 569353/);
    expect(update).toMatch(/area_km2 = 1138\.11/);
    expect(update).toMatch(/wikipedia_title, ''\) = 'Hamilton, Ontario'/);
    expect(update).toMatch(/official_website = null/);
    expect(update).toMatch(/mayor = null/);
  });

  it('restores only recovered jobs and retains a finite failure kill switch', () => {
    const update = sql.slice(
      sql.indexOf('update public.admin_automations'),
      sql.indexOf('do $schedule$'),
    );
    expect(update).toMatch(/enabled = false/);
    expect(update).toMatch(/consecutive_failures = 0/);
    expect(update).toMatch(/last_run_status = 'success'/);
    expect(update).toMatch(/auto_pause_threshold = greatest\(auto_pause_threshold, 6\)/);
    expect(sql).not.toMatch(/sync_automations_to_cron\(true\)/);
  });

  it('advances the news attempt epoch once, rather than removing the retry ceiling', () => {
    expect(sql).toMatch(/attempt_epoch = now\(\) \+ interval '20 minutes'/);
    expect(sql).toMatch(/cleanedBody JSON is malformed/);
  });
});
