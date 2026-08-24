-- RLS performance cleanup, part 1 of 2 (cost/efficiency audit, 2026-08-24).
--
-- `auth_rls_initplan`: 15 policies call `auth.uid()`/`auth.role()` directly in
-- their USING/WITH CHECK expression, so Postgres re-evaluates it once PER ROW
-- instead of once per statement. The fix -- wrapping the call in a scalar
-- subquery, `(select auth.uid())` -- is a pure perf win with IDENTICAL boolean
-- semantics (same fix already applied to every other entity family's RLS, e.g.
-- `guides_public_read`, `milestones_public_read`, `geo_places` "Public read").
-- The Guides family (added 2026-07-25) and a handful of newer admin-only tables
-- never got that pass. No access-control behavior changes here.
--
-- Left for a follow-up: `multiple_permissive_policies` (56 findings, same
-- advisor run) needs consolidating overlapping ALL+SELECT policies into one
-- per role/action -- that changes which policy expressions combine and is a
-- correctness-sensitive RLS rewrite, not a mechanical one, so it is
-- deliberately not bundled into this migration.

ALTER POLICY guide_reads_owner_delete ON public.guide_reads
  USING ((select auth.uid()) = user_id);
ALTER POLICY guide_reads_owner_insert ON public.guide_reads
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY guide_reads_owner_select ON public.guide_reads
  USING ((select auth.uid()) = user_id);
ALTER POLICY guide_reads_owner_update ON public.guide_reads
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY guide_participations_delete_own ON public.guide_participations
  USING (user_id = (select auth.uid()));
ALTER POLICY guide_participations_insert_own ON public.guide_participations
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY guide_participations_read_own ON public.guide_participations
  USING (user_id = (select auth.uid()));
ALTER POLICY guide_participations_update_own ON public.guide_participations
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY guide_contributions_read_own ON public.guide_contributions
  USING (user_id = (select auth.uid()));

ALTER POLICY milestone_link_proposals_admin_all ON public.milestone_link_proposals
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

ALTER POLICY milestone_links_admin_all ON public.milestone_links
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

ALTER POLICY milestones_admin_all ON public.milestones
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

ALTER POLICY org_link_suggestions_admin_read ON public.org_link_suggestions
  USING (is_admin((select auth.uid())));

ALTER POLICY vocab_merge_audit_admin_read ON public.vocab_merge_audit
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid()) AND ur.role = 'admin'::app_role
  ));

ALTER POLICY affiliate_conversions_service ON public.affiliate_conversions
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);
