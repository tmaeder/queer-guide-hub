import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991795528169_unified_live_presence.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
// The header restates the rules in prose; assert against code only.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const upsert = sql.slice(
  sql.indexOf('create function api_private.presence_upsert'),
  sql.indexOf('create function public.presence_upsert'),
);
const areas = sql.slice(
  sql.indexOf('create or replace function api_private.cruising_presence_areas'),
  sql.indexOf('do $verify$'),
);
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('unified live presence', () => {
  it('a dating presence can never reach the social Nearby list', () => {
    expect(sql).toContain("check (not dating_visible or visibility = 'off')");
    expect(upsert).toMatch(/if p_dating then[\s\S]*?p_visibility := 'off';[\s\S]*?end if;/);
  });

  it('dating presence requires eligibility and a stored safety acknowledgement', () => {
    expect(upsert).toContain('public.is_intimate_eligible(v_uid)');
    expect(upsert).toMatch(
      /if not p_safety_acknowledged then\s+raise exception 'safety acknowledgement required'/,
    );
  });

  it('keeps server-side snapping, the TTL clamp and high-risk coarsening', () => {
    expect(upsert).toContain('v_cell := case when v_hr then 0.02 else 0.0075 end;');
    expect(upsert).toContain('greatest(15, least(coalesce(p_duration_minutes, 60), 240))');
    expect(upsert).toContain('public.location_is_high_risk(v_country, v_city)');
  });

  it('writes only through presence_upsert, never directly', () => {
    expect(sql).toContain(
      'revoke insert, update, delete on public.user_presence_location from authenticated, anon;',
    );
    expect(sql).toMatch(
      /revoke all on function public\.presence_upsert\([^)]*\) from public, anon;/,
    );
    expect(verify).toContain("has_function_privilege('anon'");
  });

  it('the dating map stays a per-city count with the old filters', () => {
    expect(areas).toContain('count(distinct l.user_id)::bigint');
    expect(areas).toContain('upl.dating_visible');
    expect(areas).toContain("ip.moderation_status = 'approved'");
    expect(areas).toContain('not public.intimate_is_blocked(v_uid, l.user_id)');
    expect(areas).toContain('not api_private.test_account_hidden(l.user_id)');
    expect(areas).not.toMatch(/\bgeog\b|\bst_\w+\(/);
  });

  it('every postcondition raises', () => {
    expect(verify.match(/raise exception/g)?.length).toBe(6);
  });
});
