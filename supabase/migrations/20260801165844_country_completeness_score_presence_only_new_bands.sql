-- Corrects the band added moments earlier in
-- `country_completeness_scores_practical_facts`.
--
-- That version credited a terminal `data_unavailable` state on the new
-- practical + encyclopaedic fields, mirroring how the economic fields work.
-- That was wrong here, and it made the score WORSE: average rose 92.0 → 96.5
-- and the minimum 73 → 92. The economic fields earn `data_unavailable` after
-- three failed World Bank attempts, so it means "we tried and the data does not
-- exist". The country-facts backfill stamps it on the FIRST pass, so it only
-- means "one pass did not find it" — crediting it handed ~21 free points to
-- exactly the thin territory pages the score is supposed to surface.
--
-- The new bands now score presence only. A country with no CIA Factbook entry
-- genuinely loses those points, because its page genuinely has nothing on it.
-- `currency` / `languages` also revert to presence-only (the previous statement
-- had added a credit they never had). The pre-existing stats and legal bands are
-- untouched — their `data_unavailable` credit is earned and stays.

create or replace function public.run_country_completeness_recompute()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
      -- editorial (20)
        CASE WHEN (description IS NOT NULL AND length(trim(description)) > 0) OR shell_status = 'territory' THEN 8 ELSE 0 END
      + CASE WHEN editorial_hook IS NOT NULL OR shell_status = 'territory' THEN 6 ELSE 0 END
      + CASE WHEN editorial_long IS NOT NULL OR shell_status = 'territory' THEN 6 ELSE 0 END
      -- core facts (18)
      + CASE WHEN capital IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN currency IS NOT NULL THEN 3 ELSE 0 END
      + CASE WHEN array_length(languages, 1) > 0 THEN 3 ELSE 0 END
      + CASE WHEN population IS NOT NULL THEN 3 ELSE 0 END
      + CASE WHEN area_km2 IS NOT NULL THEN 3 ELSE 0 END
      + CASE WHEN flag_emoji IS NOT NULL THEN 2 ELSE 0 END
      -- stats (15) — data_unavailable credit is earned here (3 World Bank attempts)
      + CASE WHEN gdp_usd IS NOT NULL                 OR enrichment_status->'gdp_usd'->>'state'                 = 'data_unavailable' OR shell_status = 'territory' THEN 3 ELSE 0 END
      + CASE WHEN gdp_per_capita_usd IS NOT NULL      OR enrichment_status->'gdp_per_capita_usd'->>'state'      = 'data_unavailable' OR shell_status = 'territory' THEN 3 ELSE 0 END
      + CASE WHEN human_development_index IS NOT NULL OR enrichment_status->'human_development_index'->>'state' = 'data_unavailable' OR shell_status = 'territory' THEN 3 ELSE 0 END
      + CASE WHEN life_expectancy IS NOT NULL         OR enrichment_status->'life_expectancy'->>'state'         = 'data_unavailable' OR shell_status = 'territory' THEN 3 ELSE 0 END
      + CASE WHEN literacy_rate IS NOT NULL           OR enrichment_status->'literacy_rate'->>'state'           = 'data_unavailable' OR shell_status = 'territory' THEN 3 ELSE 0 END
      -- legal (18)
      + CASE WHEN equality_score IS NOT NULL OR enrichment_status->'equality_score'->>'state' = 'data_unavailable' THEN 9 ELSE 0 END
      + CASE WHEN (lgbti_criminalization IS NOT NULL AND lgbti_criminalization <> '{}'::jsonb) OR enrichment_status->'lgbti_criminalization'->>'state' = 'data_unavailable' THEN 9 ELSE 0 END
      -- media + geo (8)
      + CASE WHEN image_url IS NOT NULL OR curated_image_url IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 4 ELSE 0 END
      -- practical travel facts (13) — presence only
      + CASE WHEN calling_code IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN internet_tld IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN driving_side IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN timezone IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN government_type IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN array_length(major_airports, 1) > 0 THEN 2 ELSE 0 END
      + CASE WHEN national_day IS NOT NULL THEN 1 ELSE 0 END
      -- encyclopaedic (8) — presence only
      + CASE WHEN array_length(climate_zones, 1) > 0 THEN 1 ELSE 0 END
      + CASE WHEN array_length(natural_resources, 1) > 0 THEN 1 ELSE 0 END
      + CASE WHEN array_length(unesco_sites, 1) > 0 THEN 1 ELSE 0 END
      + CASE WHEN array_length(major_industries, 1) > 0 THEN 1 ELSE 0 END
      + CASE WHEN array_length(exports, 1) > 0 THEN 1 ELSE 0 END
      + CASE WHEN array_length(imports, 1) > 0 THEN 1 ELSE 0 END
      + CASE WHEN (national_symbols IS NOT NULL AND national_symbols <> '{}'::jsonb) THEN 1 ELSE 0 END
      + CASE WHEN array_length(major_religions, 1) > 0 THEN 1 ELSE 0 END
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
END;
$fn$;
