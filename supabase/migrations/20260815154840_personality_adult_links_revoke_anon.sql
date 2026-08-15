-- RECOVERED from supabase_migrations.schema_migrations.statements on
-- 2026-08-15. This version was applied to prod but had no repo file, which is
-- the drift state that makes `supabase db push` skip silently and fails the
-- migration-versions gate on EVERY open PR until it is recovered (same flow as
-- #2760). Body is the applied SQL verbatim; only this header is added.
--
-- personalities_due_for_adult_links was anon-callable, leaking draft adult rows.
--
-- `revoke all on function ... from public` is a NO-OP for this project's
-- exposure: DEFAULT PRIVILEGES grant EXECUTE directly to the `anon` and
-- `authenticated` ROLES, and a revoke from PUBLIC does not touch a
-- role-specific grant. Measured: an anon POST to
-- /rest/v1/rpc/personalities_due_for_adult_links returned name, slug and
-- is_living for DRAFT adult performers — rows RLS deliberately hides, and
-- precisely the outing exposure this feature exists to avoid.
--
-- The revokes have to name the roles explicitly.

revoke all on function public.personalities_due_for_adult_links(int, text[]) from public;
revoke all on function public.personalities_due_for_adult_links(int, text[]) from anon;
revoke all on function public.personalities_due_for_adult_links(int, text[]) from authenticated;
grant execute on function public.personalities_due_for_adult_links(int, text[]) to service_role;
