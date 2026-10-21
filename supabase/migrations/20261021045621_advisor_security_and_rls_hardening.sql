-- Recovered verbatim from production migration history; already applied.
-- Resolve the actionable findings in the 2026-10-21 advisor exports.
-- Public/user/staff RPCs that deliberately enforce authorization retain their grants.
SET lock_timeout = '5s';
SET statement_timeout = '90s';

-- The app uses REST/RPC; no GraphQL clients exist in src/functions/workers.
-- No CASCADE: unexpected external dependencies must stop the migration.
DROP EXTENSION IF EXISTS pg_graphql;

ALTER FUNCTION public."logo_platform_domain_matches"(p_host text, p_match_mode text, p_value text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."medical_code_entity_class_verdict"(p_classes text[]) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."tag_has_prose"(p_description text, p_short_description text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."marketplace_subcategory_group"(p_subcategory text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."marketplace_subcategory_fine"(p_subcategory text, p_title text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."marketplace_mark_quality_dirty"() SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."city_place_class_verdict"(p_classes text[]) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."website_host"(p_url text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."platform_website_class"(p_url text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."logo_mark_sha256"(p_logo_url text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public."logo_mark_denied"(p_logo_url text) SET search_path = pg_catalog, public, extensions;

-- Direct RPC access to secrets, digest recipients, internal vectors and mission
-- calculations is unnecessary. Their SECURITY DEFINER callers keep working.
REVOKE EXECUTE ON FUNCTION public."match_content_embeddings"(query_embedding vector, similarity_threshold double precision, match_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_content_embeddings"(query_embedding vector, similarity_threshold double precision, match_count integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public."intimate_profile_key"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."intimate_profile_key"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."prune_satisfied_geo_address_queue"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."prune_satisfied_geo_address_queue"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."compute_user_missions"(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."compute_user_missions"(p_user_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public."zz_dump2"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."zz_dump2"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) TO service_role;
REVOKE EXECUTE ON FUNCTION public."tg_countries_sync_image_assets"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."tg_countries_sync_image_assets"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."marketplace_fill_image_alt_text"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."marketplace_fill_image_alt_text"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."marketplace_listings_ensure_merchant"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."marketplace_listings_ensure_merchant"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."propagate_venue_gate_to_organization"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."propagate_venue_gate_to_organization"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."marketplace_record_quality_change"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."marketplace_record_quality_change"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."marketplace_rollout_count_event"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."marketplace_rollout_count_event"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."marketplace_normalize_quality_snapshot"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."marketplace_normalize_quality_snapshot"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."marketplace_worker_registry_alert"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."marketplace_worker_registry_alert"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."cities_merge_redirect"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."cities_merge_redirect"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."dm_digest_candidates"(p_min_age_hours integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."dm_digest_candidates"(p_min_age_hours integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public."tg_marketplace_refresh_overview_from_listing"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."tg_marketplace_refresh_overview_from_listing"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."tg_marketplace_refresh_overview_from_link"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."tg_marketplace_refresh_overview_from_link"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."tg_marketplace_refresh_overview_from_asset"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."tg_marketplace_refresh_overview_from_asset"() TO service_role;
REVOKE EXECUTE ON FUNCTION public."zz_dump3"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."zz_dump3"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) TO service_role;
REVOKE EXECUTE ON FUNCTION public."zz_dump4"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."zz_dump4"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) TO service_role;
REVOKE EXECUTE ON FUNCTION public."zz_dump5"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."zz_dump5"(p_queue_types text[], p_content_types text[], p_search text, p_sort text, p_page integer, p_per_page integer, p_scope text) TO service_role;

-- A public bucket serves known object URLs without permitting bucket listing.
DROP POLICY IF EXISTS brand_storage_public_read ON storage.objects;

-- Replace only bare auth calls; calls already in SELECT initplans stay intact.
ALTER POLICY "taxonomy_staff_insert" ON "public"."venue_services" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."venue_services" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."venue_services" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."venue_services" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "tag_workbook_answers_self_delete" ON "public"."tag_workbook_answers" USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "tag_workbook_answers_self_insert" ON "public"."tag_workbook_answers" WITH CHECK (((user_id = (SELECT auth.uid())) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "tag_workbook_answers_self_select" ON "public"."tag_workbook_answers" USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "tag_workbook_answers_self_update" ON "public"."tag_workbook_answers" USING ((user_id = (SELECT auth.uid()))) WITH CHECK (((user_id = (SELECT auth.uid())) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "tag_workbook_progress_self_delete" ON "public"."tag_workbook_progress" USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "tag_workbook_progress_self_insert" ON "public"."tag_workbook_progress" WITH CHECK (((user_id = (SELECT auth.uid())) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "tag_workbook_progress_self_select" ON "public"."tag_workbook_progress" USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "tag_workbook_progress_self_update" ON "public"."tag_workbook_progress" USING ((user_id = (SELECT auth.uid()))) WITH CHECK (((user_id = (SELECT auth.uid())) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_insert" ON "public"."event_services" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."event_services" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."event_services" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."event_services" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_intimate_revision_read" ON "public"."content_revisions" USING (((source_table <> ALL (ARRAY['kink_categories'::text, 'kink_items'::text])) OR is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_insert" ON "public"."marketplace_categories" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."marketplace_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."marketplace_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."marketplace_categories" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."amenities" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."amenities" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."amenities" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."amenities" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."event_amenities" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."event_amenities" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."event_amenities" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."event_amenities" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."accessibility_attributes" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."accessibility_attributes" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."accessibility_attributes" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."accessibility_attributes" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."event_categories" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."event_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."event_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."event_categories" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."tag_categories" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."tag_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."tag_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."tag_categories" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."news_categories" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."news_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."news_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."news_categories" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."event_types" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."event_types" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."event_types" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."event_types" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."target_groups" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."target_groups" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."target_groups" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."target_groups" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."professions" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."professions" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."professions" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."professions" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_insert" ON "public"."kink_categories" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_read" ON "public"."kink_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_update" ON "public"."kink_categories" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_write_floor" ON "public"."kink_categories" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_insert" ON "public"."kink_items" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_read" ON "public"."kink_items" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_update" ON "public"."kink_items" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_write_floor" ON "public"."kink_items" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))));
ALTER POLICY "taxonomy_staff_insert" ON "public"."taxonomy_terms" WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_read" ON "public"."taxonomy_terms" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_staff_update" ON "public"."taxonomy_terms" USING ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
ALTER POLICY "taxonomy_write_floor" ON "public"."taxonomy_terms" USING (true) WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- This invoker helper defers planning authenticated-only has_role() calls
-- until after the role check. A CASE in the policy alone cannot defer ACL
-- checks performed while the executor initializes the entire expression.
CREATE OR REPLACE FUNCTION public.tag_sources_staff_read()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $helper$
BEGIN
  IF NOT pg_catalog.pg_has_role(current_user, 'authenticated', 'USAGE') THEN
    RETURN false;
  END IF;
  RETURN public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'moderator'::public.app_role);
END;
$helper$;
REVOKE ALL ON FUNCTION public.tag_sources_staff_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tag_sources_staff_read() TO anon, authenticated, service_role;

-- Consolidate permissive policies with PostgreSQL's original OR semantics.
-- Keep USING and WITH CHECK independent, including implicit CHECK = USING.
-- Restrictive policies (including taxonomy consent floors) are left in place.
-- Role guards preserve each original policy's applicability when role sets differ.

-- affiliate_conversions
DROP POLICY "affiliate_conversions_admin_read" ON public."affiliate_conversions";
DROP POLICY "affiliate_conversions_service" ON public."affiliate_conversions";
CREATE POLICY "advisor_select" ON public."affiliate_conversions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role_jwt('admin'::app_role)) OR ((( SELECT auth.role() AS role) = 'service_role'::text)));
CREATE POLICY "advisor_insert" ON public."affiliate_conversions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((( SELECT auth.role() AS role) = 'service_role'::text)));
CREATE POLICY "advisor_update" ON public."affiliate_conversions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((( SELECT auth.role() AS role) = 'service_role'::text))) WITH CHECK (((( SELECT auth.role() AS role) = 'service_role'::text)));
CREATE POLICY "advisor_delete" ON public."affiliate_conversions" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((( SELECT auth.role() AS role) = 'service_role'::text)));

-- audit_entity_registry
DROP POLICY "audit_entity_registry_read" ON public."audit_entity_registry";
DROP POLICY "audit_entity_registry_write" ON public."audit_entity_registry";
CREATE POLICY "advisor_select" ON public."audit_entity_registry" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_insert" ON public."audit_entity_registry" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_update" ON public."audit_entity_registry" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_delete" ON public."audit_entity_registry" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role])));

-- entity_review_queue
DROP POLICY "erq_read" ON public."entity_review_queue";
DROP POLICY "erq_write" ON public."entity_review_queue";
CREATE POLICY "advisor_select" ON public."entity_review_queue" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_insert" ON public."entity_review_queue" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_update" ON public."entity_review_queue" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_delete" ON public."entity_review_queue" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role])));

-- guide_picks
DROP POLICY "guide_picks_admin_all" ON public."guide_picks";
DROP POLICY "guide_picks_public_read" ON public."guide_picks";
CREATE POLICY "advisor_select" ON public."guide_picks" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role_jwt('admin'::app_role)) OR (((NOT is_orphaned) AND (EXISTS ( SELECT 1
   FROM guides g
  WHERE ((g.id = guide_picks.guide_id) AND (g.status = 'published'::text) AND ((NOT g.safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL))))))));
CREATE POLICY "advisor_insert" ON public."guide_picks" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."guide_picks" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."guide_picks" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_role_jwt('admin'::app_role)));

-- guide_sections
DROP POLICY "guide_sections_admin_all" ON public."guide_sections";
DROP POLICY "guide_sections_public_read" ON public."guide_sections";
CREATE POLICY "advisor_select" ON public."guide_sections" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role_jwt('admin'::app_role)) OR ((EXISTS ( SELECT 1
   FROM guides g
  WHERE ((g.id = guide_sections.guide_id) AND (g.status = 'published'::text) AND ((NOT g.safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL)))))));
CREATE POLICY "advisor_insert" ON public."guide_sections" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."guide_sections" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."guide_sections" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_role_jwt('admin'::app_role)));

-- guides
DROP POLICY "guides_admin_all" ON public."guides";
DROP POLICY "guides_public_read" ON public."guides";
CREATE POLICY "advisor_select" ON public."guides" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role_jwt('admin'::app_role)) OR (((status = 'published'::text) AND ((NOT safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL)))));
CREATE POLICY "advisor_insert" ON public."guides" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."guides" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."guides" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_role_jwt('admin'::app_role)));

-- marketplace_listing_variants
DROP POLICY "Service role manages variants" ON public."marketplace_listing_variants";
DROP POLICY "Variants are publicly readable" ON public."marketplace_listing_variants";
CREATE POLICY "advisor_select" ON public."marketplace_listing_variants" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((( SELECT auth.role() AS role) = 'service_role'::text)) OR (true));
CREATE POLICY "advisor_insert" ON public."marketplace_listing_variants" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((( SELECT auth.role() AS role) = 'service_role'::text)));
CREATE POLICY "advisor_update" ON public."marketplace_listing_variants" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((( SELECT auth.role() AS role) = 'service_role'::text))) WITH CHECK (((( SELECT auth.role() AS role) = 'service_role'::text)));
CREATE POLICY "advisor_delete" ON public."marketplace_listing_variants" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((( SELECT auth.role() AS role) = 'service_role'::text)));

-- milestone_links
DROP POLICY "milestone_links_admin_all" ON public."milestone_links";
DROP POLICY "milestone_links_public_read" ON public."milestone_links";
CREATE POLICY "advisor_select" ON public."milestone_links" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_admin(( SELECT auth.uid() AS uid))) OR ((EXISTS ( SELECT 1
   FROM milestones m
  WHERE ((m.id = milestone_links.milestone_id) AND (m.status = 'published'::text) AND ((NOT m.safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL)))))));
CREATE POLICY "advisor_insert" ON public."milestone_links" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((is_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "advisor_update" ON public."milestone_links" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((is_admin(( SELECT auth.uid() AS uid)))) WITH CHECK ((is_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "advisor_delete" ON public."milestone_links" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((is_admin(( SELECT auth.uid() AS uid))));

-- milestones
DROP POLICY "milestones_admin_all" ON public."milestones";
DROP POLICY "milestones_public_read" ON public."milestones";
CREATE POLICY "advisor_select" ON public."milestones" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_admin(( SELECT auth.uid() AS uid))) OR (((status = 'published'::text) AND ((NOT safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL)))));
CREATE POLICY "advisor_insert" ON public."milestones" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((is_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "advisor_update" ON public."milestones" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((is_admin(( SELECT auth.uid() AS uid)))) WITH CHECK ((is_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "advisor_delete" ON public."milestones" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((is_admin(( SELECT auth.uid() AS uid))));

-- pipeline_explanations
DROP POLICY "pipeline_explanations_read" ON public."pipeline_explanations";
DROP POLICY "pipeline_explanations_write" ON public."pipeline_explanations";
CREATE POLICY "advisor_select" ON public."pipeline_explanations" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_insert" ON public."pipeline_explanations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_update" ON public."pipeline_explanations" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role])));
CREATE POLICY "advisor_delete" ON public."pipeline_explanations" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role])));

-- accessibility_attributes
DROP POLICY "Public read access for accessibility_attributes" ON public."accessibility_attributes";
DROP POLICY "taxonomy_staff_insert" ON public."accessibility_attributes";
DROP POLICY "taxonomy_staff_read" ON public."accessibility_attributes";
DROP POLICY "taxonomy_staff_update" ON public."accessibility_attributes";
CREATE POLICY "advisor_select" ON public."accessibility_attributes" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."accessibility_attributes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."accessibility_attributes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));

-- amenities
DROP POLICY "Public read access" ON public."amenities";
DROP POLICY "taxonomy_staff_insert" ON public."amenities";
DROP POLICY "taxonomy_staff_read" ON public."amenities";
DROP POLICY "taxonomy_staff_update" ON public."amenities";
CREATE POLICY "advisor_select" ON public."amenities" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."amenities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."amenities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));

-- competitions
DROP POLICY "competition_taxonomy_staff_insert" ON public."competitions";
DROP POLICY "competition_taxonomy_staff_read" ON public."competitions";
DROP POLICY "competition_taxonomy_staff_update" ON public."competitions";
DROP POLICY "competitions_public_read" ON public."competitions";
CREATE POLICY "advisor_select" ON public."competitions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."competitions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_update" ON public."competitions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- cultural_assignments
DROP POLICY "cultural_assignments_admin_all" ON public."cultural_assignments";
DROP POLICY "cultural_assignments_public_read" ON public."cultural_assignments";
CREATE POLICY "advisor_select" ON public."cultural_assignments" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR ((status = 'approved'::text)));
CREATE POLICY "advisor_insert" ON public."cultural_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."cultural_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."cultural_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- cultural_claims
DROP POLICY "cultural_claims_admin_all" ON public."cultural_claims";
DROP POLICY "cultural_claims_public_read" ON public."cultural_claims";
CREATE POLICY "advisor_select" ON public."cultural_claims" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM cultural_nodes n
  WHERE ((n.id = cultural_claims.subject_node_id) AND (n.status = 'published'::text) AND (n.sensitivity = 'standard'::text)))))));
CREATE POLICY "advisor_insert" ON public."cultural_claims" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."cultural_claims" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."cultural_claims" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- cultural_edges
DROP POLICY "cultural_edges_admin_all" ON public."cultural_edges";
DROP POLICY "cultural_edges_public_read" ON public."cultural_edges";
CREATE POLICY "advisor_select" ON public."cultural_edges" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR ((status = 'published'::text)));
CREATE POLICY "advisor_insert" ON public."cultural_edges" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."cultural_edges" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."cultural_edges" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- cultural_nodes
DROP POLICY "cultural_nodes_admin_all" ON public."cultural_nodes";
DROP POLICY "cultural_nodes_public_read" ON public."cultural_nodes";
CREATE POLICY "advisor_select" ON public."cultural_nodes" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR ((status = 'published'::text)));
CREATE POLICY "advisor_insert" ON public."cultural_nodes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."cultural_nodes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."cultural_nodes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- cultural_sources
DROP POLICY "cultural_sources_admin_all" ON public."cultural_sources";
DROP POLICY "cultural_sources_public_read" ON public."cultural_sources";
CREATE POLICY "advisor_select" ON public."cultural_sources" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."cultural_sources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."cultural_sources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."cultural_sources" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- cultural_variants
DROP POLICY "cultural_variants_admin_all" ON public."cultural_variants";
DROP POLICY "cultural_variants_public_read" ON public."cultural_variants";
CREATE POLICY "advisor_select" ON public."cultural_variants" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM cultural_nodes n
  WHERE ((n.id = cultural_variants.node_id) AND (n.status = 'published'::text)))))));
CREATE POLICY "advisor_insert" ON public."cultural_variants" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."cultural_variants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."cultural_variants" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- event_amenities
DROP POLICY "Admins can delete event amenities" ON public."event_amenities";
DROP POLICY "Admins can insert event amenities" ON public."event_amenities";
DROP POLICY "Admins can update event amenities" ON public."event_amenities";
DROP POLICY "Event amenities are viewable by everyone" ON public."event_amenities";
DROP POLICY "taxonomy_staff_insert" ON public."event_amenities";
DROP POLICY "taxonomy_staff_read" ON public."event_amenities";
DROP POLICY "taxonomy_staff_update" ON public."event_amenities";
CREATE POLICY "advisor_select" ON public."event_amenities" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."event_amenities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."event_amenities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."event_amenities" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- event_categories
DROP POLICY "Public read access" ON public."event_categories";
DROP POLICY "taxonomy_staff_insert" ON public."event_categories";
DROP POLICY "taxonomy_staff_read" ON public."event_categories";
DROP POLICY "taxonomy_staff_update" ON public."event_categories";
CREATE POLICY "advisor_select" ON public."event_categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."event_categories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."event_categories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));

-- event_personality_links
DROP POLICY "event_personality_links_admin_manage" ON public."event_personality_links";
DROP POLICY "event_personality_links_admin_read" ON public."event_personality_links";
DROP POLICY "event_personality_links_public_read" ON public."event_personality_links";
CREATE POLICY "advisor_select" ON public."event_personality_links" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) ELSE false END) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) ELSE false END) OR ((status = 'approved'::text)));
CREATE POLICY "advisor_insert" ON public."event_personality_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_update" ON public."event_personality_links" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_delete" ON public."event_personality_links" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- event_services
DROP POLICY "Admins can delete event services" ON public."event_services";
DROP POLICY "Admins can insert event services" ON public."event_services";
DROP POLICY "Admins can update event services" ON public."event_services";
DROP POLICY "Event services are viewable by everyone" ON public."event_services";
DROP POLICY "taxonomy_staff_insert" ON public."event_services";
DROP POLICY "taxonomy_staff_read" ON public."event_services";
DROP POLICY "taxonomy_staff_update" ON public."event_services";
CREATE POLICY "advisor_select" ON public."event_services" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."event_services" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."event_services" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."event_services" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- event_types
DROP POLICY "Admins can delete event types" ON public."event_types";
DROP POLICY "Admins can insert event types" ON public."event_types";
DROP POLICY "Admins can update event types" ON public."event_types";
DROP POLICY "Event types are viewable by everyone" ON public."event_types";
DROP POLICY "taxonomy_staff_insert" ON public."event_types";
DROP POLICY "taxonomy_staff_read" ON public."event_types";
DROP POLICY "taxonomy_staff_update" ON public."event_types";
CREATE POLICY "advisor_select" ON public."event_types" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."event_types" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."event_types" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."event_types" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- geo_city_profiles
DROP POLICY "Admin write geo_city_profiles" ON public."geo_city_profiles";
DROP POLICY "Public read geo_city_profiles" ON public."geo_city_profiles";
CREATE POLICY "advisor_select" ON public."geo_city_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."geo_city_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."geo_city_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."geo_city_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- geo_country_profiles
DROP POLICY "Admin write geo_country_profiles" ON public."geo_country_profiles";
DROP POLICY "Public read geo_country_profiles" ON public."geo_country_profiles";
CREATE POLICY "advisor_select" ON public."geo_country_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."geo_country_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."geo_country_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."geo_country_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- geo_landmark_profiles
DROP POLICY "Admin write geo_landmark_profiles" ON public."geo_landmark_profiles";
DROP POLICY "Public read geo_landmark_profiles" ON public."geo_landmark_profiles";
CREATE POLICY "advisor_select" ON public."geo_landmark_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END) OR ((EXISTS ( SELECT 1
   FROM geo_places gp
  WHERE ((gp.id = geo_landmark_profiles.place_id) AND ((NOT gp.safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL)))))));
CREATE POLICY "advisor_insert" ON public."geo_landmark_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."geo_landmark_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."geo_landmark_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- geo_places
DROP POLICY "Admin write geo_places" ON public."geo_places";
DROP POLICY "Public read geo_places" ON public."geo_places";
CREATE POLICY "advisor_select" ON public."geo_places" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END) OR (((NOT safety_gated) OR (( SELECT auth.uid() AS uid) IS NOT NULL))));
CREATE POLICY "advisor_insert" ON public."geo_places" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."geo_places" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."geo_places" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- geo_village_profiles
DROP POLICY "Admin write geo_village_profiles" ON public."geo_village_profiles";
DROP POLICY "Public read geo_village_profiles" ON public."geo_village_profiles";
CREATE POLICY "advisor_select" ON public."geo_village_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."geo_village_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."geo_village_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."geo_village_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- guide_contributions
DROP POLICY "guide_contributions_admin_write" ON public."guide_contributions";
DROP POLICY "guide_contributions_read_own" ON public."guide_contributions";
DROP POLICY "guide_contributions_read_public" ON public."guide_contributions";
CREATE POLICY "advisor_select" ON public."guide_contributions" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((user_id = ( SELECT auth.uid() AS uid))) ELSE false END) OR (((status = 'accepted'::text) AND (EXISTS ( SELECT 1
   FROM guide_participations p
  WHERE ((p.guide_id = guide_contributions.guide_id) AND (p.user_id = guide_contributions.user_id) AND (p.opted_in_public = true)))))));
CREATE POLICY "advisor_insert" ON public."guide_contributions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."guide_contributions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."guide_contributions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- guide_participations
DROP POLICY "guide_participations_delete_own" ON public."guide_participations";
DROP POLICY "guide_participations_insert_own" ON public."guide_participations";
DROP POLICY "guide_participations_read_own" ON public."guide_participations";
DROP POLICY "guide_participations_read_public" ON public."guide_participations";
DROP POLICY "guide_participations_update_own" ON public."guide_participations";
CREATE POLICY "advisor_select" ON public."guide_participations" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((user_id = ( SELECT auth.uid() AS uid))) ELSE false END) OR ((opted_in_public = true)));
CREATE POLICY "advisor_insert" ON public."guide_participations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "advisor_update" ON public."guide_participations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "advisor_delete" ON public."guide_participations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid))));

-- kink_categories
DROP POLICY "kink_categories_member_read" ON public."kink_categories";
DROP POLICY "taxonomy_staff_insert" ON public."kink_categories";
DROP POLICY "taxonomy_staff_read" ON public."kink_categories";
DROP POLICY "taxonomy_staff_update" ON public."kink_categories";
CREATE POLICY "advisor_select" ON public."kink_categories" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((is_active AND is_intimate_eligible(( SELECT auth.uid() AS uid)))) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))));
CREATE POLICY "advisor_insert" ON public."kink_categories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))));
CREATE POLICY "advisor_update" ON public."kink_categories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))))) WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))));

-- kink_items
DROP POLICY "kink_items_member_read" ON public."kink_items";
DROP POLICY "taxonomy_staff_insert" ON public."kink_items";
DROP POLICY "taxonomy_staff_read" ON public."kink_items";
DROP POLICY "taxonomy_staff_update" ON public."kink_items";
CREATE POLICY "advisor_select" ON public."kink_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((is_active AND is_intimate_eligible(( SELECT auth.uid() AS uid)))) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))));
CREATE POLICY "advisor_insert" ON public."kink_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))));
CREATE POLICY "advisor_update" ON public."kink_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid()))))) WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) AND is_intimate_eligible((SELECT auth.uid())))));

-- marketplace_categories
DROP POLICY "Admins can delete categories" ON public."marketplace_categories";
DROP POLICY "Admins can insert categories" ON public."marketplace_categories";
DROP POLICY "Admins can update categories" ON public."marketplace_categories";
DROP POLICY "Categories are viewable by everyone" ON public."marketplace_categories";
DROP POLICY "taxonomy_staff_insert" ON public."marketplace_categories";
DROP POLICY "taxonomy_staff_read" ON public."marketplace_categories";
DROP POLICY "taxonomy_staff_update" ON public."marketplace_categories";
CREATE POLICY "advisor_select" ON public."marketplace_categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."marketplace_categories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."marketplace_categories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."marketplace_categories" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- news_categories
DROP POLICY "news_categories_admin_delete" ON public."news_categories";
DROP POLICY "news_categories_admin_insert" ON public."news_categories";
DROP POLICY "news_categories_admin_update" ON public."news_categories";
DROP POLICY "news_categories_public_select" ON public."news_categories";
DROP POLICY "taxonomy_staff_insert" ON public."news_categories";
DROP POLICY "taxonomy_staff_read" ON public."news_categories";
DROP POLICY "taxonomy_staff_update" ON public."news_categories";
CREATE POLICY "advisor_select" ON public."news_categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."news_categories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_admin(( SELECT auth.uid() AS uid))) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."news_categories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((is_admin(( SELECT auth.uid() AS uid))) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((is_admin(( SELECT auth.uid() AS uid))) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."news_categories" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((is_admin(( SELECT auth.uid() AS uid))));

-- personality_adult_attributes
DROP POLICY "personality_adult_attributes_admin_manage" ON public."personality_adult_attributes";
DROP POLICY "personality_adult_attributes_admin_read" ON public."personality_adult_attributes";
CREATE POLICY "advisor_select" ON public."personality_adult_attributes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_insert" ON public."personality_adult_attributes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_update" ON public."personality_adult_attributes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_delete" ON public."personality_adult_attributes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- personality_affiliations
DROP POLICY "personality_affiliations_admin_manage" ON public."personality_affiliations";
DROP POLICY "personality_affiliations_admin_read" ON public."personality_affiliations";
CREATE POLICY "advisor_select" ON public."personality_affiliations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_insert" ON public."personality_affiliations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_update" ON public."personality_affiliations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_delete" ON public."personality_affiliations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- personality_claim_sources
DROP POLICY "personality_claim_sources_admin_manage" ON public."personality_claim_sources";
DROP POLICY "personality_claim_sources_admin_read" ON public."personality_claim_sources";
CREATE POLICY "advisor_select" ON public."personality_claim_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_insert" ON public."personality_claim_sources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_update" ON public."personality_claim_sources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_delete" ON public."personality_claim_sources" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- personality_tag_review_queue
DROP POLICY "personality_tag_review_admin_read" ON public."personality_tag_review_queue";
DROP POLICY "personality_tag_review_queue_admin_manage" ON public."personality_tag_review_queue";
CREATE POLICY "advisor_select" ON public."personality_tag_review_queue" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])) OR (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_insert" ON public."personality_tag_review_queue" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_update" ON public."personality_tag_review_queue" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));
CREATE POLICY "advisor_delete" ON public."personality_tag_review_queue" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])));

-- professions
DROP POLICY "Admins can delete professions" ON public."professions";
DROP POLICY "Admins can insert professions" ON public."professions";
DROP POLICY "Admins can update professions" ON public."professions";
DROP POLICY "Public read access for professions" ON public."professions";
DROP POLICY "taxonomy_staff_insert" ON public."professions";
DROP POLICY "taxonomy_staff_read" ON public."professions";
DROP POLICY "taxonomy_staff_update" ON public."professions";
CREATE POLICY "advisor_select" ON public."professions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."professions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."professions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."professions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- styleguide_examples
DROP POLICY "styleguide_examples_admin_all" ON public."styleguide_examples";
DROP POLICY "styleguide_examples_public_read" ON public."styleguide_examples";
CREATE POLICY "advisor_select" ON public."styleguide_examples" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (is_active));
CREATE POLICY "advisor_insert" ON public."styleguide_examples" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."styleguide_examples" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."styleguide_examples" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- styleguide_rules
DROP POLICY "styleguide_rules_admin_all" ON public."styleguide_rules";
DROP POLICY "styleguide_rules_public_read" ON public."styleguide_rules";
CREATE POLICY "advisor_select" ON public."styleguide_rules" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (is_active));
CREATE POLICY "advisor_insert" ON public."styleguide_rules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."styleguide_rules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."styleguide_rules" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- styleguide_terms
DROP POLICY "styleguide_terms_admin_all" ON public."styleguide_terms";
DROP POLICY "styleguide_terms_public_read" ON public."styleguide_terms";
CREATE POLICY "advisor_select" ON public."styleguide_terms" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR (is_active));
CREATE POLICY "advisor_insert" ON public."styleguide_terms" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_update" ON public."styleguide_terms" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role))) WITH CHECK ((has_role_jwt('admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."styleguide_terms" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- tag_categories
DROP POLICY "Admins can delete tag categories" ON public."tag_categories";
DROP POLICY "Admins can insert tag categories" ON public."tag_categories";
DROP POLICY "Admins can update tag categories" ON public."tag_categories";
DROP POLICY "Tag categories are viewable by everyone" ON public."tag_categories";
DROP POLICY "taxonomy_staff_insert" ON public."tag_categories";
DROP POLICY "taxonomy_staff_read" ON public."tag_categories";
DROP POLICY "taxonomy_staff_update" ON public."tag_categories";
CREATE POLICY "advisor_select" ON public."tag_categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."tag_categories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."tag_categories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."tag_categories" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- tag_sources
DROP POLICY "admin select tag_sources" ON public."tag_sources";
DROP POLICY "tag_sources_public_read" ON public."tag_sources";
DROP POLICY "tag_sources_staff_delete" ON public."tag_sources";
DROP POLICY "tag_sources_staff_insert" ON public."tag_sources";
DROP POLICY "tag_sources_staff_update" ON public."tag_sources";
CREATE POLICY "advisor_select" ON public."tag_sources" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (public.tag_sources_staff_read()) ELSE false END) OR ((is_public AND (EXISTS ( SELECT 1
   FROM unified_tags t
  WHERE ((t.id = tag_sources.tag_id) AND (t.status = 'active'::text)))))));
CREATE POLICY "advisor_insert" ON public."tag_sources" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."tag_sources" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."tag_sources" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- tag_workbook_steps
DROP POLICY "tag_workbook_steps_public_read" ON public."tag_workbook_steps";
DROP POLICY "tag_workbook_steps_staff_write" ON public."tag_workbook_steps";
CREATE POLICY "advisor_select" ON public."tag_workbook_steps" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM (tag_workbooks w
     JOIN unified_tags t ON ((t.id = w.tag_id)))
  WHERE ((w.id = tag_workbook_steps.workbook_id) AND w.is_public AND (t.status = 'active'::text))))) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END));
CREATE POLICY "advisor_insert" ON public."tag_workbook_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."tag_workbook_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."tag_workbook_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- tag_workbooks
DROP POLICY "tag_workbooks_public_read" ON public."tag_workbooks";
DROP POLICY "tag_workbooks_staff_write" ON public."tag_workbooks";
CREATE POLICY "advisor_select" ON public."tag_workbooks" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_public AND (EXISTS ( SELECT 1
   FROM unified_tags t
  WHERE ((t.id = tag_workbooks.tag_id) AND (t.status = 'active'::text)))))) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])) ELSE false END));
CREATE POLICY "advisor_insert" ON public."tag_workbooks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_update" ON public."tag_workbooks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))) WITH CHECK ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));
CREATE POLICY "advisor_delete" ON public."tag_workbooks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])));

-- target_groups
DROP POLICY "Admins can delete target groups" ON public."target_groups";
DROP POLICY "Admins can insert target groups" ON public."target_groups";
DROP POLICY "Admins can update target groups" ON public."target_groups";
DROP POLICY "Target groups are viewable by everyone" ON public."target_groups";
DROP POLICY "taxonomy_staff_insert" ON public."target_groups";
DROP POLICY "taxonomy_staff_read" ON public."target_groups";
DROP POLICY "taxonomy_staff_update" ON public."target_groups";
CREATE POLICY "advisor_select" ON public."target_groups" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."target_groups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."target_groups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."target_groups" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- taxonomy_terms
DROP POLICY "taxonomy_staff_insert" ON public."taxonomy_terms";
DROP POLICY "taxonomy_staff_read" ON public."taxonomy_terms";
DROP POLICY "taxonomy_staff_update" ON public."taxonomy_terms";
DROP POLICY "taxonomy_terms_read" ON public."taxonomy_terms";
CREATE POLICY "advisor_select" ON public."taxonomy_terms" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."taxonomy_terms" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."taxonomy_terms" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK (((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));

-- user_events
DROP POLICY "user_events_admin_read" ON public."user_events";
DROP POLICY "user_events_insert_own" ON public."user_events";
DROP POLICY "user_events_select_own" ON public."user_events";
CREATE POLICY "advisor_select" ON public."user_events" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR ((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "advisor_insert" ON public."user_events" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((( SELECT auth.uid() AS uid) = user_id) OR (user_id IS NULL))));

-- username_redirects
DROP POLICY "username_redirects_admin_inventory_read" ON public."username_redirects";
DROP POLICY "username_redirects_read" ON public."username_redirects";
CREATE POLICY "advisor_select" ON public."username_redirects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role_jwt('admin'::app_role)) ELSE false END) OR ((expires_at > now())));

-- venue_quality_rollout
DROP POLICY "venue_quality_rollout_admin_write" ON public."venue_quality_rollout";
DROP POLICY "venue_quality_rollout_public_read" ON public."venue_quality_rollout";
CREATE POLICY "advisor_select" ON public."venue_quality_rollout" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING ((CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) ELSE false END) OR (true));
CREATE POLICY "advisor_insert" ON public."venue_quality_rollout" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)));
CREATE POLICY "advisor_update" ON public."venue_quality_rollout" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role))) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)));
CREATE POLICY "advisor_delete" ON public."venue_quality_rollout" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)));

-- venue_services
DROP POLICY "Admins can delete venue services" ON public."venue_services";
DROP POLICY "Admins can insert venue services" ON public."venue_services";
DROP POLICY "Admins can update venue services" ON public."venue_services";
DROP POLICY "Venue services are viewable by everyone" ON public."venue_services";
DROP POLICY "taxonomy_staff_insert" ON public."venue_services";
DROP POLICY "taxonomy_staff_read" ON public."venue_services";
DROP POLICY "taxonomy_staff_update" ON public."venue_services";
CREATE POLICY "advisor_select" ON public."venue_services" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((true) OR (CASE WHEN pg_has_role(current_user, 'authenticated', 'USAGE') THEN ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))) ELSE false END));
CREATE POLICY "advisor_insert" ON public."venue_services" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_update" ON public."venue_services" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])))) WITH CHECK ((has_role_jwt('admin'::app_role)) OR ((((SELECT auth.uid()) IS NOT NULL) AND has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))));
CREATE POLICY "advisor_delete" ON public."venue_services" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_role_jwt('admin'::app_role)));

-- The redundant UNIQUE is the target of one FK. Rebind that FK to the
-- surviving PK explicitly, preserving its CASCADE and DEFERRABLE behavior.
ALTER TABLE public.redirect_customer_profiles DROP CONSTRAINT redirect_customer_profiles_customer_key_fkey;
ALTER TABLE public.redirect_link_customers DROP CONSTRAINT redirect_link_customers_customer_key_workspace_unique;
ALTER TABLE public.redirect_customer_profiles ADD CONSTRAINT redirect_customer_profiles_customer_key_fkey
  FOREIGN KEY (workspace_id, customer_key) REFERENCES public.redirect_link_customers(workspace_id, customer_key)
  ON DELETE CASCADE DEFERRABLE NOT VALID;
ALTER TABLE public.redirect_customer_profiles VALIDATE CONSTRAINT redirect_customer_profiles_customer_key_fkey;

NOTIFY pgrst, 'reload schema';
