-- event_dup_signals() was reachable by anon.
--
-- 20270822093816 created it SECURITY DEFINER and VOLATILE and issued no GRANT or
-- REVOKE at all, so it kept Postgres's default EXECUTE for PUBLIC. Measured on
-- prod: proacl reads `anon=X/postgres | authenticated=X/postgres`, and
-- has_function_privilege('anon', ...) is TRUE. A SECURITY DEFINER function runs
-- as its owner, so RLS does not apply to anything it touches, and any caller
-- holding only the public anon key could invoke it over the REST API.
--
-- This is what `check-anon-function-grants.mjs` exists to catch, and it did — it
-- has been failing the "Critical data-quality gates" job on every PR since
-- 20270822093816 landed, including unrelated ones, because that gate reads PROD
-- rather than the branch.
--
-- The only caller is scripts/check-pipeline-health.mjs, which authenticates with
-- the service role, so narrowing the grant costs nothing. Not an admin-console
-- function, so `assert_admin_or_internal()` is the wrong tool; not genuinely
-- public, so the allowlist is the wrong tool.
--
-- REVOKE FROM public, anon, authenticated — not `from anon` alone. That is a
-- no-op while PUBLIC holds the grant, and it is invisible in proacl: the anon
-- entry disappears while has_function_privilege() stays TRUE.

revoke execute on function public.event_dup_signals() from public, anon, authenticated;
grant  execute on function public.event_dup_signals() to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.event_dup_signals()', 'EXECUTE') then
    raise exception 'anon can still execute event_dup_signals()';
  end if;
  if not has_function_privilege('service_role', 'public.event_dup_signals()', 'EXECUTE') then
    raise exception 'service_role lost execute on event_dup_signals() — check-pipeline-health.mjs calls it';
  end if;
end $$;
