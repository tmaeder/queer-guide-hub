-- ============================================================================
-- Tag Content-Quality: Phase 5 — trust signals (provenance confidence)
-- ----------------------------------------------------------------------------
-- confidence_score is NULL/blind for every active tag. This folds a deterministic
-- provenance-based confidence into the existing nightly run_tag_quality_recompute
-- (no new cron): human-reviewed=1.0; else a verification_status base
-- (reviewed .9 / auto .5 / unverified .3) bumped by grounding (+.1 wiki link,
-- +.05 has a tag_source). The scorecard now reports mean_confidence and the
-- review-state breakdown so trust is observable alongside completeness.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_tag_quality_recompute()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
  v_locales       text[] := ARRAY['de','fr','es','it','pt','nl','pl','ru','tr','uk','sv'];
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'tag_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'tag_quality_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT t.id, t.description, t.image_url, t.category_id, t.description_i18n,
           t.wikidata_id, t.wikipedia_url, t.human_reviewed, t.verification_status
    FROM public.unified_tags t
    WHERE t.status = 'active'
  ),
  comp AS (
    SELECT s.id,
      CASE WHEN s.description IS NULL OR length(trim(s.description))=0 THEN 0.0
           WHEN length(trim(s.description)) < 30 THEN 0.4
           ELSE 1.0 END                                                          AS c_desc,
      CASE WHEN s.image_url IS NULL OR s.image_url='' THEN 0.0 ELSE 1.0 END      AS c_image,
      CASE WHEN EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_category,
      (SELECT count(*) FROM unnest(v_locales) l
         WHERE coalesce(s.description_i18n ->> l,'') <> '')::numeric
         / array_length(v_locales,1)                                             AS c_i18n,
      CASE WHEN s.wikidata_id IS NOT NULL OR s.wikipedia_url IS NOT NULL
           THEN 1.0 ELSE 0.0 END                                                 AS c_links,
      CASE WHEN EXISTS (SELECT 1 FROM public.unified_tag_assignments u WHERE u.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_used,
      CASE WHEN EXISTS (SELECT 1 FROM public.tag_embeddings e WHERE e.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_embed,
      -- provenance confidence
      LEAST(1.0, GREATEST(0.0,
        CASE WHEN s.human_reviewed IS TRUE THEN 1.0
             ELSE (CASE s.verification_status
                     WHEN 'reviewed' THEN 0.9 WHEN 'auto' THEN 0.5
                     WHEN 'unverified' THEN 0.3 ELSE 0.3 END)
                  + CASE WHEN s.wikidata_id IS NOT NULL OR s.wikipedia_url IS NOT NULL THEN 0.1 ELSE 0 END
                  + CASE WHEN EXISTS (SELECT 1 FROM public.tag_sources ts WHERE ts.tag_id=s.id) THEN 0.05 ELSE 0 END
        END))                                                                    AS c_conf
    FROM scope s
  ),
  final AS (
    SELECT id,
      round(100 * (0.22*c_desc + 0.13*c_image + 0.15*c_category + 0.15*c_i18n
                 + 0.10*c_links + 0.15*c_used + 0.10*c_embed))::numeric          AS new_score,
      round(c_conf, 2)                                                           AS new_conf,
      jsonb_build_object(
        'desc', round(c_desc,2), 'image', round(c_image,2), 'category', round(c_category,2),
        'i18n', round(c_i18n,2), 'links', round(c_links,2), 'used', round(c_used,2),
        'embedding', round(c_embed,2)
      )                                                                          AS breakdown
    FROM comp
  )
  UPDATE public.unified_tags t
    SET quality_score = f.new_score,
        quality_breakdown = f.breakdown,
        confidence_score = f.new_conf,
        last_quality_at = now()
  FROM final f
  WHERE t.id = f.id
    AND (t.quality_score IS DISTINCT FROM f.new_score
         OR t.quality_breakdown IS DISTINCT FROM f.breakdown
         OR t.confidence_score IS DISTINCT FROM f.new_conf);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.unified_tags WHERE status='active';

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('rescored',v_changed,'examined',v_examined) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

-- scorecard: add mean_confidence + review-state breakdown
CREATE OR REPLACE FUNCTION public.tag_quality_scorecard()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (SELECT * FROM public.unified_tags WHERE status='active')
  SELECT jsonb_build_object(
    'active_total', (SELECT count(*) FROM a),
    'mean_score', (SELECT round(avg(quality_score),1) FROM a WHERE quality_score IS NOT NULL),
    'mean_confidence', (SELECT round(avg(confidence_score),2) FROM a WHERE confidence_score IS NOT NULL),
    'scored', (SELECT count(*) FROM a WHERE quality_score IS NOT NULL),
    'gaps', jsonb_build_object(
      'description', (SELECT count(*) FROM a WHERE (quality_breakdown->>'desc')::numeric < 1),
      'image',      (SELECT count(*) FROM a WHERE (quality_breakdown->>'image')::numeric < 1),
      'category',   (SELECT count(*) FROM a WHERE (quality_breakdown->>'category')::numeric < 1),
      'i18n',       (SELECT count(*) FROM a WHERE (quality_breakdown->>'i18n')::numeric < 1),
      'links',      (SELECT count(*) FROM a WHERE (quality_breakdown->>'links')::numeric < 1),
      'used',       (SELECT count(*) FROM a WHERE (quality_breakdown->>'used')::numeric < 1),
      'embedding',  (SELECT count(*) FROM a WHERE (quality_breakdown->>'embedding')::numeric < 1)
    ),
    'buckets', jsonb_build_object(
      'p0_20',  (SELECT count(*) FROM a WHERE quality_score < 20),
      'p20_40', (SELECT count(*) FROM a WHERE quality_score >= 20 AND quality_score < 40),
      'p40_60', (SELECT count(*) FROM a WHERE quality_score >= 40 AND quality_score < 60),
      'p60_80', (SELECT count(*) FROM a WHERE quality_score >= 60 AND quality_score < 80),
      'p80_100',(SELECT count(*) FROM a WHERE quality_score >= 80)
    ),
    'review', jsonb_build_object(
      'human_reviewed', (SELECT count(*) FROM a WHERE human_reviewed IS TRUE),
      'reviewed',       (SELECT count(*) FROM a WHERE verification_status='reviewed'),
      'auto',           (SELECT count(*) FROM a WHERE verification_status='auto'),
      'unverified',     (SELECT count(*) FROM a WHERE verification_status='unverified')
    ),
    'sensitive_unreviewed', (SELECT count(*) FROM a WHERE (is_sensitive OR is_adult) AND human_reviewed IS NOT TRUE)
  );
$$;
