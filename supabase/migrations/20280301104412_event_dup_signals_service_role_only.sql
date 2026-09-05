-- event_dup_signals(): service_role only. Follow-up to 20280301093500.
--
-- That migration closed the anon grant and deliberately LEFT `authenticated`,
-- saying: "The admin surface calls this and admin routes are authenticated;
-- narrowing further needs the call sites checked and is a separate decision.
-- This is a security patch, not a redesign."
--
-- That was the right call to make under time pressure, with the gate red and
-- every open PR blocked. This is the separate decision, with the call sites
-- checked.
--
-- THERE IS NO ADMIN CALLER. Measured 2026-09-05 across src/, workers/,
-- supabase/functions/, functions/, e2e/ and scripts/ — every reference to
-- `event_dup_signals` in the repository:
--
--   scripts/check-pipeline-health.mjs:298   fetch(.../rpc/event_dup_signals)
--   scripts/check-pipeline-health.mjs:304   its error message
--   scripts/check-pipeline-health.mjs:319   its error message
--   e2e/event-merge-redirect.spec.ts:100    a COMMENT, not a call
--
-- One caller, and it is a CI health check that authenticates with
-- SUPABASE_SERVICE_ROLE_KEY. Nothing in the product calls this function at all,
-- as anon or as authenticated.
--
-- AND IT HAS NO INTERNAL GATE. Read off the live catalog, not inferred from the
-- source: `pg_get_functiondef` contains no `assert_admin_or_internal`, no
-- `auth.uid`, and no `is_admin` — so the grant is the ONLY thing standing between
-- a caller and the body. That matters because of what the body does, which
-- 20280301093500 itself sets out:
--
--   * SECURITY DEFINER, so it runs as owner and RLS does not apply to what it
--     reads;
--   * it surfaces `dedup_review_queue` and merge-audit contents, which are
--     moderation-internal;
--   * it runs a full `run_dedup_truth_sweep('event', ...)` per call on a
--     disk-constrained instance — a cheap denial-of-service.
--
-- Those three facts do not stop being true for a logged-in caller. Signing up is
-- not an authorization boundary on this platform: `authenticated` is every
-- account, not staff. So the same reasoning that closed anon closes this, and the
-- only reason it was left open was that the call sites had not been checked yet.
--
-- IF AN ADMIN SURFACE EVER NEEDS IT, the path is `perform
-- assert_admin_or_internal();` at the top of the body and then re-grant — the
-- option `scripts/check-anon-function-grants.mjs` documents for admin-console
-- functions — not a bare grant back to `authenticated`.
--
-- REVOKES FROM public AND anon TOO, deliberately, so this file is correct
-- whichever order it lands in relative to 20280301093500. A revoke is idempotent;
-- an ordering assumption is not.
--
-- Check the PRIVILEGE, not the ACL. This project carries
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, ...`, so a
-- partial revoke can leave `proacl` reading as though a role is gone while
-- `has_function_privilege()` is still true. The assertion below uses the
-- privilege.

revoke execute on function public.event_dup_signals() from public, anon, authenticated;

do $verify$
declare
  v_anon bool; v_auth bool; v_svc bool;
begin
  select has_function_privilege('anon', p.oid, 'execute'),
         has_function_privilege('authenticated', p.oid, 'execute'),
         has_function_privilege('service_role', p.oid, 'execute')
    into v_anon, v_auth, v_svc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'event_dup_signals';

  if v_anon or v_auth then
    raise exception 'event_dup_signals is still reachable (anon=%, authenticated=%) — revoke did not take',
      v_anon, v_auth;
  end if;

  -- The one real caller must keep working: check-pipeline-health.mjs would
  -- otherwise start reporting the sentinel as broken, which is the failure this
  -- whole series exists to detect.
  if not v_svc then
    raise exception 'event_dup_signals is no longer callable by service_role — check-pipeline-health.mjs would go blind';
  end if;

  raise notice 'event_dup_signals: service_role only (anon=%, authenticated=%, service_role=%)', v_anon, v_auth, v_svc;
end
$verify$;
