-- Venue data-quality backfill engine (2026-06-18)
-- Audit found the enrichment engines only fire on NEW ingest; the 23.9k live venues
-- are idle. Descriptions 25%, lgbti relevance 4.5k null/1.3k never-classified, and
-- quality_score is stamped once at ingest then never recomputed.
--
-- This wires three backfill loops onto the EXISTING engines:
--   1. venues_due_for_description()  -> venue-description-backfill edge fn (CF Workers AI)
--   2. classify-relevance-backfill   -> drains never-classified venues (free CF AI)
--   3. run_venue_quality_recompute() -> nightly pure-SQL refresh of quality_score
--
-- All batches stay <=300 because venues UPDATEs fire trg_search_documents_venue and
-- the search sync is disk-constrained (per CLAUDE.md).

-- ---------------------------------------------------------------------------
-- 1. Work-list selector: venues missing a usable description, highest-value first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venues_due_for_description(p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, name text, category text, description text, address text, city text, country text, tags text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.assert_admin_or_internal();
  SELECT v.id, v.name, v.category, v.description, v.address, v.city, v.country, v.tags
  FROM public.venues v
  WHERE v.closed_at IS NULL
    AND v.duplicate_of_id IS NULL
    AND (v.description IS NULL OR length(btrim(v.description)) < 40)
    AND length(coalesce(v.name, '')) > 1
    AND (v.city IS NOT NULL OR v.address IS NOT NULL)
  ORDER BY
    v.lgbti_relevance_score DESC NULLS LAST,  -- queer-relevant venues users see first
    v.quality_score ASC NULLS FIRST,
    v.last_refreshed_at ASC NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 300));
$function$;

GRANT EXECUTE ON FUNCTION public.venues_due_for_description(integer) TO service_role, authenticated;
COMMENT ON FUNCTION public.venues_due_for_description(integer) IS
  'Prioritized batch for venue-description-backfill: empty/short description, ranked by LGBTQ+ relevance then low quality. Excludes closed/duplicate venues.';

-- ---------------------------------------------------------------------------
-- 2. Nightly quality_score recompute over recently-touched venues.
--    Only writes when the score actually changed (IS DISTINCT FROM) to keep the
--    search-sync trigger storm bounded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_venue_quality_recompute(p_batch integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now();
  v_examined int := 0; v_changed int := 0;
  v_batch int := GREATEST(1, LEAST(coalesce(p_batch, 300), 300));
  rec record; v_new smallint;
BEGIN
  PERFORM public.assert_admin_or_internal();

  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'venue_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'venue_quality_recompute', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs SET finished_at = now(),
      summary = jsonb_build_object('skipped', true, 'reason', 'paused') WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started, last_run_status = 'paused'
      WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  -- Recompute exactly the venues whose content changed recently (the backfills stamp
  -- last_refreshed_at), plus any never-scored rows. Bounded by v_batch.
  FOR rec IN
    SELECT v.id, v.quality_score
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL
      AND (v.last_refreshed_at >= now() - interval '2 days' OR v.quality_score IS NULL)
    ORDER BY v.last_refreshed_at DESC NULLS FIRST
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;
    v_new := public.compute_quality_score('venue', rec.id);
    IF v_new IS DISTINCT FROM rec.quality_score THEN
      UPDATE public.venues SET quality_score = v_new WHERE id = rec.id;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  UPDATE public.admin_automation_runs
    SET finished_at = now(), status = 'success',
        items_examined = v_examined, items_changed = v_changed,
        summary = jsonb_build_object('examined', v_examined, 'changed', v_changed)
    WHERE id = v_run_id;
  UPDATE public.admin_automations
    SET last_run_at = v_started, last_run_status = 'success' WHERE id = v_automation_id;

  RETURN jsonb_build_object('examined', v_examined, 'changed', v_changed);
END;
$function$;

REVOKE ALL ON FUNCTION public.run_venue_quality_recompute(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_venue_quality_recompute(integer) TO service_role;
COMMENT ON FUNCTION public.run_venue_quality_recompute(integer) IS
  'Nightly: recompute quality_score for recently-refreshed/never-scored venues. Writes only changed rows (bounds search-sync trigger). Batch hard-capped at 300.';

-- ---------------------------------------------------------------------------
-- 3. Register automations (admin surface) + pg_cron schedules.
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, action, schedule)
VALUES
  ('venue_description_backfill', 'Venue description backfill',
   'Fills missing venue descriptions on existing rows via CF Workers AI (enrichVenueWithAI), highest LGBTQ+-relevance first. Daily, capped.',
   'system', true, '{"type":"schedule"}'::jsonb,
   '{"type":"edge_function","fn":"venue-description-backfill"}'::jsonb, '45 4 * * *'),
  ('venue_relevance_backfill', 'Venue LGBTQ+ relevance backfill',
   'Scores never-classified venues for LGBTQ+ relevance (classify-relevance-backfill, free CF AI). Daily.',
   'system', true, '{"type":"schedule"}'::jsonb,
   '{"type":"edge_function","fn":"classify-relevance-backfill"}'::jsonb, '30 4 * * *'),
  ('venue_quality_recompute', 'Venue quality-score recompute',
   'Nightly pure-SQL refresh of venues.quality_score for recently-touched/never-scored venues.',
   'system', true, '{"type":"schedule"}'::jsonb,
   '{"type":"rpc","fn":"run_venue_quality_recompute"}'::jsonb, '0 6 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name = excluded.name, description = excluded.description,
      trigger = excluded.trigger, action = excluded.action, schedule = excluded.schedule;

-- Crons. Edge-fn jobs reuse the amenity_quality webhook secret (same venue-quality
-- domain); the recompute is pure SQL. URL hardcoded like the amenity cron — vault
-- holds no SUPABASE_URL here.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venue_description_backfill') THEN
    PERFORM cron.unschedule('venue_description_backfill');
  END IF;
  PERFORM cron.schedule('venue_description_backfill', '45 4 * * *', $cron$
    select net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-description-backfill',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='amenity_quality_webhook_secret')
      ),
      body := '{"batch_limit":40}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$);

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venue_relevance_backfill') THEN
    PERFORM cron.unschedule('venue_relevance_backfill');
  END IF;
  PERFORM cron.schedule('venue_relevance_backfill', '30 4 * * *', $cron$
    select net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/classify-relevance-backfill',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='amenity_quality_webhook_secret')
      ),
      body := '{"entity_type":"venue","batch_size":50}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$);

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venue_quality_recompute') THEN
    PERFORM cron.unschedule('venue_quality_recompute');
  END IF;
  PERFORM cron.schedule('venue_quality_recompute', '0 6 * * *',
    $cron$ SELECT public.run_venue_quality_recompute(300); $cron$);
END $$;
