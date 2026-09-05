-- Take `public.event_dup_signals()` off the anon key.
--
-- WHAT IS WRONG. The function is SECURITY DEFINER and VOLATILE and was created
-- by 20270822093816 with no grant statement at all, so it inherited PostgreSQL's
-- default `EXECUTE` grant to PUBLIC. Measured on prod:
--
--   prosecdef                                = true
--   provolatile                              = 'v'
--   has_function_privilege('anon', oid, ...) = TRUE
--
-- SECURITY DEFINER means it runs as its owner (postgres) and RLS does not
-- apply, so anyone holding only the publishable anon key can invoke it over the
-- REST API.
--
-- WHY IT MATTERS, precisely. The function returns counts, so this is not a
-- write or a data-corruption hole. Two things are still wrong with it being
-- public:
--
--   1. It calls `public.run_dedup_truth_sweep('event', 'dry_run')` on every
--      invocation — a full-corpus scan of the events table. An unauthenticated
--      caller can repeat that at will, which is a cheap way to load the
--      database. The mode is hardcoded to 'dry_run', so no merge can be
--      triggered; the cost is the scan, not the write.
--   2. It returns internal operational metrics — open dedup pairs, merge counts
--      over 7 and 30 days, the age of the oldest unresolved pair — which are
--      admin observability, not public data.
--
-- WHY THIS IS ITS OWN PR. `Critical data-quality gates` is a required check
-- that reads PROD rather than the branch, so from the moment this function
-- landed it failed on EVERY open pull request, none of which introduced it.
-- Fixing it in any one feature branch would couple an unrelated security fix to
-- that feature's review; fixing it here unblocks the repository.
--
-- `from public, anon, authenticated`, NOT `from anon` alone. Revoking from anon
-- while PUBLIC still holds the grant is a no-op that also HIDES itself: the anon
-- entry disappears from proacl while `has_function_privilege()` keeps returning
-- true, so the gate would still fail and the ACL would look correct. This is
-- called out in scripts/check-anon-function-grants.mjs's own failure message.
--
-- service_role is granted back explicitly. The function has no caller in the
-- repository today (grepped: zero hits in scripts/, src/ and
-- supabase/functions/), so nothing breaks either way — but it is plainly built
-- to be a health probe, and check-pipeline-health.mjs authenticates with
-- SUPABASE_SERVICE_ROLE_KEY, so that is the role a future caller will hold.
-- Granting it now means adding the probe later needs no second migration.

revoke all on function public.event_dup_signals() from public, anon, authenticated;
grant execute on function public.event_dup_signals() to service_role;

do $verify$
declare v_anon boolean; v_svc boolean;
begin
  -- Assert the OUTCOME, not the statements. has_function_privilege is what the
  -- CI gate reads and what an attacker's request actually resolves against;
  -- proacl can look right while the privilege is still inherited from PUBLIC.
  select has_function_privilege('anon', 'public.event_dup_signals()', 'execute')
    into v_anon;
  select has_function_privilege('service_role', 'public.event_dup_signals()', 'execute')
    into v_svc;

  if v_anon then
    raise exception 'event_dup_signals is still executable by anon';
  end if;
  if not v_svc then
    raise exception 'event_dup_signals is no longer executable by service_role';
  end if;

  raise notice 'event_dup_signals: anon=% service_role=%', v_anon, v_svc;
end
$verify$;
