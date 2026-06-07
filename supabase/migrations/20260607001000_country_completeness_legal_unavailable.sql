-- Credit legal-coverage fields when terminal data_unavailable (uninhabited
-- territories have no legal regime to record), and mark those territories so the
-- uniform completeness bar stops flagging them forever. Idempotent.

CREATE OR REPLACE FUNCTION public.run_country_completeness_recompute()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'country_completeness_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'country_completeness_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scored AS (
    SELECT id, (
        CASE WHEN description IS NOT NULL AND length(trim(description)) > 0 THEN 10 ELSE 0 END
      + CASE WHEN editorial_hook IS NOT NULL THEN 8 ELSE 0 END
      + CASE WHEN editorial_long IS NOT NULL THEN 7 ELSE 0 END
      + CASE WHEN capital IS NOT NULL THEN 5 ELSE 0 END
      + CASE WHEN currency IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN array_length(languages, 1) > 0 THEN 4 ELSE 0 END
      + CASE WHEN population IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN area_km2 IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN flag_emoji IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN gdp_usd IS NOT NULL                 OR enrichment_status->'gdp_usd'->>'state'                = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN gdp_per_capita_usd IS NOT NULL      OR enrichment_status->'gdp_per_capita_usd'->>'state'     = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN human_development_index IS NOT NULL OR enrichment_status->'human_development_index'->>'state' = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN life_expectancy IS NOT NULL         OR enrichment_status->'life_expectancy'->>'state'         = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN literacy_rate IS NOT NULL           OR enrichment_status->'literacy_rate'->>'state'           = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN equality_score IS NOT NULL OR enrichment_status->'equality_score'->>'state' = 'data_unavailable' THEN 10 ELSE 0 END
      + CASE WHEN (lgbti_criminalization IS NOT NULL AND lgbti_criminalization <> '{}'::jsonb) OR enrichment_status->'lgbti_criminalization'->>'state' = 'data_unavailable' THEN 10 ELSE 0 END
      + CASE WHEN image_url IS NOT NULL OR curated_image_url IS NOT NULL THEN 5 ELSE 0 END
      + CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 5 ELSE 0 END
      )::smallint AS new_score
    FROM public.countries WHERE duplicate_of_id IS NULL
  )
  UPDATE public.countries c
    SET content_completeness_score = s.new_score
  FROM scored s
  WHERE c.id = s.id AND c.content_completeness_score IS DISTINCT FROM s.new_score;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.countries WHERE duplicate_of_id IS NULL;

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

-- Mark no-legal-regime territories (no ILGA data, no score) as terminal.
UPDATE public.countries
  SET enrichment_status = enrichment_status || jsonb_build_object(
        'equality_score',        jsonb_build_object('state','data_unavailable','source','ilga','at', now()),
        'lgbti_criminalization', jsonb_build_object('state','data_unavailable','source','ilga','at', now()))
WHERE duplicate_of_id IS NULL
  AND equality_score IS NULL
  AND COALESCE(lgbti_criminalization, '{}'::jsonb) = '{}'::jsonb;
