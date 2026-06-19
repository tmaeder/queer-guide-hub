-- P1 — Drain the news review backlog.
--
-- ~6.2k articles with LGBTI relevance >= 0.5 sit in quality_status='review' and
-- never surface publicly; the admin UI only had one-at-a-time approval (cities
-- has batch_approve_safe_city_reviews; news had no equivalent). This adds a
-- batched, reversible bulk approver that promotes only SAFE rows review->passed.
--
-- SAFE = relevant enough, complete enough, real article body, and free of hard
-- editorial blockers (paywall / satire / advertorial). Image quality is NOT a
-- gate: a usable-or-absent image is fine, so image_unusable alone never blocks.
-- Prior status is snapshotted into enrichment_status.batch_approve for reversal.
-- Batched (<=300/statement) so the per-row search_documents_sync reindex trigger
-- never blows the statement_timeout (same failure mode as the recompute crons).

CREATE OR REPLACE FUNCTION public.batch_approve_safe_news(
  p_min_relevance numeric DEFAULT 0.6,
  p_min_quality   integer DEFAULT 50,
  p_min_content   integer DEFAULT 300,
  p_limit         integer DEFAULT NULL,
  p_dry_run       boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_approved int := 0; v_examined int := 0; v_batch int := 0;
  v_last uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_ids uuid[]; v_n int; v_remaining int;
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  SET LOCAL statement_timeout = 0;

  LOOP
    v_remaining := CASE WHEN p_limit IS NULL THEN 300
                        ELSE least(300, p_limit - v_approved) END;
    EXIT WHEN v_remaining <= 0;

    SELECT array_agg(id ORDER BY id)
      INTO v_ids
    FROM (
      SELECT id FROM public.news_articles
      WHERE duplicate_of_id IS NULL
        AND quality_status = 'review'
        AND id > v_last
        AND coalesce(lgbti_relevance_score, relevance_score, 0) >= p_min_relevance
        AND coalesce(quality_score, 0) >= p_min_quality
        AND content IS NOT NULL
        AND length(content) >= p_min_content
        AND NOT (coalesce(auto_publish_blocked_reasons, '{}')
                 && ARRAY['critical_paywall','satire','advertorial'])
      ORDER BY id
      LIMIT v_remaining
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);

    EXIT WHEN v_n = 0;
    v_last := v_ids[v_n];
    v_examined := v_examined + v_n;

    IF NOT p_dry_run THEN
      UPDATE public.news_articles a
        SET quality_status = 'passed',
            auto_publish_blocked_reasons = '{}',
            seo_indexable = true,
            enrichment_status = jsonb_set(
              coalesce(a.enrichment_status, '{}'::jsonb),
              ARRAY['batch_approve'],
              jsonb_build_object(
                'prev_status', a.quality_status,
                'prev_seo_indexable', a.seo_indexable,
                'approved_at', now(),
                'via', 'batch_approve_safe_news'), true)
      WHERE a.id = ANY(v_ids);
      v_approved := v_approved + v_n;
    END IF;

    v_batch := v_batch + 1;
    EXIT WHEN v_n < v_remaining;             -- last partial page
    EXIT WHEN p_limit IS NOT NULL AND v_approved >= p_limit;
  END LOOP;

  RETURN jsonb_build_object(
    'approved', CASE WHEN p_dry_run THEN 0 ELSE v_approved END,
    'examined', v_examined,
    'dry_run', p_dry_run,
    'batches', v_batch);
END; $function$;

REVOKE ALL ON FUNCTION public.batch_approve_safe_news(numeric,integer,integer,integer,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.batch_approve_safe_news(numeric,integer,integer,integer,boolean) TO authenticated;

-- Reverse a batch approval (admin safety net): restore the snapshotted prior
-- status for rows this approver published, scoped to ids still carrying the
-- snapshot. Batched, reversible itself only in the sense of re-running approve.
CREATE OR REPLACE FUNCTION public.unbatch_approve_safe_news(p_limit integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reverted int := 0; v_ids uuid[]; v_n int;
  v_last uuid := '00000000-0000-0000-0000-000000000000'::uuid; v_remaining int;
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  SET LOCAL statement_timeout = 0;

  LOOP
    v_remaining := CASE WHEN p_limit IS NULL THEN 300 ELSE least(300, p_limit - v_reverted) END;
    EXIT WHEN v_remaining <= 0;
    SELECT array_agg(id ORDER BY id) INTO v_ids
    FROM (
      SELECT id FROM public.news_articles
      WHERE id > v_last
        AND enrichment_status->'batch_approve'->>'via' = 'batch_approve_safe_news'
      ORDER BY id LIMIT v_remaining
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);
    EXIT WHEN v_n = 0;
    v_last := v_ids[v_n];

    UPDATE public.news_articles a
      SET quality_status = coalesce(a.enrichment_status->'batch_approve'->>'prev_status','review'),
          seo_indexable = coalesce((a.enrichment_status->'batch_approve'->>'prev_seo_indexable')::boolean, seo_indexable),
          enrichment_status = a.enrichment_status - 'batch_approve'
    WHERE a.id = ANY(v_ids);
    v_reverted := v_reverted + v_n;
    EXIT WHEN v_n < v_remaining;
    EXIT WHEN p_limit IS NOT NULL AND v_reverted >= p_limit;
  END LOOP;

  RETURN jsonb_build_object('reverted', v_reverted);
END; $function$;

REVOKE ALL ON FUNCTION public.unbatch_approve_safe_news(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.unbatch_approve_safe_news(integer) TO authenticated;
