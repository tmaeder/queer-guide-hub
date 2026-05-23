-- Phase β (D4): SLA-aware admin counts.
-- Extends get_admin_counts() with *_overdue keys for each review queue.
-- An item is "overdue" when its pending row is older than the queue's SLA.
-- Existing callers continue to read the same flat keys; new callers may read
-- the *_overdue partner.

CREATE OR REPLACE FUNCTION "public"."get_admin_counts"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result jsonb;
  estimates jsonb;
  -- SLA windows (hours) — keep in code for now; promote to admin_settings later.
  sla_staging_h     constant int := 48;
  sla_cms_h         constant int := 72;
  sla_moderation_h  constant int := 24;
  sla_tags_h        constant int := 72;
  sla_duplicates_h  constant int := 72;
  sla_feedback_h    constant int := 48;
  sla_submissions_h constant int := 24;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  -- Approximate counts from planner stats (instant, ~5% imprecision)
  SELECT jsonb_object_agg(relname, reltuples::bigint)
  INTO estimates
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = ANY (ARRAY[
      'venues','events','news_articles','personalities','cities','countries',
      'hotels','queer_villages','marketplace_listings','community_groups',
      'unified_tags','cms_pages','email_ingestions','workflow_runs',
      'scrape_sources','content_links','community_submissions','redirects'
    ]);

  SELECT estimates || jsonb_build_object(
    'review_staging',
      (SELECT count(*) FROM ingestion_staging
        WHERE review_status='pending_review' AND disposition='pending'),
    'review_staging_overdue',
      (SELECT count(*) FROM ingestion_staging
        WHERE review_status='pending_review' AND disposition='pending'
          AND created_at < now() - (sla_staging_h || ' hours')::interval),
    'review_cms',
      (SELECT count(*) FROM cms_content_metadata WHERE workflow_state='review'),
    'review_cms_overdue',
      (SELECT count(*) FROM cms_content_metadata
        WHERE workflow_state='review'
          AND created_at < now() - (sla_cms_h || ' hours')::interval),
    'review_moderation',
      (SELECT count(*) FROM moderation_flags WHERE status='OPEN'),
    'review_moderation_overdue',
      (SELECT count(*) FROM moderation_flags
        WHERE status='OPEN'
          AND created_at < now() - (sla_moderation_h || ' hours')::interval),
    'review_tags',
      (SELECT count(*) FROM tag_suggestions WHERE status='pending'),
    'review_tags_overdue',
      (SELECT count(*) FROM tag_suggestions
        WHERE status='pending'
          AND created_at < now() - (sla_tags_h || ' hours')::interval),
    'review_duplicates',
      (SELECT count(*) FROM scraper_dedupe_decisions WHERE decision='pending'),
    'review_duplicates_overdue',
      (SELECT count(*) FROM scraper_dedupe_decisions
        WHERE decision='pending'
          AND created_at IS NOT NULL
          AND created_at < now() - (sla_duplicates_h || ' hours')::interval),
    'review_feedback',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')),
    'review_feedback_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')
          AND submitted_at < now() - (sla_feedback_h || ' hours')::interval),
    'review_submissions',
      (SELECT count(*) FROM community_submissions WHERE status='pending'),
    'review_submissions_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE status='pending'
          AND submitted_at < now() - (sla_submissions_h || ' hours')::interval),
    'sla_hours', jsonb_build_object(
      'staging', sla_staging_h,
      'cms', sla_cms_h,
      'moderation', sla_moderation_h,
      'tags', sla_tags_h,
      'duplicates', sla_duplicates_h,
      'feedback', sla_feedback_h,
      'submissions', sla_submissions_h
    )
  )
  INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_admin_counts"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_admin_counts"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_admin_counts"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_admin_counts"() TO "authenticated";
