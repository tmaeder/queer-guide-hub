-- =============================================================================
-- Take anon off the milestone review RPCs
-- =============================================================================
-- Third instance of the same defect in one day. 20260821092532 ends with
--
--     revoke all on function public.approve_milestone_review(uuid,text) from public;
--     grant execute on function public.approve_milestone_review(uuid,text) to authenticated, service_role;
--
-- Supabase's DEFAULT PRIVILEGES give every new public function an EXPLICIT
-- grant to anon and authenticated. Revoking PUBLIC does not remove either, so
-- anon kept EXECUTE: proacl on production read
-- `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
--
-- Unlike 20260821081817's pair, these two are NOT exploitable today -- both
-- bodies open with `has_any_role_jwt(array['admin'])` and raise 42501. That was
-- measured against production with the real anon key rather than assumed, and
-- the response distinguishes the two layers precisely:
--
--     approve_milestone_review -> 401 {"code":"42501","message":"unauthorized"}
--
-- `unauthorized` is the FUNCTION BODY's raise. A privilege denial reads
-- `permission denied for function ...` instead. So anon reaches the gate and
-- the gate holds -- one layer doing the work of two, which is exactly what the
-- migration's own REVOKE was there to prevent.
--
-- `authenticated` KEEPS execute: admins call these from the browser as ordinary
-- authenticated users, and the role check inside is what separates them. Only
-- anon is removed.
--
-- Not applied live on purpose -- it is not blocking any gate, so it goes to
-- production through `db push` on merge and creates no drift. Hence a version
-- above remote max, unlike the recovered files it accompanies.
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
       and p.proname in ('approve_milestone_review', 'reject_milestone_review')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    raise notice 'anon removed from %', r.sig;
  end loop;
end
$$;
