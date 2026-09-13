-- Batch drop of confirmed-unused, non-trivial-size indexes surfaced by the
-- Postgres performance advisor (idx_scan = 0 against never-reset lifetime
-- stats). Each of these carries a specific reason, not just "0 scans":
--
--  * ix_ingestion_staging_idem duplicates the UNIQUE composite index
--    ux_ingestion_staging_source_idem(coalesce(source_name,source_type),
--    idempotency_key), which is the one that actually enforces the
--    idempotency guarantee -- this plain single-column index is pure
--    redundancy.
--  * idx_venues_review_status / idx_events_review_status partial indexes on
--    the legacy review_status column predate the entity_review_queue
--    consolidation (20260801130000, "folded the five queues into
--    entity_review_queue") -- triage now reads that table, not these.
--  * The rest are GIN/btree/trigram indexes on columns that are either
--    write-heavy scratch/audit fields (content_changes, scraper_snapshots,
--    pipeline_errors) or superseded lookup paths, all with zero scans since
--    project creation (pg_stat_database.stats_reset IS NULL, i.e. these are
--    true lifetime counts, not a post-reset artifact).
--
-- Deliberately NOT included: search_documents_geog_gix. It also shows 0
-- scans, but search_hybrid/search_facets both reference `geog` in their
-- bodies -- a spatial index with zero scans on a column actually queried
-- for distance filtering is more likely a sign that the geo predicate isn't
-- written in an index-friendly way (missing ST_DWithin/&&) than a genuinely
-- dead index, so dropping it could make a real perf problem worse. Left for
-- separate investigation. Also excluded: anything named *_safety_gated (tiny,
-- 16KB, touches the safety-gating surface -- not worth the risk for the
-- storage saved) and every index under 100KB (long tail of near-empty
-- low-traffic tables where the reclaim is negligible relative to individual
-- review cost).
DROP INDEX IF EXISTS public.ix_ingestion_staging_idem;
DROP INDEX IF EXISTS public.image_assets_content_hash_idx;
DROP INDEX IF EXISTS public.image_assets_phash_todo_idx;
DROP INDEX IF EXISTS public.idx_events_tags_gin;
DROP INDEX IF EXISTS public.search_documents_start_idx;
DROP INDEX IF EXISTS public.idx_venues_external_id;
DROP INDEX IF EXISTS public.idx_venues_latlng;
DROP INDEX IF EXISTS public.news_articles_canonical_url_idx;
DROP INDEX IF EXISTS public.idx_content_changes_batch_id;
DROP INDEX IF EXISTS public.idx_scraper_snapshots_source;
DROP INDEX IF EXISTS public.idx_ingestion_staging_review;
DROP INDEX IF EXISTS public.events_pride_subtypes_gin;
DROP INDEX IF EXISTS public.idx_news_articles_quality_review;
DROP INDEX IF EXISTS public.idx_marketplace_listings_brand_key;
DROP INDEX IF EXISTS public.idx_personality_quality_signals_pid;
DROP INDEX IF EXISTS public.idx_marketplace_listings_subcategory_group;
DROP INDEX IF EXISTS public.idx_venues_amenity_backfill;
DROP INDEX IF EXISTS public.idx_marketplace_listings_category_id;
DROP INDEX IF EXISTS public.idx_personalities_despace;
DROP INDEX IF EXISTS public.idx_news_articles_ingestion_run_id;
DROP INDEX IF EXISTS public.idx_events_missing_country_id;
DROP INDEX IF EXISTS public.idx_news_trust_score;
DROP INDEX IF EXISTS public.idx_workflow_runs_idempotency;
DROP INDEX IF EXISTS public.idx_venues_missing_state;
DROP INDEX IF EXISTS public.pr_target_personality_idx;
DROP INDEX IF EXISTS public.news_articles_category_canonical_idx;
DROP INDEX IF EXISTS public.idx_tag_relationships_tag1_id;
DROP INDEX IF EXISTS public.idx_hotels_name_trgm;
DROP INDEX IF EXISTS public.idx_pipeline_errors_severity;
DROP INDEX IF EXISTS public.idx_tag_suggestions_triage;
DROP INDEX IF EXISTS public.idx_events_venue_unlinked;
DROP INDEX IF EXISTS public.idx_content_changes_rule_id;
DROP INDEX IF EXISTS public.idx_tag_suggestions_tag_id;
DROP INDEX IF EXISTS public.idx_scraper_snapshots_url;
DROP INDEX IF EXISTS public.idx_cities_last_verified;
DROP INDEX IF EXISTS public.idx_personalities_name_initial_public;
DROP INDEX IF EXISTS public.idx_venues_review_status;
DROP INDEX IF EXISTS public.idx_events_review_status;
DROP INDEX IF EXISTS public.idx_city_coverage_gaps_rank;
DROP INDEX IF EXISTS public.idx_vfp_venue_field;
DROP INDEX IF EXISTS public.event_dates_day_idx;
DROP INDEX IF EXISTS public.idx_cs_feedback_title_trgm;
DROP INDEX IF EXISTS public.idx_geo_places_country;
DROP INDEX IF EXISTS public.search_synonyms_locale_idx;
DROP INDEX IF EXISTS public.entity_merge_audit_open_idx;
DROP INDEX IF EXISTS public.idx_milestones_category;

DO $verify$
DECLARE
  v_leftover text;
BEGIN
  SELECT indexname INTO v_leftover
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'ix_ingestion_staging_idem','image_assets_content_hash_idx','image_assets_phash_todo_idx',
      'idx_events_tags_gin','search_documents_start_idx','idx_venues_external_id','idx_venues_latlng',
      'news_articles_canonical_url_idx','idx_content_changes_batch_id','idx_scraper_snapshots_source',
      'idx_ingestion_staging_review','events_pride_subtypes_gin','idx_news_articles_quality_review',
      'idx_marketplace_listings_brand_key','idx_personality_quality_signals_pid',
      'idx_marketplace_listings_subcategory_group','idx_venues_amenity_backfill',
      'idx_marketplace_listings_category_id','idx_personalities_despace','idx_news_articles_ingestion_run_id',
      'idx_events_missing_country_id','idx_news_trust_score','idx_workflow_runs_idempotency',
      'idx_venues_missing_state','pr_target_personality_idx','news_articles_category_canonical_idx',
      'idx_tag_relationships_tag1_id','idx_hotels_name_trgm','idx_pipeline_errors_severity',
      'idx_tag_suggestions_triage','idx_events_venue_unlinked','idx_content_changes_rule_id',
      'idx_tag_suggestions_tag_id','idx_scraper_snapshots_url','idx_cities_last_verified',
      'idx_personalities_name_initial_public','idx_venues_review_status','idx_events_review_status',
      'idx_city_coverage_gaps_rank','idx_vfp_venue_field','event_dates_day_idx','idx_cs_feedback_title_trgm',
      'idx_geo_places_country','search_synonyms_locale_idx','entity_merge_audit_open_idx','idx_milestones_category'
    )
  LIMIT 1;

  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'expected index % to be dropped but it still exists', v_leftover;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='search_documents_geog_gix') THEN
    RAISE EXCEPTION 'search_documents_geog_gix was dropped but should have been left alone -- see migration header';
  END IF;
END $verify$;
