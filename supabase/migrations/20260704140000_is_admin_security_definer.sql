-- is_admin() reads public.user_roles but was NOT security definer, unlike its
-- sibling has_role(). Any RLS policy TO public that references is_admin()
-- therefore errored with "permission denied for table user_roles" whenever
-- the anon role evaluated that branch (surfaced by the post-#1923 anon probe
-- on organizations; the same latent bug existed with the old
-- organizations_admin_all policy). Align with the has_role pattern.
-- Applied 2026-07-04 via MCP (repair --status applied) — CI will skip.
alter function public.is_admin(uuid) security definer;
