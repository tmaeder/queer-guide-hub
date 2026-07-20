-- ============================================================
-- Phase 4 — Events: venue linking, flyer-title preservation, lifecycle triage
--
--   * events.raw_title                    — original flyer title, preserved before
--                                           LLM clean_title overwrites (event-agentic-enrich)
--   * find_event_venue_candidates()      — read-only matcher: unlinked events with a
--                                           venue_name against venues by normalized name
--                                           within the same city_id; haversine tiebreak
--   * link_event_venues()                — applies unambiguous exact matches (provenance
--                                           0.95 'name_city_match' + quality signal);
--                                           fuzzy/ambiguous → generic review_queue
--                                           (entity_type='event', deduped on open rows)
--   * run_event_venue_link()             — admin_automations wrapper + paused pg_cron
--   * events_needing_moat_enrich()       — recreated with an ACTIVE-events window
--                                           (start_date >= now()-1y OR NULL)
--   * one-time lifecycle triage          — status='completed' for >1y-old events with
--                                           NULL status ('' is impossible: CHECK constraint)
--
-- Verified schema facts this migration relies on:
--   events: venue_id uuid, venue_name text, city_id uuid, latitude/longitude numeric,
--           status CHECK ('active','cancelled','postponed','completed') nullable,
--           liveness_status NOT NULL DEFAULT 'unknown' (no fill needed),
--           field_provenance jsonb NOT NULL DEFAULT '{}' (no separate provenance table),
--           title_normalized maintained by trigger on title updates.
--   event_quality_signals: signal_type CHECK includes 'enrichment'.
--   There is NO event_review_queue table — the generic public.review_queue
--   (entity_type, entity_id, review_type, details, status DEFAULT 'pending') is the
--   repo's queue for event-level review items (pattern: pipeline-deduplicate).
--   venues: name_normalized maintained by trigger, city_id, latitude/longitude.
--   earthdistance is NOT assumed — plain haversine formula below.
-- Idempotent; safe to re-apply.
-- ============================================================

-- ── 1. events.raw_title ────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS raw_title text;

COMMENT ON COLUMN public.events.raw_title IS
  'Original (often flyer-style) title as ingested, preserved by event-agentic-enrich '
  'before an LLM clean_title (confidence >= 0.9) replaces events.title. Written once: '
  'only when still NULL. NULL means title was never LLM-cleaned.';

-- Helper index for the venue linker: unlinked events that name a venue.
CREATE INDEX IF NOT EXISTS idx_events_venue_unlinked
  ON public.events(city_id)
  WHERE venue_id IS NULL AND venue_name IS NOT NULL AND duplicate_of_id IS NULL;

-- ── 2. candidate finder (read-only) ────────────────────────────────────────
-- Events with venue_id NULL + venue_name set + city_id set (events missing city_id
-- are excluded — geo-link-content resolves those separately) matched against
-- non-duplicate venues in the SAME city by normalized name (public.normalize_name:
-- lower + unaccent + strip punctuation/multi-space). Fuzzy = trigram similarity
-- >= 0.80 on normalized names (dedup-engine review-band convention). distance_m is
-- a plain haversine (earthdistance not assumed), NULL when either side lacks coords.
CREATE OR REPLACE FUNCTION public.find_event_venue_candidates(
  p_limit int DEFAULT 500, p_active_only boolean DEFAULT true)
RETURNS TABLE(
  event_id uuid, venue_id uuid, event_venue_name text, venue_name text,
  name_exact boolean, distance_m numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions' AS $$
  WITH ev AS (
    SELECT e.id, e.venue_name, e.city_id, e.latitude, e.longitude,
           public.normalize_name(e.venue_name) AS vn_norm
    FROM public.events e
    WHERE e.venue_id IS NULL
      AND e.venue_name IS NOT NULL AND btrim(e.venue_name) <> ''
      AND e.city_id IS NOT NULL
      AND e.duplicate_of_id IS NULL
      AND (NOT p_active_only
           OR e.start_date IS NULL
           OR e.start_date >= now() - interval '1 year')
    ORDER BY e.start_date DESC NULLS LAST
    LIMIT greatest(coalesce(p_limit, 500), 0)
  )
  SELECT ev.id,
         v.id,
         ev.venue_name,
         v.name,
         (coalesce(v.name_normalized, public.normalize_name(v.name)) = ev.vn_norm) AS name_exact,
         CASE
           WHEN ev.latitude IS NOT NULL AND ev.longitude IS NOT NULL
            AND v.latitude  IS NOT NULL AND v.longitude  IS NOT NULL THEN
             round((2 * 6371000 * asin(least(1.0::float8, sqrt(
                 power(sin(radians((v.latitude - ev.latitude)::float8) / 2), 2)
               + cos(radians(ev.latitude::float8)) * cos(radians(v.latitude::float8))
               * power(sin(radians((v.longitude - ev.longitude)::float8) / 2), 2)
             ))))::numeric, 1)
           ELSE NULL
         END AS distance_m
  FROM ev
  JOIN public.venues v
    ON v.city_id = ev.city_id
   AND v.duplicate_of_id IS NULL
  WHERE ev.vn_norm <> ''
    AND (coalesce(v.name_normalized, public.normalize_name(v.name)) = ev.vn_norm
         OR extensions.similarity(
              coalesce(v.name_normalized, public.normalize_name(v.name)), ev.vn_norm) >= 0.80)
  ORDER BY ev.id,
           (coalesce(v.name_normalized, public.normalize_name(v.name)) = ev.vn_norm) DESC,
           extensions.similarity(
             coalesce(v.name_normalized, public.normalize_name(v.name)), ev.vn_norm) DESC,
           distance_m NULLS LAST;
$$;

COMMENT ON FUNCTION public.find_event_venue_candidates(int, boolean) IS
  'Read-only event→venue link candidates: events with venue_id NULL and a venue_name, '
  'matched against venues in the SAME city_id on normalized name (exact) or trigram '
  'similarity >= 0.80 (fuzzy). Events without city_id are excluded (geo-link-content '
  'fills those). distance_m = plain haversine, NULL when coords missing on either side. '
  'p_active_only limits to start_date >= now()-1y OR NULL. link_event_venues() applies.';

GRANT EXECUTE ON FUNCTION public.find_event_venue_candidates(int, boolean) TO authenticated, service_role;

-- ── 3. linker (writes; admin/internal-gated; dry-run by default) ───────────
-- Auto-link rule: exactly ONE exact-name candidate for the event AND
-- (coords missing on either side OR distance < 500 m). Everything else that
-- surfaced a candidate (fuzzy, ambiguous exact, exact-but-far) goes to the
-- generic review_queue as review_type='venue_link_candidate', deduped on
-- pending rows per event.
CREATE OR REPLACE FUNCTION public.link_event_venues(
  p_limit int DEFAULT 500, p_active_only boolean DEFAULT true, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_candidates int := 0;
  v_linked     int := 0;
  v_queued     int := 0;
BEGIN
  PERFORM public.assert_admin_or_internal();

  -- Report pass (also the dry-run result).
  WITH cand AS (
    SELECT * FROM public.find_event_venue_candidates(p_limit, p_active_only)
  ),
  exact_ok AS (
    SELECT * FROM cand
    WHERE name_exact AND (distance_m IS NULL OR distance_m < 500)
  ),
  auto AS (
    SELECT event_id FROM exact_ok GROUP BY event_id HAVING count(*) = 1
  )
  SELECT (SELECT count(DISTINCT c.event_id) FROM cand c),
         (SELECT count(*) FROM auto),
         (SELECT count(DISTINCT c.event_id) FROM cand c
           WHERE c.event_id NOT IN (SELECT a.event_id FROM auto a))
    INTO v_candidates, v_linked, v_queued;

  IF NOT p_dry_run THEN
    WITH cand AS (
      SELECT * FROM public.find_event_venue_candidates(p_limit, p_active_only)
    ),
    exact_ok AS (
      SELECT * FROM cand
      WHERE name_exact AND (distance_m IS NULL OR distance_m < 500)
    ),
    auto AS (
      SELECT event_id,
             (array_agg(venue_id))[1]   AS venue_id,
             (array_agg(distance_m))[1] AS distance_m
      FROM exact_ok GROUP BY event_id HAVING count(*) = 1
    ),
    upd AS (
      UPDATE public.events e
         SET venue_id = a.venue_id,
             field_provenance = jsonb_set(
               coalesce(e.field_provenance, '{}'::jsonb), ARRAY['venue_id'],
               jsonb_build_object(
                 'value', a.venue_id, 'confidence', 0.95,
                 'source', 'name_city_match', 'linked_at', now()), true)
        FROM auto a
       WHERE e.id = a.event_id AND e.venue_id IS NULL
      RETURNING e.id, a.venue_id, a.distance_m
    ),
    sig AS (
      INSERT INTO public.event_quality_signals (event_id, signal_type, value, source, details)
      SELECT u.id, 'enrichment', 0.95, 'link_event_venues',
             jsonb_build_object('venue_id', u.venue_id, 'match', 'name_city_match',
                                'distance_m', u.distance_m)
      FROM upd u
      RETURNING 1
    ),
    review AS (
      SELECT DISTINCT c.event_id, c.event_venue_name
      FROM cand c
      WHERE c.event_id NOT IN (SELECT a.event_id FROM auto a)
    ),
    rq AS (
      INSERT INTO public.review_queue (entity_type, entity_id, review_type, status, details)
      SELECT 'event', r.event_id, 'venue_link_candidate', 'pending',
             jsonb_build_object(
               'event_venue_name', r.event_venue_name,
               'candidates', (SELECT jsonb_agg(jsonb_build_object(
                                'venue_id', c2.venue_id, 'venue_name', c2.venue_name,
                                'name_exact', c2.name_exact, 'distance_m', c2.distance_m))
                              FROM cand c2 WHERE c2.event_id = r.event_id),
               'source', 'link_event_venues')
      FROM review r
      WHERE NOT EXISTS (
        SELECT 1 FROM public.review_queue q
        WHERE q.entity_type = 'event' AND q.entity_id = r.event_id
          AND q.review_type = 'venue_link_candidate' AND q.status = 'pending')
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM rq)
      INTO v_linked, v_queued;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run, 'candidates', v_candidates,
    'linked', v_linked, 'queued_for_review', v_queued);
END; $$;

COMMENT ON FUNCTION public.link_event_venues(int, boolean, boolean) IS
  'Applies find_event_venue_candidates(): a single unambiguous exact-name match in the '
  'same city (and < 500 m apart when both sides have coords; coords-missing still links) '
  'sets events.venue_id with jsonb field_provenance {confidence 0.95, source '
  '''name_city_match''} + an ''enrichment'' quality signal. Fuzzy/ambiguous/far matches '
  'insert review_queue rows (entity_type=''event'', review_type=''venue_link_candidate'', '
  'deduped on pending). p_dry_run=true (default) reports counts without writing. '
  'Gated by assert_admin_or_internal(). Idempotent (only fills venue_id NULL).';

GRANT EXECUTE ON FUNCTION public.link_event_venues(int, boolean, boolean) TO authenticated, service_role;

-- ── 4. admin_automations wrapper + trickle cron (registered PAUSED) ────────
-- Mirrors run_data_normalization_guard: enabled-flag check, admin_automation_runs
-- audit rows, nightly pg_cron (no-op while paused; direct DB session passes the
-- internal gate). Active events only, 500/night trickle.
CREATE OR REPLACE FUNCTION public.run_event_venue_link()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_result        jsonb;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'event_venue_link';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'event_venue_link', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  v_result := public.link_event_venues(500, true, false);

  UPDATE public.admin_automation_runs
    SET finished_at=now(),
        items_examined=coalesce((v_result->>'candidates')::int, 0),
        items_changed=coalesce((v_result->>'linked')::int, 0),
        summary=v_result
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

COMMENT ON FUNCTION public.run_event_venue_link() IS
  'admin_automations wrapper for link_event_venues(500, active_only, apply). Registered '
  'PAUSED (enabled=false) — enable via admin UI once a dry-run sample is spot-checked.';

ALTER FUNCTION public.run_event_venue_link() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_event_venue_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_event_venue_link() TO service_role, authenticated;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('event_venue_link','Link events to venues by name+city',
   'Nightly trickle: unambiguous normalized-name matches within the same city set events.venue_id (provenance 0.95, name_city_match); fuzzy/ambiguous matches queue for review. Active events (start_date >= now()-1y or NULL) only, 500/night.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_event_venue_link"}'::jsonb, '25 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='event_venue_link') THEN
    PERFORM cron.unschedule('event_venue_link');
  END IF;
END $$;
SELECT cron.schedule('event_venue_link', '25 3 * * *', 'SELECT public.run_event_venue_link();');

-- ── 5. events_needing_moat_enrich: constrain to ACTIVE events ──────────────
-- Recreate the event-agentic-enrich selector (20260607190000) with an active
-- window: start_date >= now()-1y OR start_date IS NULL. Previously it ordered
-- upcoming-first but could still drain into 2010-2015 historical events once
-- fresh ones were exhausted — wasted LLM budget. Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.events_needing_moat_enrich(p_limit int DEFAULT 10)
RETURNS TABLE (id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT e.id
  FROM public.events e
  WHERE e.duplicate_of_id IS NULL
    AND (e.start_date IS NULL OR e.start_date >= now() - interval '1 year')
    AND (array_length(e.accessibility_attributes, 1) IS NULL
         OR array_length(e.target_groups, 1) IS NULL)
    AND (e.website IS NOT NULL OR e.ticket_url IS NOT NULL)
    AND coalesce(e.website, '') <> 'https://worldnakedbikeride.org'
    AND NOT EXISTS (
      SELECT 1 FROM public.enrichment_log el
      WHERE el.entity_id = e.id
        AND el.step = 'agentic-enrich'
        AND el.created_at > now() - interval '14 days'
    )
  ORDER BY e.start_date DESC NULLS LAST
  LIMIT greatest(p_limit, 0);
$$;

COMMENT ON FUNCTION public.events_needing_moat_enrich(int) IS
  'Selector for event-agentic-enrich: ACTIVE events (start_date >= now()-1y or NULL) '
  'still missing a moat field with a per-event URL, not attempted in 14 days. '
  'Historical events are excluded — they get lifecycle triage, not LLM spend.';

GRANT EXECUTE ON FUNCTION public.events_needing_moat_enrich(int) TO service_role;

-- ── 6. one-time lifecycle triage ────────────────────────────────────────────
-- events.status is nullable with CHECK ('active','cancelled','postponed','completed');
-- '' is impossible (CHECK), so only NULL needs filling. event_auto_archive already
-- completes old events WITH an end_date; this catches NULL-status stragglers.
-- liveness_status is NOT NULL DEFAULT 'unknown' — nothing to fill there.
UPDATE public.events
   SET status = 'completed'
 WHERE start_date < now() - interval '1 year'
   AND status IS NULL;
