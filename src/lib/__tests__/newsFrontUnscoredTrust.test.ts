import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991792942714_news_front_unscored_trust_ranks_by_quality.sql';
const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations', MIGRATION), 'utf8')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('get_news_front treats trust_score 0 as unscored', () => {
  it('patches the hotness coalesce to nullif(trust_score, 0)', () => {
    expect(sql).toContain("v_from text := 'coalesce(b.trust_score, b.quality_score, 50)/100.0'");
    expect(sql).toContain(
      "v_to   text := 'coalesce(nullif(b.trust_score, 0), b.quality_score, 50)/100.0'",
    );
    expect(sql).toMatch(/execute replace\(v_src, v_from, v_to\)/);
  });

  it('patches the live definition instead of restating it', () => {
    expect(sql).toContain('pg_get_functiondef(');
    expect(sql).toContain('regexp_replace(');
    expect(sql).not.toMatch(/create or replace function api_private\.get_news_front/i);
  });

  it('postconditions raise on the old form surviving', () => {
    expect(sql).toMatch(
      /if position\('coalesce\(nullif\(b\.trust_score, 0\)[^']*' in v_src\) = 0 then\s+raise exception 'P1/,
    );
    expect(sql).toMatch(
      /if position\('coalesce\(b\.trust_score, b\.quality_score' in v_src\) > 0 then\s+raise exception 'P2/,
    );
  });
});
