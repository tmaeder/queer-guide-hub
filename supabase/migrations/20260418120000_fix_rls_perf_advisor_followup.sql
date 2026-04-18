-- Follow-up to 20260417100000_rls_perf_fixes.sql — fix advisor warnings on 3 tables
-- added after that sweep: alert_integrations, pipeline_permissions, feedback_story_members.
--
-- Two issues addressed:
--   1. auth_rls_initplan — wrap auth.uid() as (select auth.uid()) so the planner
--      caches the result instead of re-evaluating per row.
--   2. multiple_permissive_policies — split FOR ALL admin policies into
--      INSERT/UPDATE/DELETE so they don't overlap with dedicated SELECT policies.

-- ============================================================================
-- alert_integrations — initplan wrap only (no SELECT overlap on this table)
-- ============================================================================
drop policy if exists "Admins manage integrations" on public.alert_integrations;
create policy "Admins manage integrations"
  on public.alert_integrations for all
  using ((select auth.uid()) in (select user_id from public.user_roles where role = 'admin'))
  with check ((select auth.uid()) in (select user_id from public.user_roles where role = 'admin'));

-- ============================================================================
-- pipeline_permissions — initplan wrap + split FOR ALL to remove SELECT overlap
-- ============================================================================
drop policy if exists "Admins manage permissions" on public.pipeline_permissions;
drop policy if exists "Users see own grants" on public.pipeline_permissions;

-- single SELECT policy: admin OR owner
create policy pipeline_permissions_select on public.pipeline_permissions
  for select using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

-- admin-only write paths split from FOR ALL
create policy pipeline_permissions_admin_insert on public.pipeline_permissions
  for insert with check (
    exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
  );
create policy pipeline_permissions_admin_update on public.pipeline_permissions
  for update using (
    exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
  ) with check (
    exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
  );
create policy pipeline_permissions_admin_delete on public.pipeline_permissions
  for delete using (
    exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
  );

-- ============================================================================
-- feedback_story_members — split FOR ALL to remove SELECT overlap
-- (no auth.uid() here — uses has_any_role_jwt which reads JWT claims directly)
-- ============================================================================
drop policy if exists story_members_admins_write on public.feedback_story_members;

create policy story_members_admins_insert on public.feedback_story_members
  for insert to authenticated
  with check (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));
create policy story_members_admins_update on public.feedback_story_members
  for update to authenticated
  using (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]))
  with check (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));
create policy story_members_admins_delete on public.feedback_story_members
  for delete to authenticated
  using (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));
