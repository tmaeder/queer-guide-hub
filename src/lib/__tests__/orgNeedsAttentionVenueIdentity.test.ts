import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 99991792261855: organizations.needs_attention had climbed back to 79.1% of
 * the table (79,112 / 100,039) because 96,289 rows are venue-identity orgs the
 * business spine minted above each venue. Their detail lives on the venue,
 * which carries its own needs_attention, so the org flag double-counted every
 * thin venue — 77,093 of the 79,112 flags.
 *
 * These assertions pin the exclusion and the shape that keeps it safe. The
 * general "score only, no email arm" rule is guarded by
 * orgNeedsAttentionRule.test.ts against whichever migration defines the
 * function last.
 */

const FILE = '99991792261855_org_needs_attention_venue_identity.sql';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', FILE), 'utf8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

const body = sql.slice(
  sql.search(/create\s+or\s+replace\s+function\s+public\.run_org_quality_recompute/i),
  sql.indexOf('END; $$;'),
);

describe('venue-identity organizations are not flagged', () => {
  it('the comment stripper is load-bearing', () => {
    expect(raw.length).toBeGreaterThan(sql.length + 1500);
  });

  it('keys the exclusion on structure: roles exactly {venue} AND a venue link', () => {
    expect(body).toMatch(
      /o\.roles\s*=\s*ARRAY\['venue'\]::text\[\]\s+AND\s+o\.primary_venue_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('coalesces it to false, or a NULL roles writes needs_attention = NULL', () => {
    expect(body).toMatch(/COALESCE\(\s*o\.roles\s*=[\s\S]*?,\s*false\s*\)\s*AS\s+venue_identity/i);
  });

  it('applies the same predicate in the SET and in the diff guard', () => {
    const preds = [
      ...body.matchAll(/needs_attention\s*(?:=|IS DISTINCT FROM)\s*\(([^)]*)\)/gi),
    ].map((m) => m[1].replace(/\s+/g, ' ').trim());
    expect(preds).toHaveLength(2);
    for (const p of preds) expect(p).toBe('s.new_completeness < 40 AND NOT s.venue_identity');
  });

  it('leaves completeness_score untouched by the exclusion', () => {
    expect(body).toMatch(/completeness_score\s*=\s*s\.new_completeness,/);
    expect(body).not.toMatch(/completeness_score\s*=[^,]*venue_identity/i);
  });

  it('does not repair inline — the nightly run applies it', () => {
    expect(sql).not.toMatch(/run_org_quality_recompute\s*\(\s*true\s*\)/i);
  });

  it('asserts the deployed function carries the exclusion', () => {
    const verify = sql.slice(sql.indexOf('DO $verify$'));
    expect(verify).toMatch(/position\('NOT s\.venue_identity' in v_src\) = 0/);
    expect(verify).toMatch(/RAISE EXCEPTION 'run_org_quality_recompute does not exclude/);
  });
});

describe('the duplicate Hide & Seek source is retired, not paused', () => {
  const upd = sql.slice(sql.indexOf('UPDATE public.news_sources'));

  it('targets the zero-output duplicate by id AND url', () => {
    expect(upd).toMatch(/id = '923814a7-e5b7-49b6-a61a-a57a91348962'/);
    expect(upd).toMatch(/url = 'https:\/\/joy\.org\.au\/hideandseek\/feed\/podcast'/);
  });

  it('uses is_active, not auto_paused, which source health would undo', () => {
    expect(upd.slice(0, upd.indexOf(';'))).toMatch(/SET is_active = false/);
    expect(sql).not.toMatch(/auto_paused\s*=/);
  });

  it('never touches the working source', () => {
    expect(sql).not.toMatch(/UPDATE public\.news_sources[^;]*81f781ea/);
  });
});
