import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A published milestone must survive a merge with a non-published one, or its public
 * /history/<slug> URL 301s to a draft that 404s (World AIDS Day, Ulrichs 1867, WhK 1897).
 *
 * 99991795361322 fixes the two producers: the dedup sweep's milestone arm (which ranked
 * every pair "oldest wins" and so kept the older German drafts) and _milestone_merge_core
 * (which accepted any keeper). 99991795361380 repairs the three rows left by the 2026-07
 * import. Comment-stripped: the headers quote the old shapes.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations');
const RULE = '99991795361322_milestone_published_keeper_rule.sql';
const REPAIR = '99991795361380_milestone_ulrichs_hirschfeld_merge_direction.sql';

function strip(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/^\s*--.*$/, ''))
    .join('\n');
}
const read = (f: string) => strip(readFileSync(join(DIR, f), 'utf8'));
const norm = (s: string) => s.replace(/\s+/g, ' ');

const rule = norm(read(RULE));
const repair = norm(read(REPAIR));

describe('milestone keeper rule', () => {
  it('ranks published first in the sweep milestone arm', () => {
    expect(rule).toContain(
      "v_to := $a$(status = 'published')::int::numeric q, false::boolean f, created_at::timestamptz c from public.milestones$a$",
    );
    expect(rule).toContain(
      'v_from := $a$null::numeric q, false::boolean f, created_at::timestamptz c from public.milestones$a$',
    );
  });

  it('applies both patches', () => {
    expect(rule.match(/execute replace\(v_src, v_from, v_to\);/g)?.length).toBe(2);
    expect(rule).toContain(
      "pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure)",
    );
    expect(rule).toContain(
      "pg_get_functiondef('public._milestone_merge_core(uuid,uuid,uuid)'::regprocedure)",
    );
  });

  it('merge core refuses a non-published keeper when the drop is published', () => {
    expect(rule).toMatch(
      /where k\.id = p_keep_id and d\.id = p_drop_id and d\.status = 'published' and k\.status is distinct from 'published'\) then raise exception 'keep milestone % is not published/,
    );
  });

  it('verify block raises when either fix is absent', () => {
    const verify = rule.slice(rule.indexOf('do $verify$'));
    expect(verify).toContain(
      "if position($a$(status = 'published')::int::numeric q$a$ in regexp_replace(pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then raise exception 'P1",
    );
    expect(verify).toContain(
      "if position('the published row must survive' in regexp_replace(pg_get_functiondef('public._milestone_merge_core(uuid,uuid,uuid)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then raise exception 'P2",
    );
  });

  it('no later migration restates the sweep without the published rank', () => {
    const later = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql') && f > RULE)
      .map((f) => [f, read(f).toLowerCase()] as const)
      .filter(([, s]) => s.includes('function api_private.run_dedup_truth_sweep'));
    for (const [f, s] of later) {
      expect(
        s.includes("when 'milestone'")
          ? s.includes("(status = 'published')::int::numeric q")
          : true,
        f,
      ).toBe(true);
    }
  });
});

describe('Ulrichs / Hirschfeld repair', () => {
  it('keeps the published rows and merges the others into them', () => {
    expect(repair).toContain(
      'perform public._milestone_merge_core(v_ulrichs, v_ulrichs_2, null::uuid);',
    );
    expect(repair).toContain(
      'perform public._milestone_merge_core(v_ulrichs, v_ulrichs_dr, null::uuid);',
    );
    expect(repair).toContain(
      'perform public._milestone_merge_core(v_hirsch, v_hirsch_dr, null::uuid);',
    );
    expect(repair).toContain("v_ulrichs constant uuid := '51db5091-79fc-415f-8043-d78bd1c60638'");
    expect(repair).toContain("v_hirsch constant uuid := '68711fba-c552-4ae5-a777-12f209f09712'");
  });

  it('clears each draft image before its merge', () => {
    for (const dr of ['v_ulrichs_dr', 'v_hirsch_dr']) {
      const img = repair.indexOf(`where id = ${dr} and image_url is not null`);
      const merge = repair.indexOf(
        `_milestone_merge_core(${dr === 'v_ulrichs_dr' ? 'v_ulrichs' : 'v_hirsch'}, ${dr},`,
      );
      expect(img).toBeGreaterThan(0);
      expect(merge).toBeGreaterThan(img);
    }
  });

  it('skips the merges when a touched row references an absent geo row', () => {
    const guards = repair.match(/if v_geo_missing then raise notice/g) ?? [];
    expect(guards.length).toBe(2);
    expect(repair.indexOf('into v_geo_missing; if v_geo_missing then')).toBeLessThan(
      repair.indexOf('_milestone_merge_core(v_ulrichs, v_ulrichs_2,'),
    );
    expect(repair).toContain(
      'not exists (select 1 from public.geo_city_profiles g where g.place_id = m.city_id)',
    );
    expect(repair).toContain(
      'not exists (select 1 from public.geo_country_profiles g where g.place_id = m.country_id)',
    );
  });

  it('end-state check covers the whole class and raises', () => {
    const verify = repair.slice(repair.indexOf('do $verify$'));
    expect(verify).toContain(
      "where d.status = 'published' and d.duplicate_of_id is not null and k.status is distinct from 'published'; if v_bad <> 0 then raise exception 'P2",
    );
  });
});
