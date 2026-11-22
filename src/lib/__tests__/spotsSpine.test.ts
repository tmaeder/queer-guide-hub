import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/99991795350279_spots_spine.sql';
const raw = readFileSync(MIGRATION, 'utf8');
// Strip comments so prose in the header cannot satisfy an assertion.
const sql = raw.replace(/--[^\n]*/g, '').toLowerCase();

describe('spots spine migration', () => {
  it('creates the spine with a closed kind vocabulary', () => {
    expect(sql).toMatch(/create table public\.spots/);
    expect(sql).toMatch(/kind text not null check \(kind in \('place', 'organization'\)\)/);
  });

  it('locks the table down: RLS on, no grants to anon or authenticated', () => {
    expect(sql).toMatch(/alter table public\.spots enable row level security/);
    expect(sql).toMatch(/revoke all on public\.spots from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant [a-z, ]+ on public\.spots to (anon|authenticated)/);
  });

  it('mirrors BOTH profile tables on insert, update and delete', () => {
    for (const t of ['venues', 'organizations']) {
      expect(sql).toMatch(
        new RegExp(`create trigger trg_spots_sync\\s+after insert or update or delete on public\\.${t}\\s+for each row execute function public\\.spots_sync\\(\\)`),
      );
    }
  });

  it('runs the sync as definer with a pinned search_path', () => {
    const fn = sql.slice(sql.indexOf('function public.spots_sync()'));
    expect(fn.slice(0, 400)).toMatch(/security definer/);
    expect(fn.slice(0, 400)).toMatch(/set search_path to 'public', 'pg_temp'/);
  });

  it('aborts the migration when the backfill leaves drift', () => {
    expect(sql).toMatch(/if \(v ->> 'drift_count'\)::int <> 0 then\s+raise exception/);
  });

  it('schedules and registers the nightly drift check', () => {
    expect(sql).toMatch(/cron\.schedule\('spots_drift_check'/);
    expect(sql).toMatch(/insert into public\.admin_automations[\s\S]*'spots_drift_check'/);
    expect(sql).toMatch(/revoke execute on function public\.spots_drift_check\(\) from public, anon, authenticated/);
  });
});
