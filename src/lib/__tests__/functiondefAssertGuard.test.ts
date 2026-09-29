import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findUnstrippedAsserts,
  withoutApplied,
  versionOf,
} from '../../../scripts/check-functiondef-asserts.mjs';

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

/**
 * ADDED IS NOT NEW.
 *
 * The scope rule ("newly ADDED migration files only") was a git diff against
 * the base ref, which cannot distinguish a migration someone just wrote from
 * one a RECOVERY PR rebuilt out of `schema_migrations`. The second kind is
 * added to the repo and was already applied to prod — the exact condition the
 * scope rule exists to forgive for the 17 historical files.
 *
 * On 2026-09-28 that blocked #3990, which recovered 13 drifted migrations: one
 * of them (20260928134338, authored in another session) asserts on
 * pg_get_functiondef without stripping, so the PR that existed to clear drift
 * for every open PR in the repo could not itself merge. Rewriting recovered SQL
 * to satisfy a lint destroys the only property a recovered file has — matching
 * what actually ran — so the guard learns to look the version up instead.
 */
describe('applied-version exemption', () => {
  const RECOVERED = 'supabase/migrations/20260928134338_event_liveness_fresh_unknown_not_stale.sql';
  const FRESH = 'supabase/migrations/99991790606213_rheinfetisch_calendar_source.sql';

  it('exempts a file whose version is already applied to prod', () => {
    const { checked, exempt } = withoutApplied([RECOVERED], new Set(['20260928134338']));
    expect(exempt).toEqual([RECOVERED]);
    expect(checked).toEqual([]);
  });

  it('still checks a genuinely new file in the same PR', () => {
    // The dangerous shape: a recovery PR must not become a way to smuggle an
    // unchecked new migration in alongside the recovered ones.
    const { checked, exempt } = withoutApplied([RECOVERED, FRESH], new Set(['20260928134338']));
    expect(checked).toEqual([FRESH]);
    expect(exempt).toEqual([RECOVERED]);
  });

  it('FAILS CLOSED: with no token (null) every file is still checked', () => {
    // The strict branch is the fallback, so a missing secret can only make this
    // guard noisier. Exempting everything here would silently switch it off.
    const { checked, exempt } = withoutApplied([RECOVERED, FRESH], null);
    expect(checked).toEqual([RECOVERED, FRESH]);
    expect(exempt).toEqual([]);
  });

  it('keeps a file whose version cannot be parsed', () => {
    // Unprovable is not exempt.
    const odd = 'supabase/migrations/not-a-version.sql';
    const { checked, exempt } = withoutApplied([odd], new Set(['20260928134338']));
    expect(checked).toEqual([odd]);
    expect(exempt).toEqual([]);
  });

  it('an empty applied set exempts nothing', () => {
    const { checked, exempt } = withoutApplied([RECOVERED], new Set());
    expect(checked).toEqual([RECOVERED]);
    expect(exempt).toEqual([]);
  });

  it('versionOf reads the leading 14 digits, and only those', () => {
    expect(versionOf(RECOVERED)).toBe('20260928134338');
    expect(versionOf('supabase/migrations/20260928134338_x.sql')).toBe('20260928134338');
    // Not 14 digits, and not leading — neither is a version.
    expect(versionOf('supabase/migrations/2026_short.sql')).toBeNull();
    expect(versionOf('supabase/migrations/x_20260928134338.sql')).toBeNull();
  });

  it('the recovered file really does trip the guard, so the exemption is load-bearing', () => {
    // Verbatim from 20260928134338: position() over an unstripped functiondef.
    const sql = `
      do $$
      declare v_definition text;
      begin
        select pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure)
          into v_definition;
        if position('and (last_verified_at is null)' in v_definition) = 0 then
          raise exception 'unexpected shape';
        end if;
      end $$;`;
    expect(findUnstrippedAsserts(sql).length).toBeGreaterThan(0);
  });
});

/**
 * The exemption can only run in CI, where the token exists — so these pin the
 * WIRING at the source level. The dangerous mutation is not "exemption stops
 * working" (that fails loudly on the next recovery PR); it is the guard
 * reporting green having checked nothing.
 */
describe('main() is wired to the filtered list', () => {
  const src = readFileSync(
    join(process.cwd(), 'scripts', 'check-functiondef-asserts.mjs'),
    'utf8',
  );
  // Comments quote both identifiers, so assert against code only.
  const code = src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

  // Scoped to main(). A whole-file negative would fire on withoutApplied's own
  // loop over its `files` PARAMETER, which is correct code — the same
  // over-broad-negative trap this suite exists to prevent elsewhere.
  const mainBody = code.slice(code.indexOf('async function main()'));

  it('main() iterates the checked files, not the raw added list', () => {
    expect(mainBody).toMatch(/for \(const f of checked\)/);
    expect(mainBody).not.toMatch(/for \(const f of files\)/);
  });

  it('the slice really is main(), so the assertion above is not vacuous', () => {
    expect(mainBody.length).toBeGreaterThan(200);
    expect(mainBody).toContain('addedMigrations()');
  });

  it('passes the fetched applied set into withoutApplied', () => {
    expect(code).toMatch(/withoutApplied\(files,\s*applied\)/);
    expect(code).toMatch(/await fetchRemoteVersions\(\)/);
  });

  it('reports the count it actually checked, not the count it was given', () => {
    // `${files.length} new migration(s)` would overstate the work on a recovery
    // PR — 13 claimed, 0 inspected.
    expect(code).toMatch(/\$\{checked\.length\} new migration\(s\)/);
  });

  it('a failure to determine what is applied exits non-zero', () => {
    // "could not look" must never read as "clean".
    expect(code).toMatch(/main\(\)\.catch\(/);
    expect(code).toMatch(/could not run/);
  });
});
