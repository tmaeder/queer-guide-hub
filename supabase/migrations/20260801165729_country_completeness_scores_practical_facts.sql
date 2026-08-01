-- The completeness scorer looked at none of the practical or encyclopaedic
-- country columns, so it reported an average of 92 (nothing under 73) while 15
-- of them were empty on all 250 rows. A score that cannot see a gap cannot be
-- used to find one — which is exactly why this gap went unnoticed for so long.
--
-- Re-weighted to 100 across seven bands. Every newly-scored field credits a
-- terminal `data_unavailable` state the same way the economic fields already
-- do, so territories the CIA Factbook simply has no entry for are not penalised
-- forever; only countries that genuinely have not been enriched lose points.
--
-- `visa_requirements` is deliberately NOT scored: it is `data_unavailable` on
-- all 250 rows (no free per-nationality source), so scoring it would hand every
-- country the same free point and measure nothing. `airport_codes` is likewise
-- omitted to avoid double-counting `major_airports`.
--
--   editorial      20   description 8 / hook 6 / long 6           (territory-credited)
--   core facts     18   capital 4 / currency 3 / languages 3 / population 3 / area 3 / flag 2
--   stats          15   gdp 3 / gdp_pc 3 / hdi 3 / life 3 / literacy 3
--   legal          18   equality 9 / criminalization 9
--   media + geo     8   image 4 / lat+lng 4
--   practical      13   calling code 2 / tld 2 / driving side 2 / timezone 2 /
--                       government 2 / airports 2 / national day 1
--   encyclopaedic   8   climate / resources / unesco / industries / exports /
--                       imports / symbols / religions — 1 each

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
      + CASE WHEN currency IS NOT NULL OR enrichment_status->'currency'->>'state' = 'data_unavailable' THEN 3 ELSE 0 END
      + CASE WHEN array_length(languages, 1) > 0 OR enrichment_status->'languages'->>'state' = 'data_unavailable' THEN 3 ELSE 0 END
      + CASE WHEN population IS NOT NULL THEN 3 ELSE 0 END
      + CASE WHEN area_km2 IS NOT NULL THEN 3 ELSE 0 END
      + CASE WHEN flag_emoji IS NOT NULL THEN 2 ELSE 0 END
      -- stats (15)
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
      -- practical travel facts (13)
      + CASE WHEN calling_code IS NOT NULL    OR enrichment_status->'calling_code'->>'state'    = 'data_unavailable' THEN 2 ELSE 0 END
      + CASE WHEN internet_tld IS NOT NULL    OR enrichment_status->'internet_tld'->>'state'    = 'data_unavailable' THEN 2 ELSE 0 END
      + CASE WHEN driving_side IS NOT NULL    OR enrichment_status->'driving_side'->>'state'    = 'data_unavailable' THEN 2 ELSE 0 END
      + CASE WHEN timezone IS NOT NULL        OR enrichment_status->'timezone'->>'state'        = 'data_unavailable' THEN 2 ELSE 0 END
      + CASE WHEN government_type IS NOT NULL OR enrichment_status->'government_type'->>'state' = 'data_unavailable' THEN 2 ELSE 0 END
      + CASE WHEN array_length(major_airports, 1) > 0 OR enrichment_status->'major_airports'->>'state' = 'data_unavailable' THEN 2 ELSE 0 END
      + CASE WHEN national_day IS NOT NULL    OR enrichment_status->'national_day'->>'state'    = 'data_unavailable' THEN 1 ELSE 0 END
      -- encyclopaedic (8)
      + CASE WHEN array_length(climate_zones, 1) > 0     OR enrichment_status->'climate_zones'->>'state'     = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN array_length(natural_resources, 1) > 0 OR enrichment_status->'natural_resources'->>'state' = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN array_length(unesco_sites, 1) > 0      OR enrichment_status->'unesco_sites'->>'state'      = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN array_length(major_industries, 1) > 0  OR enrichment_status->'major_industries'->>'state'  = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN array_length(exports, 1) > 0           OR enrichment_status->'exports'->>'state'           = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN array_length(imports, 1) > 0           OR enrichment_status->'imports'->>'state'           = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN (national_symbols IS NOT NULL AND national_symbols <> '{}'::jsonb) OR enrichment_status->'national_symbols'->>'state' = 'data_unavailable' THEN 1 ELSE 0 END
      + CASE WHEN array_length(major_religions, 1) > 0   OR enrichment_status->'major_religions'->>'state'   = 'data_unavailable' THEN 1 ELSE 0 END
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
