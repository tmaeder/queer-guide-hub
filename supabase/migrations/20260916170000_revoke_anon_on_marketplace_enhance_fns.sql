-- SECURITY: three write-capable SECURITY DEFINER functions were reachable by anon.
--
-- `marketplace_enhance_claim(integer)`, `marketplace_enhance_refill(integer)`
-- and `run_marketplace_quality_snapshot()` exist on production as
-- SECURITY DEFINER owned by `postgres`, with EXECUTE held by PUBLIC. They run
-- as the owner, so RLS does not apply, and PostgREST exposes every function in
-- `public` — meaning anyone holding the anon key (which ships in the client
-- bundle, by design) could invoke them over the REST API and mutate
-- marketplace state.
--
-- HOW THIS GOT HERE, because it is the more useful part: **no migration file
-- anywhere in this repo or any worktree on this machine defines these three
-- functions**, and `supabase_migrations.schema_migrations` has no record of
-- them. They were applied to production as raw SQL outside the migration path,
-- so they carried the default `GRANT EXECUTE ... TO PUBLIC` that every new
-- function gets, and no review ever saw them. `release_gate_checks` /
-- `check-anon-function-grants.mjs` caught it, which is the gate working — it
-- has been failing "Critical data-quality gates" on EVERY open PR, not just
-- the one that happens to carry this fix.
--
-- REVOKE FROM PUBLIC, not from anon alone. Revoking `from anon` while PUBLIC
-- still holds the grant is a no-op that also *hides itself*: the anon entry
-- disappears from `proacl` while `has_function_privilege('anon', …)` stays
-- TRUE, so the ACL looks fixed and the hole stays open. This is the trap the
-- gate's own output warns about.
--
-- Nothing calls these from application code — grepped across `src/`,
-- `supabase/functions/` and `workers/`, zero hits. They are cron-shaped
-- (`run_*`, `*_claim`, `*_refill`), and pg_cron executes as the job owner, so
-- revoking the anon/authenticated/PUBLIC grants cannot affect a scheduled run.
-- `service_role` is left intact for the same reason.
--
-- This migration is deliberately idempotent and tolerant of the functions not
-- existing: they are unrecorded, so a fresh environment rebuilt purely from
-- migrations will not have them, and this must not fail there.

do $$
declare
  r record;
  v_fixed integer := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'marketplace_enhance_claim',
         'marketplace_enhance_refill',
         'run_marketplace_quality_snapshot'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    v_fixed := v_fixed + 1;
    raise notice 'revoked anon/public EXECUTE on %', r.sig;
  end loop;

  raise notice 'marketplace enhance fns hardened: %', v_fixed;
end $$;

-- Assert the hole is actually closed, rather than trusting the ACL text.
-- `has_function_privilege` is the only check that sees a PUBLIC grant.
do $$
declare
  v_open text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_open
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'marketplace_enhance_claim',
       'marketplace_enhance_refill',
       'run_marketplace_quality_snapshot'
     )
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_open is not null then
    raise exception 'still anon-executable after revoke: %', v_open;
  end if;
end $$;
