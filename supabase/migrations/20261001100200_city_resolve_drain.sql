-- Drain city_resolve_queue, and make a city-duplication regression visible.
--
-- THE QUEUE HAS NEVER BEEN DRAINED. 20260811100100 stopped the personality
-- trigger from minting cities -- correctly; it was blamed for 1,824 of 5,136
-- live rows -- and replaced it with an enqueue, modelled on geo_address_queue +
-- geo_address_drain. The drain half was never built. Measured 2026-08-25: 2 rows
-- pending, newest 2026-08-20, ZERO pg_cron jobs and ZERO admin_automations rows
-- reference the table. The write side was fixed and the read side left open, so
-- the fix reads as "birthplaces stopped resolving".
--
-- It matters more now than it did then: since 20261001100000 every refusal from
-- `city_resolve_or_create` lands here, from paths that run continuously. A sink
-- nothing empties turns a deliberate refusal into a silent loss, which is the
-- failure mode refusing was supposed to avoid.
--
-- PURE SQL, NO EDGE FUNCTION, NO NEW SECRET. The obvious design geocodes each
-- pending row and retries -- but the rows that arrive with no coordinates are
-- overwhelmingly personality birthplaces, and for those the answer is NOT to go
-- find a point: the resolver's probe ladder already runs regardless of
-- coordinates, so a birthplace whose city exists gets linked, and one whose city
-- does not exist SHOULD NOT be created from a bare name. Geocoding would only
-- serve to manufacture the evidence needed to create it, which is the behaviour
-- 20260811100100 removed. So the drain re-probes and gives up; it never invents.
--
-- TERMINAL AFTER 3 ATTEMPTS, matching the table's own CHECK vocabulary and the
-- MAX_LINK_ATTEMPTS convention in city-factual-backfill. Without it the queue
-- head is a permanent carousel -- the same starvation 20260801133923 fixed for
-- cities_due_for_refresh.
--
-- BATCH 50. Each resolved row can write cities (via the resolver) and
-- personalities, and a cities write fans out through trg_sync_geo_spine ->
-- geo_places -> search_documents_sync -> search_reindex_queue. 50 every 15
-- minutes is 4,800/day, far more than this queue will ever hold.

CREATE OR REPLACE FUNCTION public.run_city_resolve_drain(p_batch integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r               record;
  res             record;
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  n_resolved      int := 0;
  n_retry         int := 0;
  n_terminal      int := 0;
  n_linked        int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'city_resolve_drain';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_resolve_drain', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
       SET finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     WHERE id = v_run_id;
    UPDATE public.admin_automations
       SET last_run_at = v_started_at, last_run_status = 'paused' WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  FOR r IN
    SELECT q.*
      FROM public.city_resolve_queue q
     WHERE q.state = 'pending'
     ORDER BY q.created_at
     LIMIT greatest(1, least(p_batch, 500))
  LOOP
    SELECT * INTO res FROM public.city_resolve_or_create(
      p_name             => coalesce(r.base_name, r.raw_name, r.birth_place),
      p_country_id       => r.country_hint_id,
      p_region_hint      => r.region_hint,
      p_lat              => r.latitude,
      p_lng              => r.longitude,
      p_source_slug      => coalesce(r.requester, 'city-resolve-drain'),
      -- 'drain', never 'admin': the admin actor is what waives the evidence bar,
      -- and a background job must not waive it on a human's behalf.
      p_actor            => 'drain'
    );

    IF res.city_id IS NOT NULL THEN
      UPDATE public.city_resolve_queue
         SET state = 'resolved', last_error = NULL, updated_at = now()
       WHERE id = r.id;
      n_resolved := n_resolved + 1;

      -- Only the personality requester owns a column we can fill. Everything
      -- else (venue geocode, CMS) resolves on its own next pass; the queue row
      -- exists so a human can SEE the refusal, not so this job can back-patch
      -- a table it does not own.
      IF r.personality_id IS NOT NULL THEN
        UPDATE public.personalities p
           SET city_id = res.city_id
         WHERE p.id = r.personality_id AND p.city_id IS NULL;
        IF FOUND THEN n_linked := n_linked + 1; END IF;
      END IF;
    ELSE
      IF r.attempts + 1 >= 3 THEN
        UPDATE public.city_resolve_queue
           SET state = 'data_unavailable', attempts = r.attempts + 1,
               last_error = res.reason, updated_at = now()
         WHERE id = r.id;
        n_terminal := n_terminal + 1;
      ELSE
        UPDATE public.city_resolve_queue
           SET attempts = r.attempts + 1, last_error = res.reason, updated_at = now()
         WHERE id = r.id;
        n_retry := n_retry + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.admin_automation_runs
     SET finished_at = now(),
         items_examined = n_resolved + n_retry + n_terminal,
         items_changed  = n_resolved,
         summary = jsonb_build_object('resolved', n_resolved, 'retried', n_retry,
                                      'terminal', n_terminal, 'personalities_linked', n_linked,
                                      'pending_remaining',
                                      (SELECT count(*) FROM public.city_resolve_queue WHERE state = 'pending'))
   WHERE id = v_run_id;
  UPDATE public.admin_automations
     SET last_run_at = v_started_at, last_run_status = 'success' WHERE id = v_automation_id;

  RETURN jsonb_build_object('resolved', n_resolved, 'retried', n_retry,
                            'terminal', n_terminal, 'personalities_linked', n_linked);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
     SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations
     SET last_run_at = v_started_at, last_run_status = 'error' WHERE id = v_automation_id;
  RAISE;
END; $$;

ALTER FUNCTION public.run_city_resolve_drain(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_resolve_drain(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_city_resolve_drain(integer) TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'city_resolve_drain',
  'Drain the city resolve queue',
  'Every 15 min: re-probes every refusal from city_resolve_or_create through the same resolver and links the personality when the requester was one. Never geocodes and never waives the evidence bar (actor=drain, not admin) -- a birthplace whose city does not exist stays unlinked by design. Terminal at 3 attempts. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','rpc','fn','run_city_resolve_drain','jobname','city_resolve_drain',
                     'command','SELECT public.run_city_resolve_drain(50);'),
  '*/15 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      schedule = EXCLUDED.schedule, action = EXCLUDED.action, enabled = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('city_resolve_drain'); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a WHERE a.slug = 'city_resolve_drain';

-- ---------------------------------------------------------------------------
-- Sentinel. Without this, a writer that starts minting exonyms again is
-- invisible: nothing anywhere counts cities that are probably one place.
--
-- Body transcribed verbatim from the live definition with one key added -- the
-- established pattern for this function (20260916120000 did the same).
--
-- COST: the near-pair count is a self-join over the ~5.1k cities that carry
-- coordinates, measured at 493 ms with a grid-cell prefilter. That is the whole
-- reason the grid columns exist; without them the planner has nothing to cut on
-- and `cities` carries no GIST index. Do not "simplify" the floor() terms away.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pipeline_hygiene_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'cron_total', (SELECT count(*) FROM cron.job WHERE active),
    'legacy_cron_jobs', COALESCE((
      SELECT jsonb_agg(jobname) FROM cron.job
      WHERE jobname IN (
        'pipeline-venue-validate', 'pipeline-venue-dedup', 'pipeline-venue-commit',
        'pipeline-event-validate', 'pipeline-event-dedup', 'pipeline-event-commit'
      )
      OR jobname LIKE 'translate-i18n-%'
      OR jobname LIKE 'tag\_i18n\_%' ESCAPE '\'
    ), '[]'::jsonb),
    'i18n_percombo_cron_count', (
      SELECT count(*) FROM cron.job
      WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
        AND jobname NOT IN ('i18n_translation_dispatch')
    ),
    'staging_pending_review', (
      SELECT count(*) FROM public.ingestion_staging
      WHERE review_status = 'pending_review' AND disposition = 'pending'
    ),
    'unregistered_cron_jobs', COALESCE((
      SELECT jsonb_agg(j.jobname) FROM cron.job j
      WHERE j.active
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_automations a
          WHERE a.action->>'jobname' = j.jobname
             OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
        )
    ), '[]'::jsonb),
    -- 2026-08 overhaul P2: rows stuck mid-pipeline. This is the generalized
    -- form of the leak that spawned the per-stage drain crons (rows staged
    -- outside a pipeline run never draining). Keyed by target_table (the
    -- router key; entity_type spellings are inconsistent in old rows).
    'stale_pending_by_entity', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND created_at < now() - interval '48 hours'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    -- 2026-08-22: a human approved it and nothing downstream can see it. This
    -- is a subset of stale_pending_by_entity that its thresholds could never
    -- surface — 14 rows hid under a 3,500-row warn floor for 40 days — and it
    -- is worse than ordinary starvation, because a person was asked, answered,
    -- and the answer was dropped.
    'stranded_human_approved', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND review_status = 'approved'
          AND ai_validation_status IS DISTINCT FROM 'approved'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    'search_reindex_queue_depth', (
      SELECT count(*) FROM public.search_reindex_queue
    ),
    -- 2026-08-25: city duplication. Every existing unique key on `cities` keys
    -- on the string, so the class that survives is "same place, different
    -- string" — and nothing counted it. near_pairs is the population the
    -- coordinate sweep arm works from; the other four are the health of the
    -- machinery that is supposed to keep it from growing.
    'city_dup_signals', jsonb_build_object(
      'near_pairs', (
        WITH live AS (
          SELECT c.id, c.country_id, c.latitude AS lat, c.longitude AS lng,
                 c.wikidata_qid AS qid,
                 floor(c.latitude * 5)::int AS gy, floor(c.longitude * 5)::int AS gx
          FROM public.cities c
          WHERE c.duplicate_of_id IS NULL
            AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        )
        SELECT count(*) FROM live a JOIN live b
          ON a.country_id = b.country_id AND a.id < b.id
         AND b.gy BETWEEN a.gy - 1 AND a.gy + 1
         AND b.gx BETWEEN a.gx - 1 AND a.gx + 1
         AND public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 2000
         -- Two distinct QIDs are two distinct entities: a district beside its
         -- own city is not a duplicate and must never be counted as one.
         AND NOT (a.qid IS NOT NULL AND b.qid IS NOT NULL AND a.qid <> b.qid)
      ),
      'qid_coverage_pct', (
        SELECT CASE WHEN count(*) = 0 THEN 100
               ELSE round(100.0 * count(*) FILTER (WHERE wikidata_qid IS NOT NULL) / count(*))::int END
        FROM public.cities WHERE duplicate_of_id IS NULL
      ),
      'cities_without_aliases', (
        SELECT count(*) FROM public.cities c
        WHERE c.duplicate_of_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.city_aliases a WHERE a.city_id = c.id)
      ),
      'alias_rows', (SELECT count(*) FROM public.city_aliases),
      'resolve_queue_pending', (
        SELECT count(*) FROM public.city_resolve_queue WHERE state = 'pending'
      ),
      'resolve_queue_oldest_pending_hours', (
        SELECT coalesce(round(extract(epoch FROM now() - min(created_at)) / 3600)::int, 0)
        FROM public.city_resolve_queue WHERE state = 'pending'
      ),
      -- name_normalized is '' for any name with no [a-z0-9] character, which is
      -- every city whose primary name is in Greek, Japanese, Korean, Hebrew,
      -- Cyrillic, Georgian, Thai, Khmer or Lao. The partial unique index
      -- uk_cities_country_name_active (country_id, name_normalized) therefore
      -- admits exactly ONE such city per country — measured 2026-08-25: 27 rows
      -- over 27 distinct countries, which is the index, not the world. Tracked
      -- rather than fixed here: changing that index is a separate decision.
      'empty_name_normalized', (
        SELECT count(*) FROM public.cities
        WHERE duplicate_of_id IS NULL AND coalesce(name_normalized, '') = ''
      )
    )
  );
$function$;
