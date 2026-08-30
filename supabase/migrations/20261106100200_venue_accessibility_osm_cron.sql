-- venue-accessibility-osm: work-list selectors, breaker, registry row, cron.
--
-- Inverts OSM from discovery to coordinate-keyed ENRICHMENT. Discovery is
-- saturated: the last five nightly `vn_fill_osm` runs each fetched items_total
-- 120 and skipped all 120 as already-known, and only 200 venue_sources rows are
-- OSM at all. The value is in asking OSM about the ~20,600 geocoded venues we
-- already hold, which is what this job does.

-- ---------------------------------------------------------------------------
-- 1. The breaker MUST be registered, not merely wrapped in code.
--    `checkCircuit` returns {allowed:true} when the row is ABSENT, so an
--    unseeded breaker can never trip — `wikipedia.api`, `wikidata.api` and
--    `osm.nominatim` were unprotected for their whole lives for exactly this
--    reason. Code alone is a silent no-op.
--
--    5 failures / 300s reset matches the other read-only public APIs. Note what
--    the function does NOT file as a failure: a 429 or 5xx (a busy mirror is
--    normal under load) and a remark-bearing 200 (a query timeout). Only a
--    transport error or a 4xx counts, or the breaker would open on every burst.
-- ---------------------------------------------------------------------------
SELECT public.register_circuit_breaker('osm.overpass', 5, 300);

-- ---------------------------------------------------------------------------
-- 2. Work-list selector.
--
--    ORDERING IS THE ROUND-ROBIN CURSOR and the stamp is what advances it.
--    `city-factual-backfill` filled nothing for 36 days because its selector
--    collapsed onto a pool of rows it could never fill and re-offered the same
--    head forever; the fix there, and the rule here, is that EVERY visit stamps
--    — including a miss.
--
--    `unknown` stays retryable up to 3 attempts. An Overpass timeout is absence
--    of evidence, and recording it as evidence of absence is how a dead logo.dev
--    token stamped 6,498 venues as "no logo" and wrote them off permanently.
--
--    Toilets are deliberately IN scope despite the §1.7 denominator excluding
--    them: a public toilet is where an accessible-restroom claim matters most.
--    Most will stamp 'none' (OSM toilet features are usually unnamed and the
--    name match will not resolve), which is cheap and correct.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venues_due_for_osm_accessibility(p_limit integer DEFAULT 25)
RETURNS TABLE (
  id uuid,
  name text,
  latitude numeric,
  longitude numeric,
  accessibility_attributes text[],
  osm_ref text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.id, v.name, v.latitude, v.longitude,
         coalesce(v.accessibility_attributes, '{}'::text[]),
         -- An OSM id we already hold makes identity KNOWN, so the function does
         -- not have to infer it from a name inside a radius. source-osm-venue
         -- writes source_entity_id as `osm-<type>-<id>`; Overpass addresses the
         -- same element as `<type>/<id>`.
         (
           SELECT regexp_replace(vs.source_entity_id, '^osm-([a-z]+)-([0-9]+)$', '\1/\2')
           FROM public.venue_sources vs
           WHERE vs.venue_id = v.id
             AND vs.source_slug = 'osm'
             AND vs.source_entity_id ~ '^osm-[a-z]+-[0-9]+$'
           LIMIT 1
         )
  FROM public.venues v
  WHERE v.duplicate_of_id IS NULL
    AND v.closed_at IS NULL
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND (
      v.enrichment_status->'osm_accessibility' IS NULL
      OR (
        v.enrichment_status->'osm_accessibility'->>'state' = 'unknown'
        AND coalesce((v.enrichment_status->'osm_accessibility'->>'attempts')::int, 1) < 3
      )
    )
  -- Never-probed first (NULL stamp), then oldest retry. ISO-8601 sorts
  -- lexicographically, so the text comparison is the chronological one.
  ORDER BY (v.enrichment_status->'osm_accessibility'->>'at') ASC NULLS FIRST, v.id
  LIMIT greatest(1, least(coalesce(p_limit, 25), 200));
$function$;

COMMENT ON FUNCTION public.venues_due_for_osm_accessibility(integer) IS
  'Work list for venue-accessibility-osm: live geocoded venues never probed, plus unknown-state retries under 3 attempts. Ordered by stamp age so every visit advances the cursor.';

CREATE OR REPLACE FUNCTION public.venues_osm_accessibility_by_id(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  name text,
  latitude numeric,
  longitude numeric,
  accessibility_attributes text[],
  osm_ref text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.id, v.name, v.latitude, v.longitude,
         coalesce(v.accessibility_attributes, '{}'::text[]),
         (
           SELECT regexp_replace(vs.source_entity_id, '^osm-([a-z]+)-([0-9]+)$', '\1/\2')
           FROM public.venue_sources vs
           WHERE vs.venue_id = v.id
             AND vs.source_slug = 'osm'
             AND vs.source_entity_id ~ '^osm-[a-z]+-[0-9]+$'
           LIMIT 1
         )
  FROM public.venues v
  WHERE v.id = ANY(coalesce(p_ids, '{}'::uuid[]))
    AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The stamp. Counts consecutive `unknown` visits so a mirror outage retries
--    a bounded number of times and then stops, rather than either giving up on
--    the first timeout or re-probing the same venue forever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_venue_osm_accessibility(p_venue_id uuid, p_detail jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev     jsonb;
  v_attempts integer;
BEGIN
  SELECT coalesce(enrichment_status->'osm_accessibility', '{}'::jsonb)
  INTO v_prev FROM public.venues WHERE id = p_venue_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Any conclusive answer resets the counter; only `unknown` accumulates.
  v_attempts := CASE
    WHEN p_detail->>'state' = 'unknown' THEN coalesce((v_prev->>'attempts')::int, 0) + 1
    ELSE 0
  END;

  UPDATE public.venues
  SET enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb),
        '{osm_accessibility}',
        p_detail || jsonb_build_object('attempts', v_attempts),
        true)
  WHERE id = p_venue_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.venues_due_for_osm_accessibility(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venues_osm_accessibility_by_id(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_venue_osm_accessibility(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venues_due_for_osm_accessibility(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.venues_osm_accessibility_by_id(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.stamp_venue_osm_accessibility(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Registry row FIRST, then the cron derived from it.
--
--    `admin_automations` is the record of record and pg_cron is the only
--    scheduler. `sync_automations_to_cron()` recreates any enabled row whose job
--    is missing, so a bare `cron.unschedule` is undone by the next reconciler
--    pass — retirement means DISABLING the row, never deleting it.
--
--    `action.command` carries the PLAIN readable SQL. The run-tracking
--    reconciler derives the wrapper itself (`admin_automation_effective_command`);
--    a pre-wrapped command here would be re-wrapped and break.
--
--    CADENCE: */20 x batch 25 = ~1,800 venues/day, so the ~20,600 geocoded
--    corpus drains in roughly eleven days and then tapers to retries. Overpass
--    is a free community endpoint and the function already sleeps 1.1s between
--    calls per OSM's usage policy — do not raise the batch to "catch up".
--
--    timeout_milliseconds IS SET EXPLICITLY. pg_net's default is 5s and a
--    response arriving after it is recorded as `timed_out` -> `partial`, which
--    never touches consecutive_failures — so a job that always overruns the
--    default can neither auto-pause nor read as failing. 250s covers the
--    function's own 240s wall clock.
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
VALUES (
  'venue_accessibility_osm',
  'Venue accessibility from OpenStreetMap',
  'Coordinate-keyed OSM enrichment over geocoded venues. Harvests the full wheelchair vocabulary (yes/limited/no/designated), toilets:wheelchair, toilets:unisex, ramp, elevator, step_count and tactile paving onto venues.accessibility_attributes. Identity requires an OSM id we already hold or a name match inside 60 m; two same-named candidates block. A disagreement keeps the negative and opens a venue_review_queue row.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'venue_accessibility_osm',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-accessibility-osm',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='amenity_quality_webhook_secret')
    ),
    body := '{"batch_limit":25}'::jsonb,
    timeout_milliseconds := 250000
  ) as request_id;
  $cmd$
  ),
  '*/20 * * * *',
  true,
  'system'
)
ON CONFLICT (slug) DO UPDATE
  SET enabled     = true,
      schedule    = excluded.schedule,
      action      = excluded.action,
      description = excluded.description;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venue_accessibility_osm') THEN
    PERFORM cron.unschedule('venue_accessibility_osm');
  END IF;
END $$;

SELECT cron.schedule(
  'venue_accessibility_osm',
  '*/20 * * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-accessibility-osm',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='amenity_quality_webhook_secret')
    ),
    body := '{"batch_limit":25}'::jsonb,
    timeout_milliseconds := 250000
  ) as request_id;
  $cron$
);

-- A migration's `cron.schedule` is not durable on its own — `20260820191944` is
-- the record of a threshold fix issued exactly this way that never took, leaving
-- the registry and the live job disagreeing for two weeks. Assert both sides
-- here rather than trusting the statement above.
DO $$
DECLARE v_sched text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_automations WHERE slug = 'venue_accessibility_osm' AND enabled) THEN
    RAISE EXCEPTION 'venue_accessibility_osm registry row missing or disabled';
  END IF;

  SELECT schedule INTO v_sched FROM cron.job WHERE jobname = 'venue_accessibility_osm';
  IF v_sched IS NULL THEN
    RAISE EXCEPTION 'venue_accessibility_osm cron job was not created';
  END IF;
  IF v_sched <> '*/20 * * * *' THEN
    RAISE EXCEPTION 'venue_accessibility_osm cron schedule drifted at creation: %', v_sched;
  END IF;

  -- The breaker row must EXIST, or withCircuitBreaker in the function is a no-op.
  IF NOT EXISTS (SELECT 1 FROM public.api_circuit_breakers WHERE api_name = 'osm.overpass') THEN
    RAISE EXCEPTION 'osm.overpass breaker row missing — checkCircuit allows when absent';
  END IF;
END $$;
