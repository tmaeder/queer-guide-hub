-- Advisor-driven RLS cleanup (Supabase performance advisors, 2026-07-03).
-- Generated against live pg_policies definitions.
--
-- 1) auth_rls_initplan (WARN x15): wrap auth.uid()/auth.role() in scalar
--    subselects so Postgres evaluates them once per statement instead of once
--    per row.
-- 2) multiple_permissive_policies (WARN x36): drop the no-op service_role
--    policy on chatgpt_oauth_tokens (service_role has BYPASSRLS), fold the
--    organizations admin SELECT into the public read policy, split *_admin_write
--    FOR ALL policies into per-action policies where a separate read policy
--    already covers SELECT, and merge the two user_activity_events SELECT
--    policies.
-- 3) Drop five June-2026 one-off operation backup tables (no primary keys,
--    flagged by advisors; row counts recorded in the PR). delete_my_account()
--    referenced one of them and is re-created without that reference FIRST —
--    plpgsql resolves tables at runtime, so dropping without this would break
--    every GDPR account deletion.

-- ---------------------------------------------------------------------------
-- 1) initplan fixes (ALTER POLICY keeps cmd/roles/permissive untouched)
-- ---------------------------------------------------------------------------

alter policy tag_follows_select_own on public.tag_follows
  using ((select auth.uid()) = user_id);
alter policy tag_follows_insert_own on public.tag_follows
  with check ((select auth.uid()) = user_id);
alter policy tag_follows_delete_own on public.tag_follows
  using ((select auth.uid()) = user_id);

alter policy "Invitees and inviters read invites" on public.group_invites
  using (
    ((select auth.uid()) = invited_by)
    or ((select auth.uid()) = invited_user_id)
    or is_group_admin_or_mod(group_id, (select auth.uid()))
  );
alter policy "Members create invites" on public.group_invites
  with check (
    ((select auth.uid()) = invited_by)
    and exists (
      select 1 from group_memberships gm
      where gm.group_id = group_invites.group_id
        and gm.user_id = (select auth.uid())
    )
  );

alter policy eea_admin_all on public.entity_existence_audit
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

alter policy entity_merge_audit_admin_read on public.entity_merge_audit
  using (
    exists (
      select 1 from user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'::app_role
    )
  );

alter policy trip_destinations_select on public.trip_destinations
  using (
    is_trip_member(trip_id, (select auth.uid()))
    or exists (
      select 1 from trips t
      where t.id = trip_destinations.trip_id and t.is_public
    )
  );
alter policy trip_destinations_insert on public.trip_destinations
  with check (can_edit_trip(trip_id, (select auth.uid())));
alter policy trip_destinations_update on public.trip_destinations
  using (can_edit_trip(trip_id, (select auth.uid())));
alter policy trip_destinations_delete on public.trip_destinations
  using (can_edit_trip(trip_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 2) multiple permissive policies
-- ---------------------------------------------------------------------------

-- chatgpt_oauth_tokens: the service_role policy is a no-op (service_role has
-- BYPASSRLS — verified live) and doubled every action for every role. One
-- admin policy remains, restricted to authenticated (anon is never admin).
drop policy if exists chatgpt_oauth_service_role on public.chatgpt_oauth_tokens;
drop policy if exists chatgpt_oauth_admin_only on public.chatgpt_oauth_tokens;
create policy chatgpt_oauth_admin_only on public.chatgpt_oauth_tokens
  for all to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = 'admin'::app_role
    )
  )
  with check (
    exists (
      select 1 from user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = 'admin'::app_role
    )
  );

-- organizations: fold the admin SELECT into the read policy (admins keep
-- seeing non-active/gated rows) and replace the FOR ALL admin policy with
-- per-action policies. The safety-gating clause is load-bearing: anon must
-- never see safety_gated rows (criminalizing/death-penalty destinations).
alter policy organizations_public_read on public.organizations
  using (
    (status = 'active' and ((not safety_gated) or (select auth.uid()) is not null))
    or is_admin((select auth.uid()))
  );
drop policy if exists organizations_admin_all on public.organizations;
create policy organizations_admin_insert on public.organizations
  for insert to authenticated
  with check (is_admin((select auth.uid())));
create policy organizations_admin_update on public.organizations
  for update to authenticated
  using (is_admin((select auth.uid())))
  with check (is_admin((select auth.uid())));
create policy organizations_admin_delete on public.organizations
  for delete to authenticated
  using (is_admin((select auth.uid())));

-- *_admin_write FOR ALL overlapped the dedicated *_read SELECT policies
-- (admins are covered by the read policies, which include the admin role).
-- Split into per-action write policies.
drop policy if exists ees_admin_write on public.entity_existence_signals;
create policy ees_admin_insert on public.entity_existence_signals
  for insert to authenticated
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy ees_admin_update on public.entity_existence_signals
  for update to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy ees_admin_delete on public.entity_existence_signals
  for delete to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists vcg_admin_write on public.village_coverage_gaps;
create policy vcg_admin_insert on public.village_coverage_gaps
  for insert to authenticated
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy vcg_admin_update on public.village_coverage_gaps
  for update to authenticated
  using (has_any_role_jwt(array['admin'::app_role]))
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy vcg_admin_delete on public.village_coverage_gaps
  for delete to authenticated
  using (has_any_role_jwt(array['admin'::app_role]));

drop policy if exists vqs_admin_write on public.village_quality_signals;
create policy vqs_admin_insert on public.village_quality_signals
  for insert to authenticated
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy vqs_admin_update on public.village_quality_signals
  for update to authenticated
  using (has_any_role_jwt(array['admin'::app_role]))
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy vqs_admin_delete on public.village_quality_signals
  for delete to authenticated
  using (has_any_role_jwt(array['admin'::app_role]));

drop policy if exists vrq_admin_write on public.village_review_queue;
create policy vrq_admin_insert on public.village_review_queue
  for insert to authenticated
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy vrq_admin_update on public.village_review_queue
  for update to authenticated
  using (has_any_role_jwt(array['admin'::app_role]))
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy vrq_admin_delete on public.village_review_queue
  for delete to authenticated
  using (has_any_role_jwt(array['admin'::app_role]));

drop policy if exists roadmap_items_admins_write on public.roadmap_items;
create policy roadmap_items_admins_insert on public.roadmap_items
  for insert to authenticated
  with check (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));
create policy roadmap_items_admins_update on public.roadmap_items
  for update to authenticated
  using (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]))
  with check (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));
create policy roadmap_items_admins_delete on public.roadmap_items
  for delete to authenticated
  using (has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));

-- user_activity_events: two permissive SELECT policies -> one.
drop policy if exists user_activity_events_optin_select on public.user_activity_events;
drop policy if exists user_activity_events_self_select on public.user_activity_events;
create policy user_activity_events_select on public.user_activity_events
  for select to authenticated
  using (can_view_user_activity(user_id) or (select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3) drop June-2026 operation backup tables (GDPR function fixed first)
-- ---------------------------------------------------------------------------

-- Re-create delete_my_account without the tag_adult_false_positive_backup
-- reference (body otherwise verbatim from the live definition).
create or replace function public.delete_my_account(p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_profiles int := 0;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from trip_members           where user_id = p_user_id;
  update events               set created_by = null where created_by = p_user_id;
  update marketplace_listings set created_by = null where created_by = p_user_id;
  update venues               set created_by = null where created_by = p_user_id;
  update review_queue         set resolved_by = null where resolved_by = p_user_id;
  update group_invites        set accepted_by = null where accepted_by = p_user_id;
  delete from access_logs            where user_id = p_user_id;
  delete from calendar_feed_tokens   where user_id = p_user_id;
  delete from city_favorites         where user_id = p_user_id;
  delete from contact_submissions    where user_id = p_user_id;
  delete from country_favorites      where user_id = p_user_id;
  delete from event_favorites        where user_id = p_user_id;
  delete from import_audit_log       where user_id = p_user_id;
  delete from import_jobs_enhanced   where user_id = p_user_id;
  delete from news_favorites         where user_id = p_user_id;
  delete from notifications          where user_id = p_user_id;
  delete from push_notification_logs where user_id = p_user_id;
  delete from search_queries         where user_id = p_user_id;
  delete from tag_favorites          where user_id = p_user_id;
  delete from user_photos            where user_id = p_user_id;
  delete from user_push_tokens       where user_id = p_user_id;
  delete from user_sessions          where user_id = p_user_id;
  delete from venue_checkins         where user_id = p_user_id;
  delete from venue_favorites        where user_id = p_user_id;
  delete from profiles_audit_log     where profile_user_id = p_user_id;
  update community_groups    set created_by  = null where created_by  = p_user_id;
  update organizations       set claimed_by  = null where claimed_by  = p_user_id;
  update videos              set created_by  = null where created_by  = p_user_id;
  update ingestion_staging   set reviewed_by = null where reviewed_by = p_user_id;
  update tag_suggestions     set reviewed_by = null where reviewed_by = p_user_id;
  update news_feedback_events set actor_id   = null where actor_id    = p_user_id;
  update profiles_audit_log  set accessing_user_id = null where accessing_user_id = p_user_id;
  update role_audit_logs     set performed_by   = null where performed_by   = p_user_id;
  update role_audit_logs     set target_user_id = null where target_user_id = p_user_id;
  update role_audit_logs     set user_id        = null where user_id        = p_user_id;
  update user_role_audit_log set admin_user_id  = null where admin_user_id  = p_user_id;
  update user_role_audit_log set target_user_id = null where target_user_id = p_user_id;
  update security_events      set user_id        = null where user_id        = p_user_id;
  update security_monitoring  set user_id        = null where user_id        = p_user_id;
  update security_monitoring  set target_user_id = null where target_user_id = p_user_id;
  update suspicious_activities set user_id       = null where user_id        = p_user_id;
  delete from profiles where user_id = p_user_id;
  get diagnostics v_profiles = row_count;
  return jsonb_build_object('user_id', p_user_id, 'deleted_at', now(), 'profile_deleted', v_profiles);
end; $function$;

drop table if exists public.personalities_stock_image_backup_20260623;
drop table if exists public.personalities_mislabeled_img_backup_20260623;
drop table if exists public.personality_mislabeled_asset_links_backup_20260623;
drop table if exists public.personality_stock_asset_links_backup_20260623;
drop table if exists public.tag_adult_false_positive_backup;
