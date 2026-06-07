-- City completeness score — queer-weighted field coverage (0..100).
-- Dedicated to cities; does NOT touch compute_visibility_score (other entities depend on it).
-- Weights deliberately favor queer-relevant content over generic trivia so empty
-- mayor/sister_cities/postal_codes cannot inflate a score while a city has no description.
--   queer_content 0.30 | description 0.20 | travel 0.15 |
--   geo 0.15           | image 0.10       | basics 0.07 | trivia 0.03

CREATE OR REPLACE FUNCTION public.compute_city_completeness(p_id uuid)
RETURNS smallint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c               public.cities%ROWTYPE;
  v_villages      int := 0;
  v_queer         numeric := 0;
  v_description   numeric := 0;
  v_travel        numeric := 0;
  v_geo           numeric := 0;
  v_image         numeric := 0;
  v_basics        numeric := 0;
  v_trivia        numeric := 0;
  v_desc_len      int := 0;
BEGIN
  SELECT * INTO c FROM public.cities WHERE id = p_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT count(*) INTO v_villages FROM public.queer_villages q WHERE q.city_id = p_id;

  -- queer_content (0.30): rating 0.4 + neighborhoods 0.4 + safety-aware customs 0.2
  v_queer :=
      (CASE WHEN c.lgbt_friendly_rating IS NOT NULL THEN 0.4 ELSE 0 END)
    + (CASE WHEN v_villages > 0 THEN 0.4 ELSE 0 END)
    + (CASE WHEN c.local_customs IS NOT NULL
            AND c.local_customs ~* '(lgbt|lgbtq|queer|gay|trans|safe|safety|pride)' THEN 0.2 ELSE 0 END);

  -- description (0.20): length ladder
  v_desc_len := coalesce(length(trim(c.description)), 0);
  v_description := CASE
    WHEN v_desc_len >= 200 THEN 1.0
    WHEN v_desc_len >= 80  THEN 0.7
    WHEN v_desc_len >= 40  THEN 0.4
    ELSE 0 END;

  -- travel (0.15): best_time 0.5 + climate 0.25 + airport 0.25
  v_travel :=
      (CASE WHEN c.best_time_to_visit IS NOT NULL THEN 0.5 ELSE 0 END)
    + (CASE WHEN c.climate_type IS NOT NULL THEN 0.25 ELSE 0 END)
    + (CASE WHEN c.major_airport_code IS NOT NULL THEN 0.25 ELSE 0 END);

  -- geo (0.15): valid coords 0.7 + timezone 0.3
  v_geo :=
      (CASE WHEN c.latitude IS NOT NULL AND c.longitude IS NOT NULL
                 AND NOT (c.latitude = 0 AND c.longitude = 0) THEN 0.7 ELSE 0 END)
    + (CASE WHEN c.timezone IS NOT NULL THEN 0.3 ELSE 0 END);

  -- image (0.10)
  v_image := CASE WHEN c.curated_image_url IS NOT NULL OR c.image_url IS NOT NULL THEN 1.0 ELSE 0 END;

  -- basics (0.07): population 0.4 + region 0.3 + country 0.3
  v_basics :=
      (CASE WHEN c.population IS NOT NULL THEN 0.4 ELSE 0 END)
    + (CASE WHEN c.region_name IS NOT NULL THEN 0.3 ELSE 0 END)
    + (CASE WHEN c.country_id IS NOT NULL THEN 0.3 ELSE 0 END);

  -- trivia (0.03): each adds a quarter
  v_trivia :=
      (CASE WHEN c.mayor IS NOT NULL THEN 0.25 ELSE 0 END)
    + (CASE WHEN c.founded_year IS NOT NULL THEN 0.25 ELSE 0 END)
    + (CASE WHEN c.sister_cities IS NOT NULL AND array_length(c.sister_cities,1) > 0 THEN 0.25 ELSE 0 END)
    + (CASE WHEN c.postal_codes IS NOT NULL AND array_length(c.postal_codes,1) > 0 THEN 0.25 ELSE 0 END);

  RETURN round(100 * least(1.0, greatest(0.0,
      0.30*v_queer + 0.20*v_description + 0.15*v_travel
    + 0.15*v_geo   + 0.10*v_image       + 0.07*v_basics + 0.03*v_trivia)))::smallint;
END; $$;
ALTER FUNCTION public.compute_city_completeness(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compute_city_completeness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_city_completeness(uuid) TO service_role, authenticated;

-- Batch recompute (nightly, before trust). Emits a 'completeness' signal per scored city.
CREATE OR REPLACE FUNCTION public.run_city_completeness_recompute(p_force boolean DEFAULT false)
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
  FROM public.admin_automations WHERE slug = 'city_completeness_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_completeness_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT c.id, public.compute_city_completeness(c.id) AS new_score
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND (p_force OR c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at
           OR c.last_verified_at < now() - interval '30 days')
  ),
  upd AS (
    UPDATE public.cities c SET completeness_score = s.new_score
    FROM scope s
    WHERE c.id = s.id AND c.completeness_score IS DISTINCT FROM s.new_score
    RETURNING c.id, s.new_score
  ),
  sig AS (
    INSERT INTO public.city_quality_signals (city_id, signal_type, value, source)
    SELECT id, 'completeness', (new_score/100.0)::numeric(5,4), 'completeness_recompute' FROM upd
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;

  SELECT count(*) INTO v_examined FROM public.cities c
  WHERE c.duplicate_of_id IS NULL
    AND (p_force OR c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at
         OR c.last_verified_at < now() - interval '30 days');

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('rescored',v_changed,'examined',v_examined,'forced',p_force) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_city_completeness_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_completeness_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_completeness_recompute(boolean) TO service_role, authenticated;

-- register automation (PAUSED), schedule before trust (45) at 30.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('city_completeness_recompute','Recompute city completeness scores',
   'Nightly queer-weighted field-coverage score (0-100) per city. Feeds trust recompute.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_city_completeness_recompute"}'::jsonb, '30 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- extend dispatch RPCs with the completeness branch.
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSIF p_slug = 'event_trust_recompute' THEN v_result := public.run_event_trust_recompute();
  ELSIF p_slug = 'event_coverage_radar' THEN v_result := public.run_event_coverage_radar();
  ELSIF p_slug = 'venue_coord_snap' THEN v_result := public.run_venue_coord_snap();
  ELSIF p_slug = 'city_trust_recompute' THEN v_result := public.run_city_trust_recompute();
  ELSIF p_slug = 'city_coverage_radar' THEN v_result := public.run_city_coverage_radar();
  ELSIF p_slug = 'city_completeness_recompute' THEN v_result := public.run_city_completeness_recompute();
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  IF p_slug = 'event_auto_archive' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE status='active' AND end_date IS NOT NULL AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending' AND created_at < now() - interval '60 days';
  ELSIF p_slug = 'workflow_runs_purge' THEN
    SELECT count(*) INTO v_examined FROM public.workflow_runs
    WHERE status='completed' AND started_at < now() - interval '30 days';
  ELSIF p_slug = 'enrichment_log_purge' THEN
    SELECT count(*) INTO v_examined FROM public.enrichment_log
    WHERE status IN ('skipped','done') AND created_at < now() - interval '30 days';
  ELSIF p_slug = 'event_trust_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');
  ELSIF p_slug = 'event_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE is_major_city = true;
  ELSIF p_slug = 'venue_coord_snap' THEN
    SELECT count(*) INTO v_examined FROM public.venues_misplaced(NULL) WHERE is_geocodable = false;
  ELSIF p_slug IN ('city_trust_recompute','city_completeness_recompute') THEN
    SELECT count(*) INTO v_examined FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND (c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at OR c.last_verified_at < now() - interval '30 days');
  ELSIF p_slug = 'city_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE duplicate_of_id IS NULL;
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- cron (no-op while paused)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='city_completeness_recompute') THEN PERFORM cron.unschedule('city_completeness_recompute'); END IF;
END $$;
SELECT cron.schedule('city_completeness_recompute', '30 3 * * *', 'SELECT public.run_city_completeness_recompute();');
