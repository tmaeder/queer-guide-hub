-- Gated read path for release_gate_checks(), for the cockpit's "Broken" section.
--
-- The section reads release gates as the signed-in admin, but
-- release_gate_checks() grants EXECUTE only to postgres + service_role. Every
-- admin therefore got 42501 and the whole section rendered "Could not read
-- system status." (it refuses to fabricate a green light — the Release Gates
-- widget it replaced silently rendered "All gates clear" on the same failure).
--
-- The obvious fix — granting EXECUTE on the core to `authenticated` — would be
-- a real hole. release_gate_checks() is SECURITY DEFINER and does NOT self-gate,
-- and among other things it returns the ids of unverified crisis hotlines from
-- cms_pages. This repo has already been bitten once by a gated wrapper sitting
-- over a core that was itself callable; the core stays un-granted so this
-- wrapper is the ONLY authenticated path, and the gate lives here.
--
-- service_role is allowed through because scripts/check-data-quality-gates.mjs
-- runs the same checks in CI. Gate shape matches the house convention
-- (record_routine_progress, select_auto_dispatch_stories, …).

create or replace function public.admin_release_gates()
returns table (gate text, severity text, failures bigint, detail jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role])
    or auth.role() = 'service_role'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query select * from public.release_gate_checks();
end;
$$;

comment on function public.admin_release_gates() is
  'Admin/moderator-gated wrapper over release_gate_checks(). The core is SECURITY DEFINER and ungated, so it must never be granted to authenticated — call this instead.';

revoke all on function public.admin_release_gates() from public;
grant execute on function public.admin_release_gates() to authenticated, service_role;

-- Belt and braces: assert the ungated core did not pick up an authenticated
-- grant from a DEFAULT PRIVILEGES rule or a future linter "fix".
do $$
begin
  if has_function_privilege('authenticated', 'public.release_gate_checks()', 'EXECUTE') then
    raise exception
      'release_gate_checks() must not be executable by authenticated — it is SECURITY DEFINER and does not self-gate. Use admin_release_gates().';
  end if;
end $$;
