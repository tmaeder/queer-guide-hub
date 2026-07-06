-- Fix: anon SELECT on public.marketplace_brands returned 401
-- "permission denied for function has_role" (42501).
--
-- 20260610190942_security_lint_fixes.sql wired these 4 policies to the
-- deprecated public.has_role(uuid, app_role), which only has EXECUTE
-- granted to authenticated/service_role, not anon. Every other table in
-- that same migration correctly used has_any_role_jwt()/has_role_jwt(),
-- which anon does have EXECUTE on (reads the role off the JWT claim,
-- no user_roles lookup). Swap marketplace_brands to match.

drop policy if exists marketplace_brands_read on public.marketplace_brands;
create policy marketplace_brands_read on public.marketplace_brands
  for select
  using (status = 'approved'::text
         or has_role_jwt('admin'::app_role));

drop policy if exists marketplace_brands_admin_insert on public.marketplace_brands;
create policy marketplace_brands_admin_insert on public.marketplace_brands
  for insert to authenticated
  with check (has_role_jwt('admin'::app_role));

drop policy if exists marketplace_brands_admin_update on public.marketplace_brands;
create policy marketplace_brands_admin_update on public.marketplace_brands
  for update to authenticated
  using (has_role_jwt('admin'::app_role))
  with check (has_role_jwt('admin'::app_role));

drop policy if exists marketplace_brands_admin_delete on public.marketplace_brands;
create policy marketplace_brands_admin_delete on public.marketplace_brands
  for delete to authenticated
  using (has_role_jwt('admin'::app_role));
