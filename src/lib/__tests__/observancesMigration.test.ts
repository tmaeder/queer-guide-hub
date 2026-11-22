// src/lib/__tests__/observancesMigration.test.ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991795353269_observances.sql. Assertions run over COMMENT-STRIPPED SQL and are scoped
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

  it('auto-link needs a TITLE match and the date window, full mode only', () => {
    const body = fnBody('run_observance_link');
    expect(body).toMatch(
      /case when v_mode = 'full' and s\.title_term is not null and s\.date_sig then 'linked' else 'review' end/,
    );
    expect(body).not.toMatch(/then 'linked'[\s\S]{0,40}else 'linked'/);
  });

  it('full mode demotes auto links that stop qualifying, never human or rejected rows', () => {
    const body = fnBody('run_observance_link');
    const start = body.indexOf("if v_mode = 'full' then");
    expect(start).toBeGreaterThan(-1);
    const demote = body.slice(start, body.indexOf('end if;', start));
    expect(demote).toMatch(/update public\.event_observances eo/);
    expect(demote).toMatch(
      /set status = 'review', evidence = eo\.evidence \|\| '\{"demoted": true\}'::jsonb/,
    );
    expect(demote).toMatch(/and eo\.method = 'auto' and eo\.status = 'linked'/);
    expect(demote).toMatch(/and \(p_since is null or e\.start_date >= p_since\)/);
    expect(demote).toMatch(/and not exists \(select 1 from pg_temp\._obs_s s/);
    expect(demote).toMatch(/s\.title_term is not null and s\.date_sig\)/);
    expect(demote).not.toMatch(/'human'|'rejected'/);
    // a temp table name left unqualified could resolve to a public relation of the same name
    expect(body.replace(/pg_temp\._obs_s/g, '')).not.toMatch(/_obs_s/);
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
    const at = body.indexOf('on conflict');
    const upd = body.slice(at, body.indexOf(';', at));
    expect(upd).toMatch(/where public\.event_observances\.status = 'review'/);
    expect(upd).toMatch(/and public\.event_observances\.method = 'auto'/);
    expect(upd).toMatch(/and excluded\.status = 'linked'/);
  });

  it('gated count returns an aggregate only, scoped to safety_gated', () => {
    const body = fnBody('observance_gated_count');
    expect(body).toMatch(/returns int/);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/and e\.safety_gated/);
    expect(body).toMatch(
      /and exists \(select 1 from public\.observances o where o\.id = p_observance_id and o\.status = 'published'\)/,
    );
  });

  it('event_observances public read repeats the parent predicates', () => {
    expect(sql).toMatch(
      /create policy event_observances_public_read on public\.event_observances\s+for select using \(status = 'linked'\s+and exists \(select 1 from public\.events e where e\.id = event_id and e\.duplicate_of_id is null\)\s+and exists \(select 1 from public\.observances o where o\.id = observance_id and o\.status = 'published'\)\);/,
    );
  });

  it('linker is not callable by anon/authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.run_observance_link\(text, timestamptz\) from public, anon, authenticated;/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.run_observance_link[^;]*(anon|authenticated)/,
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
    // `is distinct from`, so a NULL result fails instead of passing silently
    for (const d of [
      '2025-10-16',
      '2026-10-15',
      '2028-02-29',
      '2027-02-28',
      '2027-02-01',
      '2027-10-01',
    ]) {
      expect(verify).toContain(`if v_d is distinct from '${d}'::date then raise exception`);
    }
    expect(verify).not.toMatch(/if v_d <>/);
  });
});
