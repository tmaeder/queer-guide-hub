import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A throttled wbgetentities request must never count as a link attempt.
 * Three such misses stamp `data_unavailable` and drop the city from every
 * future sweep; before 2026-10-07 a 429 and a deleted item were the same null.
 */
const src = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'city-factual-backfill', 'index.ts'),
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('city-factual-backfill wikidata transient handling', () => {
  it('retries 429 and 5xx before giving up', () => {
    const f = src.slice(src.indexOf('async function fetchWbEntities'), src.indexOf('async function fetchEntity('));
    expect(f).toContain('r.status !== 429 && r.status < 500');
    expect(f).toMatch(/for \(let i = 0; i < WD_RETRIES; i\+\+\)/);
  });

  it('only an explicit `missing` marker is a verdict; a failed or empty answer is transient', () => {
    const f = src.slice(src.indexOf('async function fetchEntity('), src.indexOf('async function fetchEntity(') + 2000);
    expect(f).toContain("if (!res.ok) return 'transient'");
    expect(f).toContain("if (!ent) return 'transient'");
    expect(f).toContain("if ('missing' in ent) return null");
  });

  it('the transient branch never calls bumpMiss and comes before the missing branch', () => {
    const t = src.indexOf("if (ent === 'transient') {");
    const m = src.indexOf('} else if (!ent) {', t);
    expect(t).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(t);
    expect(src.slice(t, m)).not.toContain('bumpMiss');
    expect(src.slice(m, m + 200)).toContain("bumpMiss(state, 'wikidata_link', 'wikidata')");
  });

  it('reports the transient count in the link response', () => {
    expect(src).toContain('wikidata_fetch_failed: wdTransient,');
  });
});
