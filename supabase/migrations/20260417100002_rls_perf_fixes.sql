-- Performance hardening for RLS policies and indexes.
-- Addresses Supabase advisors: auth_rls_initplan, multiple_permissive_policies, duplicate_index.
-- Strategy:
--  1. Wrap auth.<fn>() calls with (select auth.<fn>()) so they are evaluated once per query.
--  2. Split "ALL" policies that conflict with a dedicated SELECT policy into INSERT/UPDATE/DELETE.
--  3. Drop service_role-gated ALL policies (service_role bypasses RLS anyway).
--  4. Drop duplicate indexes.

-- ============================================================================
-- trips
-- ============================================================================
drop policy if exists trips_select on public.trips;
drop policy if exists trips_select_owner on public.trips;
drop policy if exists trips_insert on public.trips;
drop policy if exists trips_update on public.trips;
drop policy if exists trips_delete on public.trips;

create policy trips_select on public.trips
  for select using (
    is_public = true
    or owner_id = (select auth.uid())
    or is_trip_member(id, (select auth.uid()))
  );
create policy trips_insert on public.trips
  for insert with check ((select auth.uid()) = owner_id);
create policy trips_update on public.trips
  for update using (can_edit_trip(id, (select auth.uid())));
create policy trips_delete on public.trips
  for delete using (owner_id = (select auth.uid()));

-- ============================================================================
-- trip_members
-- ============================================================================
drop policy if exists trip_members_select on public.trip_members;
drop policy if exists trip_members_insert on public.trip_members;
drop policy if exists trip_members_update on public.trip_members;
drop policy if exists trip_members_delete on public.trip_members;

create policy trip_members_select on public.trip_members
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_members_insert on public.trip_members
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_members_update on public.trip_members
  for update using (
    exists (
      select 1 from public.trip_members m
      where m.trip_id = trip_members.trip_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
    or (user_id = (select auth.uid()) and accepted_at is null)
  );
create policy trip_members_delete on public.trip_members
  for delete using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.trip_members m
      where m.trip_id = trip_members.trip_id
        and m.user_id = (select auth.uid())
        and m.role = 'owner'
    )
  );

-- ============================================================================
-- trip_days
-- ============================================================================
drop policy if exists trip_days_select on public.trip_days;
drop policy if exists trip_days_insert on public.trip_days;
drop policy if exists trip_days_update on public.trip_days;
drop policy if exists trip_days_delete on public.trip_days;

create policy trip_days_select on public.trip_days
  for select using (
    is_trip_member(trip_id, (select auth.uid()))
    or exists (select 1 from public.trips t where t.id = trip_days.trip_id and t.is_public)
  );
create policy trip_days_insert on public.trip_days
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_days_update on public.trip_days
  for update using (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_days_delete on public.trip_days
  for delete using (can_edit_trip(trip_id, (select auth.uid())));

-- ============================================================================
-- trip_places
-- ============================================================================
drop policy if exists trip_places_select on public.trip_places;
drop policy if exists trip_places_insert on public.trip_places;
drop policy if exists trip_places_update on public.trip_places;
drop policy if exists trip_places_delete on public.trip_places;

create policy trip_places_select on public.trip_places
  for select using (
    is_trip_member(trip_id, (select auth.uid()))
    or exists (select 1 from public.trips t where t.id = trip_places.trip_id and t.is_public)
  );
create policy trip_places_insert on public.trip_places
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_places_update on public.trip_places
  for update using (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_places_delete on public.trip_places
  for delete using (can_edit_trip(trip_id, (select auth.uid())));

-- ============================================================================
-- trip_shares
-- ============================================================================
drop policy if exists trip_shares_select on public.trip_shares;
drop policy if exists trip_shares_insert on public.trip_shares;
drop policy if exists trip_shares_delete on public.trip_shares;

create policy trip_shares_select on public.trip_shares
  for select using (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_shares_insert on public.trip_shares
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_shares_delete on public.trip_shares
  for delete using (can_edit_trip(trip_id, (select auth.uid())));

-- ============================================================================
-- trip_notes
-- ============================================================================
drop policy if exists trip_notes_select on public.trip_notes;
drop policy if exists trip_notes_insert on public.trip_notes;
drop policy if exists trip_notes_update on public.trip_notes;
drop policy if exists trip_notes_delete on public.trip_notes;

create policy trip_notes_select on public.trip_notes
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_notes_insert on public.trip_notes
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_notes_update on public.trip_notes
  for update using (author_id = (select auth.uid()) or can_edit_trip(trip_id, (select auth.uid())));
create policy trip_notes_delete on public.trip_notes
  for delete using (author_id = (select auth.uid()) or can_edit_trip(trip_id, (select auth.uid())));

-- ============================================================================
-- trip_polls
-- ============================================================================
drop policy if exists trip_polls_select on public.trip_polls;
drop policy if exists trip_polls_insert on public.trip_polls;
drop policy if exists trip_polls_update on public.trip_polls;
drop policy if exists trip_polls_delete on public.trip_polls;

create policy trip_polls_select on public.trip_polls
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_polls_insert on public.trip_polls
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_polls_update on public.trip_polls
  for update using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_polls_delete on public.trip_polls
  for delete using (author_id = (select auth.uid()));

-- ============================================================================
-- trip_messages
-- ============================================================================
drop policy if exists trip_messages_select on public.trip_messages;
drop policy if exists trip_messages_insert on public.trip_messages;
drop policy if exists trip_messages_update on public.trip_messages;
drop policy if exists trip_messages_delete on public.trip_messages;

create policy trip_messages_select on public.trip_messages
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_messages_insert on public.trip_messages
  for insert with check (is_trip_member(trip_id, (select auth.uid())));
create policy trip_messages_update on public.trip_messages
  for update using (sender_id = (select auth.uid()));
create policy trip_messages_delete on public.trip_messages
  for delete using (sender_id = (select auth.uid()));

-- ============================================================================
-- trip_budget_items
-- ============================================================================
drop policy if exists trip_budget_select on public.trip_budget_items;
drop policy if exists trip_budget_insert on public.trip_budget_items;
drop policy if exists trip_budget_update on public.trip_budget_items;
drop policy if exists trip_budget_delete on public.trip_budget_items;

create policy trip_budget_select on public.trip_budget_items
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_budget_insert on public.trip_budget_items
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_budget_update on public.trip_budget_items
  for update using (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_budget_delete on public.trip_budget_items
  for delete using (can_edit_trip(trip_id, (select auth.uid())));

-- ============================================================================
-- trip_reservations
-- ============================================================================
drop policy if exists trip_reservations_select on public.trip_reservations;
drop policy if exists trip_reservations_insert on public.trip_reservations;
drop policy if exists trip_reservations_update on public.trip_reservations;
drop policy if exists trip_reservations_delete on public.trip_reservations;

create policy trip_reservations_select on public.trip_reservations
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_reservations_insert on public.trip_reservations
  for insert with check (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_reservations_update on public.trip_reservations
  for update using (can_edit_trip(trip_id, (select auth.uid())));
create policy trip_reservations_delete on public.trip_reservations
  for delete using (can_edit_trip(trip_id, (select auth.uid())));

-- ============================================================================
-- trip_packing_items
-- ============================================================================
drop policy if exists trip_packing_select on public.trip_packing_items;
drop policy if exists trip_packing_insert on public.trip_packing_items;
drop policy if exists trip_packing_update on public.trip_packing_items;
drop policy if exists trip_packing_delete on public.trip_packing_items;

create policy trip_packing_select on public.trip_packing_items
  for select using (is_trip_member(trip_id, (select auth.uid())));
create policy trip_packing_insert on public.trip_packing_items
  for insert with check (is_trip_member(trip_id, (select auth.uid())));
create policy trip_packing_update on public.trip_packing_items
  for update using (
    user_id = (select auth.uid())
    or user_id is null
    or can_edit_trip(trip_id, (select auth.uid()))
  );
create policy trip_packing_delete on public.trip_packing_items
  for delete using (
    user_id = (select auth.uid())
    or user_id is null
    or can_edit_trip(trip_id, (select auth.uid()))
  );

-- ============================================================================
-- feedback
-- ============================================================================
drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback
  for update using (
    (select auth.uid()) in (
      select user_id from public.user_roles
      where role = any (array['admin'::app_role, 'moderator'::app_role])
    )
  );

-- ============================================================================
-- feedback_votes
-- ============================================================================
drop policy if exists "Authenticated users can vote" on public.feedback_votes;
drop policy if exists "Users can remove own votes" on public.feedback_votes;
create policy feedback_votes_insert on public.feedback_votes
  for insert with check ((select auth.uid()) = user_id);
create policy feedback_votes_delete on public.feedback_votes
  for delete using ((select auth.uid()) = user_id);

-- ============================================================================
-- contact_submissions
-- ============================================================================
drop policy if exists "Admins can view submissions" on public.contact_submissions;
create policy contact_submissions_admin_read on public.contact_submissions
  for select using (
    (select auth.uid()) in (
      select user_id from public.user_roles where role = 'admin'::app_role
    )
  );

-- ============================================================================
-- user_roles
-- ============================================================================
drop policy if exists "User roles insert" on public.user_roles;
drop policy if exists "User roles update" on public.user_roles;
drop policy if exists "User roles delete" on public.user_roles;

create policy user_roles_insert on public.user_roles
  for insert with check (has_role((select auth.uid()), 'admin'::app_role));
create policy user_roles_update on public.user_roles
  for update using (has_role((select auth.uid()), 'admin'::app_role));
create policy user_roles_delete on public.user_roles
  for delete using (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- bookings
-- ============================================================================
drop policy if exists "Users can view own bookings" on public.bookings;
drop policy if exists "Users can create own bookings" on public.bookings;
drop policy if exists "Users can update own bookings" on public.bookings;

create policy bookings_select_own on public.bookings
  for select using ((select auth.uid()) = user_id);
create policy bookings_insert_own on public.bookings
  for insert with check ((select auth.uid()) = user_id);
create policy bookings_update_own on public.bookings
  for update using ((select auth.uid()) = user_id);

-- ============================================================================
-- content_translations
-- Split admin ALL into non-SELECT policies so SELECT has only one policy.
-- ============================================================================
drop policy if exists "Admins can manage translations" on public.content_translations;
drop policy if exists "Published translations are publicly readable" on public.content_translations;

create policy content_translations_select on public.content_translations
  for select using (
    status = 'published'
    or exists (
      select 1 from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = any (array['admin'::app_role, 'moderator'::app_role])
    )
  );
create policy content_translations_admin_insert on public.content_translations
  for insert with check (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = any (array['admin'::app_role, 'moderator'::app_role])
    )
  );
create policy content_translations_admin_update on public.content_translations
  for update using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = any (array['admin'::app_role, 'moderator'::app_role])
    )
  );
create policy content_translations_admin_delete on public.content_translations
  for delete using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = any (array['admin'::app_role, 'moderator'::app_role])
    )
  );

-- ============================================================================
-- user_events
-- ============================================================================
drop policy if exists "Users can view own events" on public.user_events;
drop policy if exists "Users can insert own events" on public.user_events;

create policy user_events_select_own on public.user_events
  for select using ((select auth.uid()) = user_id);
create policy user_events_insert_own on public.user_events
  for insert with check ((select auth.uid()) = user_id or user_id is null);

-- ============================================================================
-- user_recommendations
-- ============================================================================
drop policy if exists "Users can view own recommendations" on public.user_recommendations;
create policy user_recommendations_select on public.user_recommendations
  for select using ((select auth.uid()) = user_id or session_id is not null);

-- ============================================================================
-- venue_sources: split admin ALL into non-SELECT to avoid overlap with read
-- ============================================================================
drop policy if exists venue_sources_admin_write on public.venue_sources;
create policy venue_sources_admin_insert on public.venue_sources
  for insert with check (has_role((select auth.uid()), 'admin'::app_role));
create policy venue_sources_admin_update on public.venue_sources
  for update using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy venue_sources_admin_delete on public.venue_sources
  for delete using (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- event_sources
-- ============================================================================
drop policy if exists event_sources_admin_write on public.event_sources;
create policy event_sources_admin_insert on public.event_sources
  for insert with check (has_role((select auth.uid()), 'admin'::app_role));
create policy event_sources_admin_update on public.event_sources
  for update using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy event_sources_admin_delete on public.event_sources
  for delete using (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- geo_sources
-- ============================================================================
drop policy if exists geo_sources_admin_write on public.geo_sources;
create policy geo_sources_admin_insert on public.geo_sources
  for insert with check (has_role((select auth.uid()), 'admin'::app_role));
create policy geo_sources_admin_update on public.geo_sources
  for update using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy geo_sources_admin_delete on public.geo_sources
  for delete using (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- ingestion_events / ingestion_dlq / dedup_decisions_feedback / data_ops_alerts
-- single ALL policy, no overlapping SELECT → just wrap auth.uid()
-- ============================================================================
drop policy if exists ingestion_events_admin_all on public.ingestion_events;
create policy ingestion_events_admin_all on public.ingestion_events
  for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists dlq_admin_all on public.ingestion_dlq;
create policy dlq_admin_all on public.ingestion_dlq
  for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists dedup_fb_admin_all on public.dedup_decisions_feedback;
create policy dedup_fb_admin_all on public.dedup_decisions_feedback
  for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists alerts_admin_all on public.data_ops_alerts;
create policy alerts_admin_all on public.data_ops_alerts
  for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- source_coverage_targets: split admin ALL, keep authenticated read
-- ============================================================================
drop policy if exists coverage_admin_all on public.source_coverage_targets;
create policy coverage_admin_insert on public.source_coverage_targets
  for insert with check (has_role((select auth.uid()), 'admin'::app_role));
create policy coverage_admin_update on public.source_coverage_targets
  for update using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));
create policy coverage_admin_delete on public.source_coverage_targets
  for delete using (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- Service-role gated ALL policies: service_role bypasses RLS, so these are
-- redundant AND cause multiple_permissive_policies warnings. Drop them.
-- ============================================================================
drop policy if exists marketplace_listing_sources_service_write on public.marketplace_listing_sources;
drop policy if exists marketplace_price_history_service_write on public.marketplace_price_history;
drop policy if exists personality_sources_service_write on public.personality_sources;
drop policy if exists fx_rates_service on public.fx_rates;
drop policy if exists marketplace_merchants_service on public.marketplace_merchants;

-- marketplace_merchants_admin_read uses auth.uid() → rewrap
drop policy if exists marketplace_merchants_admin_read on public.marketplace_merchants;
create policy marketplace_merchants_admin_read on public.marketplace_merchants
  for select using (
    exists (
      select 1 from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = 'admin'::app_role
    )
  );

-- ============================================================================
-- pipeline_errors: drop redundant "Admins can read pipeline errors"
-- (pipeline_errors_admin ALL already covers admin SELECT), keep ALL policy
-- but split into non-SELECT so it doesn't re-trigger the SELECT overlap.
-- Actually the overlap was with "Admins can read pipeline errors". Once that
-- is dropped, the ALL policy is the only SELECT policy for admins — fine.
-- ============================================================================
drop policy if exists "Admins can read pipeline errors" on public.pipeline_errors;
drop policy if exists pipeline_errors_admin on public.pipeline_errors;
create policy pipeline_errors_admin on public.pipeline_errors
  for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

-- ============================================================================
-- pipeline_node_templates
-- ============================================================================
drop policy if exists "Admins can manage templates" on public.pipeline_node_templates;
create policy pipeline_node_templates_admin_all on public.pipeline_node_templates
  for all
  using (
    (select auth.uid()) in (select user_id from public.user_roles where role = 'admin'::app_role)
  )
  with check (
    (select auth.uid()) in (select user_id from public.user_roles where role = 'admin'::app_role)
  );

-- ============================================================================
-- community_submissions: restrict "Anyone..." policies to anon only so they
-- don't overlap with authenticated policies.
-- ============================================================================
drop policy if exists "Anyone can read feedback submissions" on public.community_submissions;
drop policy if exists "Anyone can submit feedback" on public.community_submissions;

create policy community_submissions_anon_read_feedback on public.community_submissions
  for select to anon
  using (content_type = 'feedback');
create policy community_submissions_anon_insert_feedback on public.community_submissions
  for insert to anon
  with check (content_type = 'feedback');

-- ============================================================================
-- Duplicate indexes
-- ============================================================================
drop index if exists public.idx_pipeline_errors_function;
drop index if exists public.idx_user_events_session;
drop index if exists public.idx_user_events_user;
