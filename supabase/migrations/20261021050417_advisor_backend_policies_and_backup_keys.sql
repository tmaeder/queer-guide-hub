-- Recovered verbatim from production migration history; already applied.
-- Make the existing backend-only RLS contract explicit. Browser grants stay
-- revoked; service_role and the existing BYPASSRLS jobs retain their access.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_automation_maintenance', 'admin_automation_maintenance_snapshot', 'admin_counts_cache', 'admin_review_queue_counts', 'admin_review_queue_top', 'bluesky_bot_posts', 'city_localities', 'city_place_class_probe', 'city_quality_snapshots', 'entity_bluesky_mentions', 'entity_category_evidence', 'event_gap_queue', 'event_quality_description_clusters', 'event_quality_image_clusters', 'event_quality_worker_leases', 'foursquare_api_budget', 'foursquare_categories', 'foursquare_place_redirects', 'foursquare_sync_state', 'geo_address_terminal_outcomes', 'geo_boundary_region_map', 'governance_remediation_items', 'governance_remediation_runs', 'marketplace_category_junk_audit', 'marketplace_governance_resolutions', 'marketplace_link_check_claims', 'marketplace_source_quality_snapshots', 'marketplace_taxonomy_validation_corpus', 'marketplace_variant_extract_claims', 'redirect_workspaces', 'tag_entity_candidate_reviews', 'tag_entity_class_probe', 'tag_image_link_retirement', 'venue_category_source_tag_noise', 'venue_category_source_tags'] LOOP
    -- Another migration may already have supplied a deliberate policy.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('CREATE POLICY backend_service_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',t);
    END IF;
  END LOOP;
END $policies$;

-- These snapshots have unique, non-null source IDs. Preserve their rows and
-- shape while making row identity explicit for backups and replication tools.
ALTER TABLE public."milestones_backup_20260721" ADD CONSTRAINT "milestones_backup_20260721_pkey" PRIMARY KEY (id);
ALTER TABLE public."person_gate_demoted_20260721" ADD CONSTRAINT "person_gate_demoted_20260721_pkey" PRIMARY KEY (id);
ALTER TABLE public."unified_tag_assignments_backup_20260916" ADD CONSTRAINT "unified_tag_assignments_backup_20260916_pkey" PRIMARY KEY (id);

-- These zero-scan, non-unique B-trees are redundant with existing unique
-- indexes with identical leading keys, ordering and default operator classes.
-- Retain spatial/search/queue indexes and all other FK support.
-- Retained: personality_affiliations_personality_id_affiliation_type_na_key
DROP INDEX IF EXISTS "public"."personality_affiliations_person_idx";
-- Retained: user_role_permissions_user_id_content_type_key
DROP INDEX IF EXISTS "public"."idx_user_role_permissions_user";
-- Retained: venue_sources_slug_entity_uk
DROP INDEX IF EXISTS "public"."idx_venue_sources_slug";
-- Retained: user_trust_events_user_id_kind_ref_table_ref_id_key
DROP INDEX IF EXISTS "public"."user_trust_events_user_kind_idx";
-- Retained: trip_days_trip_id_date_key
DROP INDEX IF EXISTS "public"."idx_trip_days_trip_date";
