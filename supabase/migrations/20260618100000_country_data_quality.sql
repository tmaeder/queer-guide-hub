-- Country data-quality remediation (2026-06-18)
-- 1. Backfill countries.flag_emoji from ISO code (was 0/250 populated; every
--    country page fell back to the rainbow flag). SQL port of src/lib/countryFlag.ts:
--    each letter -> regional-indicator codepoint (0x1F1E6 + (letter - 'A')).
-- 2. shell_status: 'real' vs 'territory'. 'territory' marks non-serviceable,
--    effectively-uninhabited entries (Antarctica-class: no resident population to
--    serve, no venues, can never realistically carry editorial/stats). Inhabited
--    dependencies (Guam, Jersey, Macau, Aruba, ...) stay 'real' and DO get content.
-- 3. The completeness scorer credits territories for the editorial + economic-stats
--    fields they can never fill (so they stop reading as "failing"); the enrichment
--    selector skips them (so we stop spending LLM/API calls on them).

-- 1. Flag emoji ----------------------------------------------------------------
UPDATE public.countries
SET flag_emoji = chr(127462 + ascii(substr(upper(code), 1, 1)) - 65)
              || chr(127462 + ascii(substr(upper(code), 2, 1)) - 65)
WHERE code ~ '^[A-Za-z]{2}$'
  AND (flag_emoji IS NULL OR flag_emoji = '');

-- 2. shell_status --------------------------------------------------------------
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS shell_status text NOT NULL DEFAULT 'real'
  CHECK (shell_status IN ('real', 'territory'));

-- Non-serviceable territories: no resident population to serve + no venues.
UPDATE public.countries
SET shell_status = 'territory'
WHERE code IN ('AQ','CC','TF','PN','GS','HM','BV','IO','UM');

-- 3. Completeness recompute: credit territories for unfillable fields -----------
CREATE OR REPLACE FUNCTION public.run_country_completeness_recompute()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- Editorial narrative: territories can't carry it, credit them.
        CASE WHEN (description IS NOT NULL AND length(trim(description)) > 0) OR shell_status = 'territory' THEN 10 ELSE 0 END
      + CASE WHEN editorial_hook IS NOT NULL OR shell_status = 'territory' THEN 8 ELSE 0 END
      + CASE WHEN editorial_long IS NOT NULL OR shell_status = 'territory' THEN 7 ELSE 0 END
      + CASE WHEN capital IS NOT NULL THEN 5 ELSE 0 END
      + CASE WHEN currency IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN array_length(languages, 1) > 0 THEN 4 ELSE 0 END
      + CASE WHEN population IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN area_km2 IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN flag_emoji IS NOT NULL THEN 4 ELSE 0 END
        -- Economic stats: territories rarely reported, credit them.
      + CASE WHEN gdp_usd IS NOT NULL                 OR enrichment_status->'gdp_usd'->>'state'                = 'data_unavailable' OR shell_status = 'territory' THEN 4 ELSE 0 END
      + CASE WHEN gdp_per_capita_usd IS NOT NULL      OR enrichment_status->'gdp_per_capita_usd'->>'state'     = 'data_unavailable' OR shell_status = 'territory' THEN 4 ELSE 0 END
      + CASE WHEN human_development_index IS NOT NULL OR enrichment_status->'human_development_index'->>'state' = 'data_unavailable' OR shell_status = 'territory' THEN 4 ELSE 0 END
      + CASE WHEN life_expectancy IS NOT NULL         OR enrichment_status->'life_expectancy'->>'state'         = 'data_unavailable' OR shell_status = 'territory' THEN 4 ELSE 0 END
      + CASE WHEN literacy_rate IS NOT NULL           OR enrichment_status->'literacy_rate'->>'state'           = 'data_unavailable' OR shell_status = 'territory' THEN 4 ELSE 0 END
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
END; $function$;

-- 4. Enrichment selector: skip territories -------------------------------------
CREATE OR REPLACE FUNCTION public.countries_due_for_enrichment(p_limit integer DEFAULT 20, p_phase text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, name text, content_completeness_score smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.name, c.content_completeness_score
  FROM public.countries c
  WHERE c.duplicate_of_id IS NULL
    AND c.shell_status = 'real'
    AND (
      p_phase = 'all'
      OR (p_phase = 'editorial'
          AND c.editorial_hook IS NULL
          AND COALESCE(c.enrichment_status->'editorial'->>'state','') NOT IN ('published','review'))
      -- HDI omitted: no reliable free per-country source, so it never gates "due".
      OR (p_phase = 'stats' AND (
            (c.gdp_usd IS NULL                 AND COALESCE(c.enrichment_status->'gdp_usd'->>'state','')                <> 'data_unavailable')
         OR (c.gdp_per_capita_usd IS NULL      AND COALESCE(c.enrichment_status->'gdp_per_capita_usd'->>'state','')     <> 'data_unavailable')
         OR (c.life_expectancy IS NULL         AND COALESCE(c.enrichment_status->'life_expectancy'->>'state','')         <> 'data_unavailable')
         OR (c.literacy_rate IS NULL           AND COALESCE(c.enrichment_status->'literacy_rate'->>'state','')           <> 'data_unavailable')
      ))
    )
  ORDER BY (c.content_completeness_score IS NULL) DESC,
           c.content_completeness_score ASC NULLS FIRST,
           c.last_refreshed_at ASC NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 250));
$function$;

-- 5. Crons ---------------------------------------------------------------------
-- Daily stats filler (World Bank). Self-heals new/edited countries; idles once full.
SELECT cron.schedule('wf-enrich-country-stats', '45 3 * * *', $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-enrich-country-stats',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
    body := jsonb_build_object('content_type','country','limit',50),
    timeout_milliseconds := 150000
  );
$cron$);

-- Editorial: was weekly (Sun) / batch 8 — too slow (only ~12 countries in weeks).
-- Bump to daily / batch 20 so coverage self-heals; idles once every country has a hook.
SELECT cron.schedule('wf-enrich-country-editorial', '0 6 * * *', $cron$
  SELECT public.enqueue_workflow('enrich-country-editorial', '{"batch_size":20,"triggered_by":"cron"}'::jsonb)
$cron$);
