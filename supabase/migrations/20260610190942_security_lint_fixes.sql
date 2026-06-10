-- Security lint remediation (Supabase advisors, 2026-06-10).
-- Covers: security_definer_view, rls_disabled_in_public, auth_rls_initplan,
-- multiple_permissive_policies, rls_policy_always_true, function_search_path_mutable,
-- materialized_view_in_api, pg_graphql exposure, anon-executable SECURITY DEFINER RPCs.
-- donor_wall stays SECURITY DEFINER on purpose: it exposes only safe columns of
-- completed, non-anonymous donations while the donations table itself stays locked.

-- 1) SECURITY DEFINER views -> security_invoker (admin/health views over tables
--    that already have their own RLS; admin UI queries them as authenticated).
alter view public.cities_admin set (security_invoker = true);
alter view public.personality_data_health set (security_invoker = true);
alter view public.news_quality_scorecard set (security_invoker = true);
alter view public.news_quality_source_health set (security_invoker = true);
revoke select on public.cities_admin from anon;
revoke select on public.personality_data_health from anon;
revoke select on public.news_quality_scorecard from anon;
revoke select on public.news_quality_source_health from anon;

-- 2) RLS on audit/backup tables (writers use service role, which bypasses RLS).
alter table public.geo_relink_audit enable row level security;
drop policy if exists geo_relink_audit_admin_read on public.geo_relink_audit;
create policy geo_relink_audit_admin_read on public.geo_relink_audit
  for select to authenticated
  using (has_any_role_jwt(array['admin'::app_role]));

alter table public.venue_dup_chain_fix_backup enable row level security;
drop policy if exists venue_dup_chain_fix_backup_admin_read on public.venue_dup_chain_fix_backup;
create policy venue_dup_chain_fix_backup_admin_read on public.venue_dup_chain_fix_backup
  for select to authenticated
  using (has_any_role_jwt(array['admin'::app_role]));

-- 3) auth_rls_initplan: wrap auth.uid() in scalar subselects so it evaluates once.
drop policy if exists news_feedback_admin_read on public.news_feedback_events;
create policy news_feedback_admin_read on public.news_feedback_events
  for select to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists venue_merge_audit_admin_read on public.venue_merge_audit;
create policy venue_merge_audit_admin_read on public.venue_merge_audit
  for select
  using (is_admin((select auth.uid())));

drop policy if exists city_merge_audit_admin_read on public.city_merge_audit;
create policy city_merge_audit_admin_read on public.city_merge_audit
  for select
  using (exists (
    select 1 from public.user_roles
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = 'admin'::app_role));

drop policy if exists urp_select_own_or_admin on public.user_role_permissions;
create policy urp_select_own_or_admin on public.user_role_permissions
  for select to authenticated
  using ((select auth.uid()) = user_id
         or has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists urp_admin_insert on public.user_role_permissions;
create policy urp_admin_insert on public.user_role_permissions
  for insert to authenticated
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists urp_admin_update on public.user_role_permissions;
create policy urp_admin_update on public.user_role_permissions
  for update to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists urp_admin_delete on public.user_role_permissions;
create policy urp_admin_delete on public.user_role_permissions
  for delete to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role));

-- 4) multiple_permissive_policies: split FOR ALL admin policies into write-only
--    policies so SELECT is served by exactly one policy per role.

-- personality_relationships (also initplan fix)
drop policy if exists pr_admin_write on public.personality_relationships;
create policy pr_admin_insert on public.personality_relationships
  for insert to authenticated
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy pr_admin_update on public.personality_relationships
  for update to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy pr_admin_delete on public.personality_relationships
  for delete to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role));

-- venue_history (also initplan fix)
drop policy if exists venue_history_admin_write on public.venue_history;
create policy venue_history_admin_insert on public.venue_history
  for insert to authenticated
  with check (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['admin'::app_role, 'editor'::app_role])));
create policy venue_history_admin_update on public.venue_history
  for update to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['admin'::app_role, 'editor'::app_role])))
  with check (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['admin'::app_role, 'editor'::app_role])));
create policy venue_history_admin_delete on public.venue_history
  for delete to authenticated
  using (exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['admin'::app_role, 'editor'::app_role])));

-- quality-signal / coverage / review-queue tables
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('city_coverage_gaps',    'ccg'),
      ('city_quality_signals',  'cqs'),
      ('city_review_queue',     'crq'),
      ('event_coverage_gaps',   'ecg'),
      ('event_quality_signals', 'eqs'),
      ('news_quality_signals',  'nqs')
    ) as v(tbl, pfx)
  loop
    execute format('drop policy if exists %I on public.%I', t.pfx || '_admin_write', t.tbl);
    execute format(
      $f$create policy %I on public.%I for insert to authenticated
         with check (has_any_role_jwt(array['admin'::app_role]))$f$,
      t.pfx || '_admin_insert', t.tbl);
    execute format(
      $f$create policy %I on public.%I for update to authenticated
         using (has_any_role_jwt(array['admin'::app_role]))
         with check (has_any_role_jwt(array['admin'::app_role]))$f$,
      t.pfx || '_admin_update', t.tbl);
    execute format(
      $f$create policy %I on public.%I for delete to authenticated
         using (has_any_role_jwt(array['admin'::app_role]))$f$,
      t.pfx || '_admin_delete', t.tbl);
  end loop;
end $$;

-- marketplace_brands: one merged SELECT policy + split admin writes
drop policy if exists marketplace_brands_admin_all on public.marketplace_brands;
drop policy if exists marketplace_brands_public_read on public.marketplace_brands;
create policy marketplace_brands_read on public.marketplace_brands
  for select
  using (status = 'approved'::text
         or has_role((select auth.uid()), 'admin'::app_role));
create policy marketplace_brands_admin_insert on public.marketplace_brands
  for insert to authenticated
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy marketplace_brands_admin_update on public.marketplace_brands
  for update to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy marketplace_brands_admin_delete on public.marketplace_brands
  for delete to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role));

-- 5) rls_policy_always_true: personality_profession_tags writes were open to any
--    signed-in user. Backfills run as service role (bypasses RLS); gate to admin.
drop policy if exists ppt_authenticated_insert on public.personality_profession_tags;
drop policy if exists ppt_authenticated_update on public.personality_profession_tags;
drop policy if exists ppt_authenticated_delete on public.personality_profession_tags;
create policy ppt_admin_insert on public.personality_profession_tags
  for insert to authenticated
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy ppt_admin_update on public.personality_profession_tags
  for update to authenticated
  using (has_any_role_jwt(array['admin'::app_role]))
  with check (has_any_role_jwt(array['admin'::app_role]));
create policy ppt_admin_delete on public.personality_profession_tags
  for delete to authenticated
  using (has_any_role_jwt(array['admin'::app_role]));

-- 6) function_search_path_mutable: pin search_path.
alter function public.marketplace_content_rating(text, text, text) set search_path = public, extensions;
alter function public.news_completeness_score(text, text, text, text, text, timestamptz, uuid, text[]) set search_path = public, extensions;
alter function public.find_nearest_city(double precision, double precision, uuid, numeric) set search_path = public, extensions;
alter function public.commit_venue_staging_item(uuid, text) set search_path = public, extensions;
alter function public.marketplace_department(text) set search_path = public, extensions;
alter function public.normalize_profession(text) set search_path = public, extensions;
alter function public.marketplace_normalize_brand(text) set search_path = public, extensions;
alter function public.marketplace_brand_name_signal(text) set search_path = public, extensions;
alter function public.run_marketplace_quality_recompute() set search_path = public, extensions;
alter function public.enforce_personality_is_living() set search_path = public, extensions;
alter function public.compose_safety_note(jsonb) set search_path = public, extensions;
alter function public.marketplace_listings_due_for_refresh(integer) set search_path = public, extensions;
alter function public.url_encode(text) set search_path = public, extensions;
alter function public.match_personality_city() set search_path = public, extensions;
alter function public.marketplace_completeness_score(text, text[], numeric, numeric, text, text) set search_path = public, extensions;

-- 7) materialized_view_in_api: mv_entity_popularity is read only via definer RPCs.
revoke select on public.mv_entity_popularity from anon, authenticated;

-- 8) pg_graphql endpoint is unused by the product (only external ILGA GraphQL
--    calls exist in code). Close the GraphQL API for client keys.
do $$
begin
  revoke usage on schema graphql_public from anon, authenticated;
  revoke execute on function graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb)
    from anon, authenticated;
exception when undefined_function or invalid_schema_name or undefined_object then
  null;
end $$;

-- 9) Admin/ops SECURITY DEFINER RPCs: not callable with the anon key.
--    Default EXECUTE is granted to PUBLIC, so revoke PUBLIC + anon and re-grant
--    authenticated (admin UI; functions self-gate or are read-only ops views)
--    and service_role (edge functions / crons).
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'admin_synonyms_counts','admin_synonyms_list',
        'approve_city_review','approve_marketplace_brand','approve_marketplace_review','approve_venue_review',
        'assert_search_hybrid_contract','assign_personality_profession_tags',
        'backfill_personality_geo','batch_approve_safe_city_reviews','build_personality_relationships',
        'cities_due_for_refresh','compute_city_completeness','countries_due_for_enrichment',
        'event_field_coverage','events_needing_moat_enrich',
        'marketplace_brands_pending','marketplace_due_for_tagging','marketplace_register_brands',
        'marketplace_guide_reading_streak','venue_guide_reading_streak',
        'news_due_for_refresh','personalities_nonperson_candidates','personality_quality_overview',
        'refresh_news_corroboration',
        'reject_city_review','reject_marketplace_brand','reject_marketplace_review','reject_venue_review',
        'release_gate_checks',
        'run_amenity_coverage_summary','run_city_completeness_recompute','run_city_coverage_radar',
        'run_city_safety_backfill','run_city_trust_recompute','run_country_completeness_recompute',
        'run_event_completeness_recompute','run_event_coverage_radar','run_event_inherit_moat_from_venue',
        'run_event_trust_recompute','run_hotel_safety_backfill','run_i18n_cron_auth_fix',
        'run_marketplace_ownership_apply','run_marketplace_review_autotriage','run_marketplace_tag_backfill',
        'run_marketplace_tag_coverage_summary','run_marketplace_tag_llm',
        'run_news_quality_recompute','run_news_trust_recompute','run_profession_normalize_backfill',
        'run_tag_assignment_reconcile','run_tag_quality_recompute','run_venue_coord_snap',
        'run_visibility_score_batch',
        'search_analytics_summary','search_analytics_top_queries','search_analytics_zero_results',
        'search_visibility_worst','tag_quality_scorecard','tags_due_for_category',
        'triage_stuck_city_safety_reviews','trust_safety_gate_status','unarchive_personality',
        'venue_quality_stats','venues_due_for_amenity_backfill','venues_due_for_refresh',
        'venues_misplaced','venues_needing_geocode'
      ])
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated, service_role', fn.sig);
  end loop;
end $$;

-- 10) Service-role-only functions: trigger functions (never called by clients)
--     and SECURITY DEFINER mutators with no internal role gate and no client use.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'capture_entity_link_feedback','capture_news_article_feedback',
        'venue_coord_guard','event_guides_refresh_pick_count','venue_guides_refresh_pick_count',
        'enforce_personality_is_living','intimate_report_to_moderation_flag',
        'archive_personality_as_nonperson','set_personhood_verdict','tune_news_source_reliability'
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end $$;
