-- Shim for the same drift class as #2013: `supabase.apply_migration`'s `name`
-- param is NOT the version — the MCP tool auto-generates the version from the
-- call's own timestamp and stores the passed `name` verbatim as the history
-- row's name. Applying #2018's fix live (intending name to match this repo's
-- file, 20260709100600_fix_marketplace_brands_anon_401) actually recorded
-- remote version 20260706042931 with that string as its *name* — a version
-- this repo had no file for, so plain `db push`'s drift guard ("Remote
-- migration versions not found in local migrations directory") skipped every
-- subsequent push, blocking deploy-supabase-functions.
--
-- This file exists purely so the local file list matches remote history for
-- version 20260706042931 — db push sees it as already-applied and moves on.
-- The canonically-versioned migration is
-- 20260709100600_fix_marketplace_brands_anon_401.sql (content identical;
-- `drop policy if exists` + `create policy` is idempotent, so both applying
-- is safe).

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
