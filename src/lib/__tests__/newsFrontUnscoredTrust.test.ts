import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '99991792945605_news_front_unscored_trust.sql',
);

/** Comment-stripped: the header quotes the expressions being asserted. */
const sql = readFileSync(FILE, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const verifyStart = sql.indexOf('do $verify$');
const apply = sql.slice(0, verifyStart);
const verify = sql.slice(verifyStart);

describe('get_news_front treats an unscored trust_score as missing', () => {
  it('has both an apply block and a verify block', () => {
    expect(verifyStart).toBeGreaterThan(0);
  });

  it('patches the live body instead of restating it', () => {
    expect(apply).toMatch(/pg_get_functiondef\(p\.oid\)/);
    expect(apply).toMatch(
      /execute replace\(replace\(v_src, v_a1_from, v_a1_to\), v_a2_from, v_a2_to\)/,
    );
    expect(apply).not.toMatch(/create or replace function/i);
  });

  it('requires each anchor to occur exactly once and raises otherwise', () => {
    expect(apply).toMatch(/v_a1_from, ''\)\)\) \/ length\(v_a1_from\) <> 1 then\s+raise exception/);
    expect(apply).toMatch(/v_a2_from, ''\)\)\) \/ length\(v_a2_from\) <> 1 then\s+raise exception/);
  });

  // Both halves of the predicate are load-bearing: trust_score = 0 alone would
  // also discard a genuinely COMPUTED zero, and last_verified_at alone would
  // ignore a real score on a row some other writer never stamped.
  it('keys "unscored" on trust 0 AND never verified', () => {
    expect(apply).toContain(
      "'(coalesce(case when b.trust_score = 0 and b.last_verified_at is null then null else b.trust_score end, b.quality_score, 50)/100.0)'",
    );
    expect(apply).toContain('na.quality_score, na.last_verified_at,');
  });

  it('is a no-op when already applied rather than an abort', () => {
    expect(apply).toMatch(/if position\(v_a2_to in v_src\) > 0 then[\s\S]{0,200}?return;/);
  });

  it('asserts behaviour, scoped to recent rows so rounding cannot abort db push', () => {
    expect(verify).toMatch(/from api_private\.get_news_front\(2000, null, null, 21, false\)/);
    expect(verify).toContain("na.published_at > now() - interval '3 days'");
    expect(verify).toMatch(/f\.hotness = 0;\s+if v_bad <> 0 then\s+raise exception 'P3 failed/);
  });
});
