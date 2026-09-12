-- event_schedule_signals() kept the default PUBLIC execute grant.
--
-- 20750101100100 created it SECURITY DEFINER and then wrote
--
--   grant execute on function public.event_schedule_signals() to service_role;
--
-- which reads like the grant list but is not one: CREATE FUNCTION grants EXECUTE
-- to PUBLIC by default, so naming service_role ADDS a grantee and revokes
-- nothing. Measured on prod, proacl held {-, anon, authenticated, postgres,
-- service_role} — the leading `-` is PUBLIC. So any holder of the anon key could
-- POST /rest/v1/rpc/event_schedule_signals.
--
-- What that discloses is aggregate counts, not rows, which is why it is being
-- fixed as a grant rather than a rewrite: the function is a CI sentinel called
-- by scripts/check-pipeline-health.mjs with the service key and has no anonymous
-- caller to break. But it reads public.events, which is safety-gated, as its
-- OWNER — so the safety_gated RLS policy does not apply to it, and
-- check-definer-content-leaks.mjs is right to refuse it. That gate is a REQUIRED
-- check and has been red on every PR opened since #3634 merged.
--
-- The pattern generalises: `grant execute ... to service_role` on a new function
-- is decoration unless a revoke precedes it. Revoke from PUBLIC first, then name
-- the roles that may call it.

revoke execute on function public.event_schedule_signals() from public, anon, authenticated;
grant  execute on function public.event_schedule_signals() to service_role;

do $$
declare grantees text[];
begin
  select array_agg(distinct a.grantee::regrole::text order by a.grantee::regrole::text)
    into grantees
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
   where n.nspname = 'public'
     and p.proname = 'event_schedule_signals'
     and a.privilege_type = 'EXECUTE';

  -- '-' is PUBLIC. Asserting its absence is the whole point; asserting the
  -- positive grant separately means a revoke that took out service_role too
  -- (which would silently blind the health check) still fails here.
  if grantees && array['-', 'anon', 'authenticated'] then
    raise exception 'FAIL: event_schedule_signals is still callable by an untrusted role: %', grantees;
  end if;
  if not (grantees @> array['service_role']) then
    raise exception 'FAIL: service_role lost execute on event_schedule_signals — check-pipeline-health.mjs would go blind: %', grantees;
  end if;
  raise notice 'PASS: event_schedule_signals executable by % only', grantees;
end $$;
