-- Admin IA P4: make hidden review work visible.
-- The five Truth Engine review queues (city/venue/village/personality/
-- marketplace), the Existence Engine flag queue, editorial drafts, and group
-- join requests had no counts in get_admin_counts, so their pending work was
-- invisible outside each deep-link-only dashboard. Add quality_* +
-- review_group_requests keys so the Quality hub, cockpit, and sidebar badges
-- can read them from the same single count source.

CREATE OR REPLACE FUNCTION public.get_admin_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  estimates jsonb;
  sla_staging_h     constant int := 48;
  sla_cms_h         constant int := 72;
  sla_moderation_h  constant int := 24;
  sla_tags_h        constant int := 72;
  sla_duplicates_h  constant int := 72;
  sla_feedback_h    constant int := 48;
  sla_submissions_h constant int := 24;
  sla_automation_h  constant int := 72;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

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
      (SELECT count(*) FROM community_submissions
        WHERE status='pending'
          AND content_type NOT IN ('feedback','api_error','pipeline_failure')),
    'review_submissions_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE status='pending'
          AND content_type NOT IN ('feedback','api_error','pipeline_failure')
          AND submitted_at < now() - (sla_submissions_h || ' hours')::interval),
    'review_automation',
      (SELECT count(*) FROM content_flags WHERE status='pending'),
    'review_automation_overdue',
      (SELECT count(*) FROM content_flags
        WHERE status='pending'
          AND created_at < now() - (sla_automation_h || ' hours')::interval),
    'review_group_requests',
      (SELECT count(*) FROM group_join_requests WHERE status='pending'),
    -- Truth Engine review gates (Quality hub)
    'quality_city',
      (SELECT count(*) FROM city_review_queue WHERE status='open'),
    'quality_venue',
      (SELECT count(*) FROM venue_review_queue WHERE status='open'),
    'quality_village',
      (SELECT count(*) FROM village_review_queue WHERE status='open'),
    'quality_personality',
      (SELECT count(*) FROM personality_review_queue WHERE status='open'),
    'quality_marketplace',
      (SELECT count(*) FROM marketplace_review_queue WHERE status='open'),
    'quality_existence',
      (SELECT count(*) FROM entity_existence_audit
        WHERE action='flag' AND reverted_at IS NULL),
    'quality_editorial',
      (SELECT count(*) FROM editorial_drafts WHERE status='pending'),
    'sla_hours', jsonb_build_object(
      'staging', sla_staging_h,
      'cms', sla_cms_h,
      'moderation', sla_moderation_h,
      'tags', sla_tags_h,
      'duplicates', sla_duplicates_h,
      'feedback', sla_feedback_h,
      'submissions', sla_submissions_h,
      'automation', sla_automation_h
    )
  )
  INTO result;

  RETURN result;
END;
$function$;
