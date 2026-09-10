-- batch_approve_safe_news / unbatch_approve_safe_news are an asymmetric pair,
-- and the asymmetry destroys data.
--
-- batch_approve sets THREE fields together:
--     quality_status = 'passed'
--     auto_publish_blocked_reasons = '{}'
--     seo_indexable = true
-- and stamps enrichment_status.batch_approve with only TWO of them —
-- `prev_status` and `prev_seo_indexable`. The blocked reasons are cleared and
-- never recorded.
--
-- unbatch then restores exactly those two and DELETES its own trace
-- (`enrichment_status - 'batch_approve'`). So a round trip leaves the row with
-- `auto_publish_blocked_reasons = '{}'` permanently, and nothing anywhere says
-- why it was ever blocked. The reason a human or a later sweep would need is
-- gone, and the record that anything happened is gone with it — the same
-- erases-its-own-evidence shape as the auto-pause incident in CLAUDE.md.
--
-- Measured on prod 2026-09-10: 10,808 live articles currently carry the
-- batch_approve stamp. Running unbatch today would clear the blocked reasons on
-- all of them.
--
-- SCOPE, stated honestly: this does NOT explain the separate cohort of 2,524
-- articles that are quality_status='passed' AND seo_indexable=false with an
-- empty reasons array. Zero of those 2,524 carry a batch_approve stamp, so they
-- did not come through this path, and their cause is still unidentified. This
-- migration stops the leak; it does not diagnose that cohort.
--
-- NOT RECOVERABLE: the 10,808 rows already stamped have no prev_blocked_reasons
-- recorded, because the value was never saved. Their pre-approval reasons are
-- unrecoverable and this migration does not invent them — an absent key is left
-- absent, and unbatch leaves the column untouched for those rows rather than
-- writing an empty array that would look like a recorded "no reasons".

CREATE OR REPLACE FUNCTION public.batch_approve_safe_news(
  p_min_relevance numeric DEFAULT 0.6,
  p_min_quality integer DEFAULT 50,
  p_min_content integer DEFAULT 300,
  p_limit integer DEFAULT NULL::integer,
  p_dry_run boolean DEFAULT false)
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
                -- The third field this UPDATE overwrites. Without it the revert
                -- cannot put the reasons back, and they are simply lost.
                'prev_blocked_reasons', to_jsonb(coalesce(a.auto_publish_blocked_reasons, '{}')),
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

CREATE OR REPLACE FUNCTION public.unbatch_approve_safe_news(p_limit integer DEFAULT NULL::integer)
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
          -- Restore the third field. `jsonb_typeof = 'array'` rather than a bare
          -- NULL check on purpose: rows stamped before this migration have NO
          -- prev_blocked_reasons key at all, and for those the honest action is
          -- to LEAVE THE COLUMN ALONE. Writing '{}' there would look identical
          -- to a recorded "there were no reasons", which is the exact confusion
          -- this pair created in the first place.
          auto_publish_blocked_reasons = CASE
            WHEN jsonb_typeof(a.enrichment_status->'batch_approve'->'prev_blocked_reasons') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(
                     a.enrichment_status->'batch_approve'->'prev_blocked_reasons'))
            ELSE a.auto_publish_blocked_reasons
          END,
          enrichment_status = a.enrichment_status - 'batch_approve'
    WHERE a.id = ANY(v_ids);
    v_reverted := v_reverted + v_n;
    EXIT WHEN v_n < v_remaining;
    EXIT WHEN p_limit IS NOT NULL AND v_reverted >= p_limit;
  END LOOP;

  RETURN jsonb_build_object('reverted', v_reverted);
END; $function$;

-- Postcondition: assert the round trip is now lossless, on synthetic rows only.
-- Soft on preconditions, hard on what this file exists to guarantee.
DO $verify$
DECLARE
  v_stamp jsonb;
  v_restored text[];
BEGIN
  -- Simulate the stamp batch_approve now writes...
  v_stamp := jsonb_build_object(
    'prev_status', 'review',
    'prev_seo_indexable', false,
    'prev_blocked_reasons', to_jsonb(ARRAY['image_unusable','truncated_body']::text[]),
    'via', 'batch_approve_safe_news');

  -- ...and the expression unbatch now uses to read it back.
  v_restored := ARRAY(SELECT jsonb_array_elements_text(v_stamp->'prev_blocked_reasons'));

  IF v_restored IS DISTINCT FROM ARRAY['image_unusable','truncated_body']::text[] THEN
    RAISE EXCEPTION 'unbatch round trip lost the blocked reasons: got %', v_restored;
  END IF;

  -- A pre-migration stamp has no key; the reader must yield NULL so the CASE
  -- falls through to leaving the column untouched.
  IF jsonb_typeof((v_stamp - 'prev_blocked_reasons')->'prev_blocked_reasons') IS NOT NULL THEN
    RAISE EXCEPTION 'absent prev_blocked_reasons should read as NULL typeof';
  END IF;
END $verify$;
