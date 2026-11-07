import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards migration 99991794048533 (search_hybrid city-detect venue-count cap).
 * Assertions run on comment-stripped SQL: the header quotes the old shape.
 */
const MIGRATION = '99991794048533_search_hybrid_city_detect_count_cap';
const raw = readFileSync(resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const mig = sql.slice(sql.indexOf('do $mig$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('search_hybrid city-detect count cap', () => {
  it('replaces the full venue count with a LIMIT 10 count', () => {
    expect(mig).toContain(
      "v_from1 text := '(select count(*) from public.search_documents v where v.entity_type=''venue'' and lower(v.city)=lower(c.title)) n';",
    );
    expect(mig).toContain(
      "v_to1   text := '(select count(*) from (select 1 from public.search_documents v where v.entity_type=''venue'' and lower(v.city)=lower(c.title) limit 10) v10) n';",
    );
  });

  it('adds a deterministic tie-breaker after the capped count', () => {
    expect(mig).toContain("v_to2   text := 'order by length(z.cname) desc, z.n desc, z.cname limit 1';");
  });

  it('patches the live definition and applies BOTH replacements', () => {
    expect(mig).toContain('pg_get_functiondef(v_oid)');
    expect(mig).toContain('execute replace(replace(v_def, v_from1, v_to1), v_from2, v_to2);');
    expect(mig).not.toMatch(/create or replace function/i);
  });

  it('refuses an anchor that does not occur exactly once', () => {
    expect(mig.match(/if v_n <> 1 then raise exception/g)?.length).toBe(2);
  });

  it('verify block raises on each postcondition', () => {
    for (const p of ['P1', 'P2', 'P3', 'P4']) {
      expect(verify).toMatch(new RegExp(`then raise exception '${p} failed`));
    }
    expect(verify).toContain("position('z.n>=10' in v_src) = 0");
    expect(verify).toContain("'plan_cache_mode=force_custom_plan' = any(v_cfg)");
  });
});
