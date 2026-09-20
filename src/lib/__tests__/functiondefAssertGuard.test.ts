import { describe, it, expect } from 'vitest';
import { findUnstrippedAsserts } from '../../../scripts/check-functiondef-asserts.mjs';

/**
 * `pg_get_functiondef()` returns a function body INCLUDING its comments, so a
 * verify block that greps it for a symbol matches the prose explaining the
 * symbol. On 2026-09-20 that aborted `supabase db push` on main three times in
 * one day, from three sessions, each time stranding the whole deploy queue —
 * and it only fails at APPLY time, because CI never applies migrations.
 *
 * The fixtures below are the REAL before/after text of two of those incidents,
 * reduced to the assertion that mattered. A synthetic fixture would prove the
 * regex matches itself; these prove the guard would have stopped main going down.
 */

// 99991789853609 — counted 8 `v::uuid` sites and expected 7. The 8th was a
// comment. Stranded 14 migrations from 00:21.
const UNMERGE_BEFORE = `
do $verify$
declare v_uuid_casts int;
begin
  -- ... and %I in (select v::uuid from jsonb_array_elements_text($3) v)
  select count(*) into v_uuid_casts
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(pg_get_functiondef(p.oid), 'v::uuid', 'g') m
   where n.nspname = 'public' and p.proname = 'unmerge_cities';
  if v_uuid_casts <> 7 then raise exception 'expected 7, found %', v_uuid_casts; end if;
end $verify$;
`;

const UNMERGE_AFTER = `
do $verify$
declare v_uuid_casts int;
begin
  select count(*) into v_uuid_casts
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(
      regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g'),
      'v::uuid', 'g') m
   where n.nspname = 'public' and p.proname = 'unmerge_cities';
  if v_uuid_casts <> 7 then raise exception 'expected 7, found %', v_uuid_casts; end if;
end $verify$;
`;

// 99991789855163 — asserted cities_directory no longer calls
// location_is_high_risk, while its own comment says "Inlined from
// location_is_high_risk() rather than calling it per row". Rejected itself.
const CITIES_BEFORE = `
do $verify$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='cities_directory';
  if v_src like '%location_is_high_risk%' then
    raise exception 'cities_directory calls location_is_high_risk per row again';
  end if;
end $verify$;
`;

const CITIES_AFTER = `
do $verify$
declare v_src text;
begin
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='cities_directory';
  if v_src like '%location_is_high_risk%' then
    raise exception 'cities_directory calls location_is_high_risk per row again';
  end if;
end $verify$;
`;

describe('functiondef-assert guard: the real incidents', () => {
  it('flags the unmerge_cities verify block that stranded 14 migrations', () => {
    expect(findUnstrippedAsserts(UNMERGE_BEFORE).length).toBeGreaterThan(0);
  });

  it('clears the fix that actually shipped for it', () => {
    expect(findUnstrippedAsserts(UNMERGE_AFTER)).toEqual([]);
  });

  it('flags the cities_directory block that rejected itself', () => {
    expect(findUnstrippedAsserts(CITIES_BEFORE).length).toBeGreaterThan(0);
  });

  it('clears the fix that actually shipped for it', () => {
    expect(findUnstrippedAsserts(CITIES_AFTER)).toEqual([]);
  });
});

describe('functiondef-assert guard: both failure directions', () => {
  it('flags a PRESENCE check, which fails silently GREEN rather than red', () => {
    // The worse direction: a security gate satisfied by its own comment. This
    // is the shape of gate_dedup_cluster_finders, which asserts the cluster
    // finders still call assert_admin_or_internal.
    const sql = `
      do $$ begin
        if pg_get_functiondef('public.f()'::regprocedure) not like '%assert_admin_or_internal%' then
          raise exception 'ungated';
        end if;
      end $$;`;
    expect(findUnstrippedAsserts(sql).length).toBeGreaterThan(0);
  });

  it('flags position()/strpos() forms, not just like/regexp', () => {
    const sql = `
      do $$ begin
        if position('target_groups' in pg_get_functiondef('public.f()'::regprocedure)) = 0 then
          raise exception 'contract broken';
        end if;
      end $$;`;
    expect(findUnstrippedAsserts(sql).length).toBeGreaterThan(0);
  });
});

describe('functiondef-assert guard: what it must NOT flag', () => {
  it('ignores a fetch with no comparison — that is not an assertion', () => {
    const sql = `
      do $$ declare d text; begin
        d := pg_get_functiondef('public.f()'::regprocedure);
        raise notice '%', d;
      end $$;`;
    expect(findUnstrippedAsserts(sql)).toEqual([]);
  });

  it('ignores a mention inside a comment', () => {
    // The guard strips comments from the MIGRATION before looking, or it would
    // flag every file that merely explains this rule — including this one.
    const sql = `
      -- pg_get_functiondef(p.oid) like '%foo%' would be wrong here
      select 1;`;
    expect(findUnstrippedAsserts(sql)).toEqual([]);
  });

  it('honours an explicit opt-out that states a reason', () => {
    const sql = `
      -- functiondef-assert-ok: this deliberately asserts the comment is present
      do $$ begin
        if pg_get_functiondef('public.f()'::regprocedure) not like '%documented%' then
          raise exception 'undocumented';
        end if;
      end $$;`;
    expect(findUnstrippedAsserts(sql)).toEqual([]);
  });

  it('does not accept a bare opt-out marker with no reason', () => {
    const sql = `
      -- functiondef-assert-ok:
      do $$ begin
        if pg_get_functiondef('public.f()'::regprocedure) not like '%x%' then
          raise exception 'no';
        end if;
      end $$;`;
    expect(findUnstrippedAsserts(sql).length).toBeGreaterThan(0);
  });

  it('does not treat -- inside a string literal as a comment', () => {
    // `'--'` is data, not a comment; cutting there would hide the assertion
    // that follows on the same line.
    const sql = `
      do $$ begin
        if pg_get_functiondef('public.f()'::regprocedure) like '%a--b%' then
          raise exception 'x';
        end if;
      end $$;`;
    expect(findUnstrippedAsserts(sql).length).toBeGreaterThan(0);
  });
});
