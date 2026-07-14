-- Supabase database-linter remediation (27 findings)
--   * auth_rls_initplan (15 WARN): wrap auth.uid() in (select auth.uid())
--   * multiple_permissive_policies (WARN): drop redundant FOR SELECT policies
--   * security_definer_view (3 ERROR): flip two views to invoker; refactor donor_wall
--   * rls_disabled_in_public (3 ERROR): enable RLS on stale backup tables
-- DB-only, no behavior change. donor_wall anon read path preserved.

-- =========================================================================
-- 1. auth_rls_initplan — re-evaluate auth.uid() once per statement
-- =========================================================================

-- kink_categories / kink_items / kink_taxonomy_versions
alter policy kink_categories_member_read on public.kink_categories
  using (is_active and public.is_intimate_eligible((select auth.uid())));

alter policy kink_items_member_read on public.kink_items
  using (is_active and public.is_intimate_eligible((select auth.uid())));

alter policy kink_taxonomy_versions_member_read on public.kink_taxonomy_versions
  using (public.is_intimate_eligible((select auth.uid())));

-- kink_ratings
alter policy kink_ratings_self_select on public.kink_ratings
  using (user_id = (select auth.uid()));

alter policy kink_ratings_self_insert on public.kink_ratings
  with check (user_id = (select auth.uid()) and public.is_intimate_eligible((select auth.uid())));

alter policy kink_ratings_self_update on public.kink_ratings
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_intimate_eligible((select auth.uid())));

alter policy kink_ratings_self_delete on public.kink_ratings
  using (user_id = (select auth.uid()));

-- kink_category_visibility
alter policy kink_visibility_self_select on public.kink_category_visibility
  using (user_id = (select auth.uid()));

alter policy kink_visibility_self_insert on public.kink_category_visibility
  with check (user_id = (select auth.uid()) and public.is_intimate_eligible((select auth.uid())));

alter policy kink_visibility_self_update on public.kink_category_visibility
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_intimate_eligible((select auth.uid())));

alter policy kink_visibility_self_delete on public.kink_category_visibility
  using (user_id = (select auth.uid()));

-- kink_grants
alter policy kink_grants_party_select on public.kink_grants
  using (grantor_id = (select auth.uid()) or grantee_id = (select auth.uid()));

alter policy kink_grants_grantor_insert on public.kink_grants
  with check (
    grantor_id = (select auth.uid())
    and public.is_intimate_eligible((select auth.uid()))
    and not public.intimate_is_blocked(grantor_id, grantee_id)
  );

alter policy kink_grants_grantor_update on public.kink_grants
  using (grantor_id = (select auth.uid()))
  with check (grantor_id = (select auth.uid()));

-- kink_share_links
alter policy kink_share_links_owner_select on public.kink_share_links
  using (owner_id = (select auth.uid()));

-- ntfy_subscriptions
alter policy "ntfy_subscriptions_select_own" on public.ntfy_subscriptions
  using ((select auth.uid()) = user_id);

-- =========================================================================
-- 2. multiple_permissive_policies — drop FOR SELECT that duplicates FOR ALL
-- =========================================================================

drop policy if exists "editorial_tasks_staff_select" on public.editorial_tasks;
drop policy if exists "personality_attachments_staff_select" on public.personality_attachments;

-- =========================================================================
-- 3. security_definer_view
-- =========================================================================

-- Safe to run as invoker: only definer indexer fns / service-role worker read
-- them, and base tables are anon-readable / already safety-gated in the view.
alter view public.tag_assignments_norm set (security_invoker = true);
alter view public.v_popular_entities set (security_invoker = true);

-- donor_wall: anon reads it while base `donations` is RLS-locked. Move the
-- safe-column projection into a definer function so the view can be invoker.
create or replace function public.donor_wall_rows()
returns table (
  id uuid, donor_name text, message text, amount integer,
  currency text, created_at timestamptz, donation_type text
)
language sql stable security definer set search_path = public
as $$
  select id, donor_name, message, amount, currency, created_at, donation_type
  from public.donations
  where status = 'completed' and is_anonymous = false;
$$;

drop view public.donor_wall;
create view public.donor_wall with (security_invoker = true, security_barrier = true) as
  select * from public.donor_wall_rows();

grant execute on function public.donor_wall_rows() to anon, authenticated;
grant select on public.donor_wall to anon, authenticated;

-- =========================================================================
-- 4. rls_disabled_in_public — lock down stale cleanup-backup tables
-- =========================================================================

alter table public.tag_sensitivity_cleanup_backup_20260618 enable row level security;
alter table public.news_tags_cleanup_backup_20260618 enable row level security;
alter table public.news_tag_cleanup_backup_20260619 enable row level security;
