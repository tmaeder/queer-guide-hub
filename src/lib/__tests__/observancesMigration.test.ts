// src/lib/__tests__/observancesMigration.test.ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991795350227_observances.sql. Assertions run over COMMENT-STRIPPED SQL and are scoped
// to the statement they are about: the header quotes the rules it implements, so a
// bare toContain over the raw file passes against a deleted guard.
const dir = join(process.cwd(), 'supabase/migrations');
const file = readdirSync(dir).find((f) => f.endsWith('_observances.sql'));
const raw = file ? readFileSync(join(dir, file), 'utf8') : '';
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

function fnBody(name: string): string {
  const start = sql.indexOf(`function public.${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = sql.indexOf('$fn$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('observances migration', () => {
  it('exists', () => expect(file).toBeTruthy());

  it('linker never links on the name signal alone (both signals, full mode only)', () => {
    const body = fnBody('run_observance_link');
    expect(body).toMatch(/when v_mode = 'full' and s\.name_sig and s\.date_sig then 'linked'/);
    expect(body).not.toMatch(/then 'linked'[\s\S]{0,40}else 'linked'/);
  });

  it('candidates require a name match (date alone never inserts)', () => {
    const body = fnBody('run_observance_link');
    expect(body).toMatch(
      /join o on \(e\.title ~\* o\.rx or coalesce\(e\.description, ''\) ~\* o\.rx\)/,
    );
    expect(body).not.toMatch(/where e\.title ~\*/);
  });

  it('a human decision or a rejection is never overwritten', () => {
    const body = fnBody('run_observance_link');
    const upd = body.slice(body.indexOf('on conflict'));
    expect(upd).toMatch(/where public\.event_observances\.status = 'review'/);
    expect(upd).toMatch(/and public\.event_observances\.method = 'auto'/);
    expect(upd).toMatch(/and excluded\.status = 'linked'/);
  });

  it('gated count returns an aggregate only, scoped to safety_gated', () => {
    const body = fnBody('observance_gated_count');
    expect(body).toMatch(/returns int/);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/and e\.safety_gated/);
  });

  it('linker is not callable by anon/authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.run_observance_link\(text, timestamptz\) from public, anon, authenticated;/,
    );
  });

  it('new tables revoke the public-schema default write grants', () => {
    for (const t of ['observances', 'observance_dates', 'event_observances']) {
      expect(sql).toContain(`revoke all on table public.${t} from anon, authenticated;`);
      expect(sql).toContain(`grant select on table public.${t} to anon, authenticated;`);
    }
  });

  it('postconditions assert computed dates, not just row counts', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain("'2025-10-16'");
    expect(verify).toContain("'2026-10-15'");
    expect(verify).toContain("'2028-02-29'");
  });
});
