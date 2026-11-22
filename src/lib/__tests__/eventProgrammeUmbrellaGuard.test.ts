import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/99991795346462_event_programme_umbrella_guard.sql';

// The header quotes the defect it fixes, so every assertion runs over SQL with
// comments stripped — otherwise prose would satisfy a check whose statement is gone.
const sql = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .toLowerCase();

const linker = sql.slice(
  sql.indexOf('create or replace function public.run_event_programme_link'),
  sql.indexOf("select set_config('app.programme_link_source', 'migration:"),
);
const cand = linker.slice(linker.indexOf('cand as ('), linker.indexOf('grouped as ('));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('event programme umbrella guard', () => {
  it('slices a non-empty linker and candidate set (positive control)', () => {
    expect(linker.length).toBeGreaterThan(500);
    expect(cand).toContain('join live c');
  });

  it('refuses a standing schedule or an over-62-day row as umbrella', () => {
    expect(linker).toMatch(/in \('recurrence', 'opening_hours'\) as is_standing/);
    expect(cand).toContain('and not p.is_standing');
    expect(cand).toContain("p.end_date - p.start_date <= interval '62 days'");
  });

  it('refuses a duplicate of the umbrella as its child', () => {
    expect(cand).toContain('c.end_date - c.start_date < 0.5 * (p.end_date - p.start_date)');
    expect(cand).toMatch(
      /except select unnest\(p\.toks\)\s+except select unnest\(p\.city_toks\)\)\s+\)\s*>= 1/,
    );
  });

  it('stamps linker provenance before writing', () => {
    expect(
      linker.indexOf("set_config('app.programme_link_source', 'linker', true)"),
    ).toBeGreaterThan(-1);
    expect(linker.indexOf("set_config('app.programme_link_source'")).toBeLessThan(
      linker.indexOf('update public.events e'),
    );
    expect(sql).toContain('before insert or update of parent_event_id on public.events');
  });

  it('keeps programme_size in step with children on every write path', () => {
    expect(sql).toContain(
      'after insert or delete or update of parent_event_id, duplicate_of_id on public.events',
    );
    expect(sql).toContain('and c.duplicate_of_id is null), 0)');
  });

  it('unlinks with a reversible stamp, never a silent null', () => {
    const repair = sql.slice(sql.indexOf('update public.events c'), sql.indexOf('do $verify$'));
    expect(repair).toContain('set parent_event_id = null');
    expect(repair).toContain("'from_parent', p.id");
    expect(repair).toContain("'by', 'migration:99991795346462'");
  });

  it('asserts the end state and raises on each postcondition', () => {
    for (const p of ['p1 failed', 'p2 failed', 'p3 failed', 'p4 failed']) {
      expect(verify).toContain(p);
    }
    expect(verify.match(/if v_bad <> 0 then\s+raise exception/g)?.length).toBe(3);
    expect(verify).not.toMatch(/where false|if \(?false\)? then/);
  });
});
