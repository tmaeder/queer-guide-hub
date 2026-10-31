import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991793464111_ingestion_events_stage_created_at_index';
const sql = readFileSync(
  resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`),
  'utf8',
);
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('ingestion_events (stage, created_at) index', () => {
  it('creates the index on stage then created_at, in that order', () => {
    expect(code).toMatch(
      /create index if not exists idx_ingestion_events_stage_created_at\s+on public\.ingestion_events \(stage, created_at\);/,
    );
  });

  it('is not partial, so both the relevance count and the purge stages can use it', () => {
    expect(code).not.toMatch(/\bwhere\b/i);
  });

  it('bounds the lock wait instead of queueing behind inserters', () => {
    expect(code).toMatch(/set local lock_timeout = '\d+s';/);
    expect(code.indexOf('lock_timeout')).toBeLessThan(code.indexOf('create index'));
  });

  it('does not use CONCURRENTLY, which cannot run inside the migration transaction', () => {
    expect(code).not.toMatch(/concurrently/i);
  });

  it('the daily-cap query it serves still filters on exactly these columns', () => {
    const fn = readFileSync(
      resolve(__dirname, '../../../supabase/functions/marketplace-relevance/index.ts'),
      'utf8',
    );
    expect(fn).toMatch(
      /from\('ingestion_events'\)\s*\.select\('id', \{ count: 'exact', head: true \}\)\s*\.eq\('stage', 'relevance'\)\.gte\('created_at', startOfDay\)/,
    );
  });
});
