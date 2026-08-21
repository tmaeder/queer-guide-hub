-- =============================================================================
-- Close the anon hole on the Milestone Truth Engine functions
-- =============================================================================
-- run_milestone_trust_recompute() and run_milestone_coverage_radar() are
-- SECURITY DEFINER and write-capable (the first rewrites trust_score /
-- completeness_score across 3,213 milestones, the second writes
-- milestone_coverage_gaps). Both were reachable by `anon` on production: the
-- REST API exposes any function anon can EXECUTE, and SECURITY DEFINER means
-- RLS never applies.
--
-- The cause is a one-word-short REVOKE. Their creating SQL said
--
--     revoke all on function ... from public;
--
-- but Supabase's DEFAULT PRIVILEGES hand every new public function an EXPLICIT
-- grant to anon and authenticated. Revoking PUBLIC leaves both standing --
-- proacl read `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
-- service_role=X/postgres}` right up to this migration. The mirror-image trap
-- (revoking `from anon` alone, a no-op while PUBLIC holds the grant, and
-- invisible in proacl) is the one already documented in the repo; this is the
-- other half of it. Name all three roles, always.
--
-- compute_milestone_completeness() is read-only, so scripts/check-anon-function-
-- grants.mjs does not flag it, but it carries the same defective revoke and the
-- same intent -- it is a scorer for the two cron entry points above, not a
-- public API -- so it is locked down here too rather than left as the next
-- person's surprise.
--
-- 20260821055900 is deliberately left as-applied rather than edited: it is
-- already in schema_migrations, so editing it would fix nothing on production
-- and only make the file disagree with the SQL that actually ran. This
-- migration sorts after it, so a clean rebuild reaches the same end state.
--
-- Guarded on existence so the DO block is a no-op if the creating migration
-- has not run yet -- an unguarded REVOKE on a missing function aborts the
-- whole push.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'run_milestone_trust_recompute',
         'run_milestone_coverage_radar',
         'compute_milestone_completeness'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    raise notice 'locked down %', r.sig;
  end loop;
end
$$;
