-- ============================================================================
-- personalities_due_for_adult_links was ANON-CALLABLE — revoke the roles
--
-- `revoke all on function ... from public` is a NO-OP for exposure in this
-- project: DEFAULT PRIVILEGES grant EXECUTE directly to the `anon` and
-- `authenticated` ROLES, and revoking from PUBLIC does not touch a
-- role-specific grant. Both the original grant block (20260815110116) and the
-- rewrite (20260815114759) used the PUBLIC form and so left the function open.
--
-- The 2-arg signature made it worse: 20260815114759 DROPped the 1-arg version
-- and created a new signature, and a newly-created function picks up default
-- privileges from scratch.
--
-- Measured before this migration — an anonymous POST to
-- /rest/v1/rpc/personalities_due_for_adult_links returned:
--
--   [{"id":"…","name":"Alex Neveo","slug":"alex-neveo","is_living":true, …}]
--
-- i.e. name, slug and living status for DRAFT adult performers — rows RLS
-- deliberately hides, and exactly the outing exposure this whole feature is
-- built to avoid. Same class as the `draft_personalities_leaked_to_crawlers`
-- and `anon_write_grants_rls_off` incidents.
--
-- Verified after: anon -> 401 42501, authenticated admin -> 403 42501, and the
-- pg_cron/service_role path still returns 200.
--
-- Rule: name the roles. `from public` is not a security boundary here.
--
-- Version note: applied live via MCP `apply_migration`, which stamps the
-- version from its own call timestamp; the filename matches that stamp so
-- `db push` matches by version and skips it.
-- ============================================================================

revoke all on function public.personalities_due_for_adult_links(int, text[]) from public;
revoke all on function public.personalities_due_for_adult_links(int, text[]) from anon;
revoke all on function public.personalities_due_for_adult_links(int, text[]) from authenticated;
grant execute on function public.personalities_due_for_adult_links(int, text[]) to service_role;
