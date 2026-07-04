-- Existence Truth Engine — M2 decision functions (2026-06-23)
--
-- run_existence_decision(p_entity_type, p_dry_run) reads the entity_existence_signals
-- ledger and conservatively archives venues / events / marketplace_listings that no
-- longer exist. House rule (generalized from run_venue_closure_decision):
--   * AUTO-ARCHIVE only when >= 2 INDEPENDENT strong-dead signal_kinds agree AND no
--     fresh 'alive' signal is newer than the deciding dead signal.
--   * GUARDS (never auto-archive): featured, or community-alive (reviews/checkins/
--     saves) -> route to needs_attention + a review flag instead.
--   * SINGLE strong-dead signal -> needs_attention + review flag (human decides).
--   * REOPEN runs FIRST: an archived entity that shows a fresh 'alive' signal is
--     restored from prev_state.
-- Storm-safe: the candidate set is driven off the partial strong-signal index (tiny),
-- terminal writes carry an IS DISTINCT FROM guard so unchanged rows are not rewritten
-- (and therefore not reindexed), and SET LOCAL statement_timeout=0 lets the per-row
-- search reindex finish. Venues additionally delegate the legacy url+stale closure to
-- run_venue_closure_decision (its own venue_closed_audit + reopen logic, untouched).

CREATE OR REPLACE FUNCTION public.run_existence_decision(
  p_entity_type text,
  p_dry_run boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_strong text[] := ARRAY['http_status','jsonld_status','content_closed_phrase',
                           'external_wikidata','price_availability','admin'];
  v_archive_eligible int := 0;
  v_archived int := 0;
  v_flagged int := 0;
  v_reopened int := 0;
  v_slug text := 'existence_decision_'||p_entity_type;
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now();
BEGIN
  PERFORM public.assert_admin_or_internal();
  IF p_entity_type NOT IN ('venue','event','marketplace') THEN
    RAISE EXCEPTION 'run_existence_decision: invalid entity_type %', p_entity_type;
  END IF;
  SET LOCAL statement_timeout = 0;

  -- bookkeeping (only on real cron runs, never dry-run)
  IF NOT p_dry_run THEN
    SELECT id, enabled INTO v_automation_id, v_enabled
      FROM public.admin_automations WHERE slug = v_slug;
    IF v_automation_id IS NOT NULL THEN
      INSERT INTO public.admin_automation_runs
        (automation_id, automation_slug, started_at, status, items_examined, items_changed)
      VALUES (v_automation_id, v_slug, v_started_at, 'success', 0, 0)
      RETURNING id INTO v_run_id;
      IF v_enabled IS DISTINCT FROM true THEN
        UPDATE public.admin_automation_runs
          SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
        UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
        RETURN jsonb_build_object('skipped',true,'reason','paused','entity_type',p_entity_type);
      END IF;
    END IF;
  END IF;

  -- Latest observation per (entity, signal_kind) within the freshness window; a newer
  -- 'alive' of the same kind naturally cancels an older 'dead'.
  DROP TABLE IF EXISTS _agg;
  CREATE TEMP TABLE _agg ON COMMIT DROP AS
  WITH latest_per_kind AS (
    SELECT DISTINCT ON (entity_id, signal_kind)
           entity_id, signal_kind, verdict, observed_at
    FROM public.entity_existence_signals
    WHERE entity_type = p_entity_type
      AND observed_at > now() - interval '120 days'
    ORDER BY entity_id, signal_kind, observed_at DESC
  )
  SELECT entity_id,
    count(*) FILTER (WHERE verdict='dead' AND signal_kind = ANY(v_strong)) AS strong_dead,
    max(observed_at) FILTER (WHERE verdict='dead' AND signal_kind = ANY(v_strong)) AS newest_dead_at,
    max(observed_at) FILTER (WHERE verdict='alive') AS fresh_alive_at
  FROM latest_per_kind
  GROUP BY entity_id;
  CREATE INDEX ON _agg (entity_id);

  -- =======================================================================
  IF p_entity_type = 'venue' THEN
    -- legacy url+stale path keeps its own audit + reopen (untouched)
    IF NOT p_dry_run THEN PERFORM public.run_venue_closure_decision(false); END IF;

    -- REOPEN engine-archived venues that show life again.
    IF NOT p_dry_run THEN
      WITH open_arch AS (
        SELECT DISTINCT ON (a.entity_id) a.id, a.entity_id, a.created_at, a.prev_state
        FROM public.entity_existence_audit a
        WHERE a.entity_type='venue' AND a.action='archive' AND a.reverted_at IS NULL
        ORDER BY a.entity_id, a.created_at DESC
      ), live AS (
        SELECT oa.id, oa.entity_id FROM open_arch oa
        JOIN _agg g ON g.entity_id = oa.entity_id
        WHERE g.fresh_alive_at IS NOT NULL AND g.fresh_alive_at > oa.created_at
      ), upd AS (
        UPDATE public.venues v SET closed_at=NULL, needs_attention=true, updated_at=now()
        FROM live WHERE v.id=live.entity_id AND v.closed_at IS NOT NULL
        RETURNING v.id
      )
      UPDATE public.entity_existence_audit a SET reverted_at=now()
      FROM live WHERE a.id=live.id;
      GET DIAGNOSTICS v_reopened = ROW_COUNT;
    END IF;

    WITH cand AS (
      SELECT v.id, g.strong_dead, g.newest_dead_at, g.fresh_alive_at,
        coalesce(v.is_featured,false)
          OR EXISTS (SELECT 1 FROM public.venue_reviews r WHERE r.venue_id=v.id)
          OR EXISTS (SELECT 1 FROM public.venue_checkins c WHERE c.venue_id=v.id)
          OR EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='venue' AND s.entity_id=v.id) AS guarded
      FROM _agg g JOIN public.venues v ON v.id=g.entity_id
      WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL AND g.strong_dead >= 1
    ), arch AS (
      SELECT id, strong_dead, newest_dead_at FROM cand
      WHERE strong_dead >= 2 AND NOT guarded
        AND (fresh_alive_at IS NULL OR fresh_alive_at <= newest_dead_at)
    )
    SELECT count(*) INTO v_archive_eligible FROM arch;

    IF NOT p_dry_run THEN
      WITH cand AS (
        SELECT v.id, v.seo_indexable, g.strong_dead, g.newest_dead_at, g.fresh_alive_at,
          coalesce(v.is_featured,false)
            OR EXISTS (SELECT 1 FROM public.venue_reviews r WHERE r.venue_id=v.id)
            OR EXISTS (SELECT 1 FROM public.venue_checkins c WHERE c.venue_id=v.id)
            OR EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='venue' AND s.entity_id=v.id) AS guarded
        FROM _agg g JOIN public.venues v ON v.id=g.entity_id
        WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL AND g.strong_dead >= 1
      ), arch AS (
        SELECT * FROM cand WHERE strong_dead >= 2 AND NOT guarded
          AND (fresh_alive_at IS NULL OR fresh_alive_at <= newest_dead_at)
      ), upd AS (
        UPDATE public.venues v SET closed_at=now(), needs_attention=true, updated_at=now()
        FROM arch WHERE v.id=arch.id AND v.closed_at IS NULL
        RETURNING v.id
      )
      INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals, prev_state)
      SELECT 'venue', a.id, 'archive', 'existence_engine_multi_dead',
        jsonb_build_object('strong_dead', a.strong_dead, 'newest_dead_at', a.newest_dead_at),
        jsonb_build_object('closed_at', null, 'seo_indexable', a.seo_indexable)
      FROM arch a;
      GET DIAGNOSTICS v_archived = ROW_COUNT;

      -- FLAG single-signal / guarded-with-dead for human review (no open audit yet)
      WITH cand AS (
        SELECT v.id, g.strong_dead, g.newest_dead_at, g.fresh_alive_at,
          coalesce(v.is_featured,false)
            OR EXISTS (SELECT 1 FROM public.venue_reviews r WHERE r.venue_id=v.id)
            OR EXISTS (SELECT 1 FROM public.venue_checkins c WHERE c.venue_id=v.id)
            OR EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='venue' AND s.entity_id=v.id) AS guarded
        FROM _agg g JOIN public.venues v ON v.id=g.entity_id
        WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL AND g.strong_dead >= 1
      ), flagc AS (
        SELECT * FROM cand c
        WHERE NOT (strong_dead >= 2 AND NOT guarded
                   AND (fresh_alive_at IS NULL OR fresh_alive_at <= newest_dead_at))
          AND NOT EXISTS (SELECT 1 FROM public.entity_existence_audit a
                          WHERE a.entity_type='venue' AND a.entity_id=c.id AND a.reverted_at IS NULL
                            AND a.action IN ('flag','archive'))
      ), updf AS (
        UPDATE public.venues v SET needs_attention=true, updated_at=now()
        FROM flagc WHERE v.id=flagc.id RETURNING v.id
      )
      INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals)
      SELECT 'venue', f.id, 'flag',
        CASE WHEN f.guarded THEN 'guarded_dead_needs_review' ELSE 'single_dead_signal' END,
        jsonb_build_object('strong_dead', f.strong_dead, 'newest_dead_at', f.newest_dead_at, 'guarded', f.guarded)
      FROM flagc f;
      GET DIAGNOSTICS v_flagged = ROW_COUNT;
    END IF;

  -- =======================================================================
  ELSIF p_entity_type = 'event' THEN
    IF NOT p_dry_run THEN
      WITH open_arch AS (
        SELECT DISTINCT ON (a.entity_id) a.id, a.entity_id, a.created_at, a.prev_state
        FROM public.entity_existence_audit a
        WHERE a.entity_type='event' AND a.action='archive' AND a.reverted_at IS NULL
        ORDER BY a.entity_id, a.created_at DESC
      ), live AS (
        SELECT oa.* FROM open_arch oa JOIN _agg g ON g.entity_id=oa.entity_id
        WHERE g.fresh_alive_at IS NOT NULL AND g.fresh_alive_at > oa.created_at
      ), upd AS (
        UPDATE public.events e SET
          status = coalesce(live.prev_state->>'status','active'),
          liveness_status = coalesce(live.prev_state->>'liveness_status','unknown'),
          seo_indexable = coalesce((live.prev_state->>'seo_indexable')::boolean, true),
          needs_attention = true, updated_at=now()
        FROM live WHERE e.id=live.entity_id AND e.status='cancelled'
        RETURNING e.id
      )
      UPDATE public.entity_existence_audit a SET reverted_at=now()
      FROM live WHERE a.id=live.id;
      GET DIAGNOSTICS v_reopened = ROW_COUNT;
    END IF;

    SELECT count(*) INTO v_archive_eligible
    FROM _agg g JOIN public.events e ON e.id=g.entity_id
    WHERE e.duplicate_of_id IS NULL AND e.status <> 'cancelled'
      AND g.strong_dead >= 2
      AND (g.fresh_alive_at IS NULL OR g.fresh_alive_at <= g.newest_dead_at)
      AND NOT coalesce(e.is_featured,false)
      AND NOT EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='event' AND s.entity_id=e.id);

    IF NOT p_dry_run THEN
      WITH arch AS (
        SELECT e.id, e.status, e.liveness_status, e.seo_indexable, g.strong_dead, g.newest_dead_at
        FROM _agg g JOIN public.events e ON e.id=g.entity_id
        WHERE e.duplicate_of_id IS NULL AND e.status <> 'cancelled'
          AND g.strong_dead >= 2
          AND (g.fresh_alive_at IS NULL OR g.fresh_alive_at <= g.newest_dead_at)
          AND NOT coalesce(e.is_featured,false)
          AND NOT EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='event' AND s.entity_id=e.id)
      ), upd AS (
        UPDATE public.events e SET status='cancelled', liveness_status='dead_link',
          seo_indexable=false, needs_attention=true, updated_at=now()
        FROM arch WHERE e.id=arch.id
        RETURNING e.id
      )
      INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals, prev_state)
      SELECT 'event', a.id, 'archive', 'existence_engine_multi_dead',
        jsonb_build_object('strong_dead', a.strong_dead, 'newest_dead_at', a.newest_dead_at),
        jsonb_build_object('status', a.status, 'liveness_status', a.liveness_status, 'seo_indexable', a.seo_indexable)
      FROM arch a;
      GET DIAGNOSTICS v_archived = ROW_COUNT;

      WITH cand AS (
        SELECT e.id, g.strong_dead, g.newest_dead_at, g.fresh_alive_at,
          coalesce(e.is_featured,false)
            OR EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='event' AND s.entity_id=e.id) AS guarded
        FROM _agg g JOIN public.events e ON e.id=g.entity_id
        WHERE e.duplicate_of_id IS NULL AND e.status <> 'cancelled' AND g.strong_dead >= 1
      ), flagc AS (
        SELECT * FROM cand c
        WHERE NOT (strong_dead >= 2 AND NOT guarded
                   AND (fresh_alive_at IS NULL OR fresh_alive_at <= newest_dead_at))
          AND NOT EXISTS (SELECT 1 FROM public.entity_existence_audit a
                          WHERE a.entity_type='event' AND a.entity_id=c.id AND a.reverted_at IS NULL
                            AND a.action IN ('flag','archive'))
      ), updf AS (
        UPDATE public.events e SET needs_attention=true, updated_at=now()
        FROM flagc WHERE e.id=flagc.id RETURNING e.id
      )
      INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals)
      SELECT 'event', f.id, 'flag',
        CASE WHEN f.guarded THEN 'guarded_dead_needs_review' ELSE 'single_dead_signal' END,
        jsonb_build_object('strong_dead', f.strong_dead, 'newest_dead_at', f.newest_dead_at, 'guarded', f.guarded)
      FROM flagc f;
      GET DIAGNOSTICS v_flagged = ROW_COUNT;
    END IF;

  -- =======================================================================
  ELSIF p_entity_type = 'marketplace' THEN
    IF NOT p_dry_run THEN
      WITH open_arch AS (
        SELECT DISTINCT ON (a.entity_id) a.id, a.entity_id, a.created_at, a.prev_state
        FROM public.entity_existence_audit a
        WHERE a.entity_type='marketplace' AND a.action='archive' AND a.reverted_at IS NULL
        ORDER BY a.entity_id, a.created_at DESC
      ), live AS (
        SELECT oa.* FROM open_arch oa JOIN _agg g ON g.entity_id=oa.entity_id
        WHERE g.fresh_alive_at IS NOT NULL AND g.fresh_alive_at > oa.created_at
      ), upd AS (
        UPDATE public.marketplace_listings m SET status='active', deprecated_at=NULL, updated_at=now()
        FROM live WHERE m.id=live.entity_id AND m.status='inactive'
        RETURNING m.id
      )
      UPDATE public.entity_existence_audit a SET reverted_at=now()
      FROM live WHERE a.id=live.id AND EXISTS (
        SELECT 1 FROM public.marketplace_listings m WHERE m.id=a.entity_id AND m.status='active');
      GET DIAGNOSTICS v_reopened = ROW_COUNT;
    END IF;

    SELECT count(*) INTO v_archive_eligible
    FROM _agg g JOIN public.marketplace_listings m ON m.id=g.entity_id
    WHERE m.duplicate_of_id IS NULL AND m.status IN ('active','sold_out','inactive')
      AND g.strong_dead >= 2
      AND (g.fresh_alive_at IS NULL OR g.fresh_alive_at <= g.newest_dead_at)
      AND NOT EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='marketplace' AND s.entity_id=m.id);

    IF NOT p_dry_run THEN
      -- step 1: active/sold_out -> inactive (reopenable)
      WITH arch AS (
        SELECT m.id, m.status, m.deprecated_at, g.strong_dead, g.newest_dead_at
        FROM _agg g JOIN public.marketplace_listings m ON m.id=g.entity_id
        WHERE m.duplicate_of_id IS NULL AND m.status IN ('active','sold_out')
          AND g.strong_dead >= 2
          AND (g.fresh_alive_at IS NULL OR g.fresh_alive_at <= g.newest_dead_at)
          AND NOT EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='marketplace' AND s.entity_id=m.id)
      ), upd AS (
        UPDATE public.marketplace_listings m SET status='inactive', updated_at=now()
        FROM arch WHERE m.id=arch.id RETURNING m.id
      )
      INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals, prev_state)
      SELECT 'marketplace', a.id, 'archive', 'existence_engine_multi_dead',
        jsonb_build_object('strong_dead', a.strong_dead, 'newest_dead_at', a.newest_dead_at),
        jsonb_build_object('status', a.status, 'deprecated_at', a.deprecated_at)
      FROM arch a;
      GET DIAGNOSTICS v_archived = ROW_COUNT;

      -- step 2: escalate long-dead inactive (open archive > 60d, still dead) -> archived
      UPDATE public.marketplace_listings m
        SET status='archived', deprecated_at=now(), updated_at=now()
      FROM (
        SELECT a.entity_id FROM public.entity_existence_audit a
        JOIN _agg g ON g.entity_id=a.entity_id
        WHERE a.entity_type='marketplace' AND a.action='archive' AND a.reverted_at IS NULL
          AND a.created_at < now() - interval '60 days'
          AND g.strong_dead >= 2
      ) esc
      WHERE m.id=esc.entity_id AND m.status='inactive';

      -- FLAG single-signal
      WITH cand AS (
        SELECT m.id, g.strong_dead, g.newest_dead_at, g.fresh_alive_at,
          EXISTS (SELECT 1 FROM public.saved_items s WHERE s.entity_type='marketplace' AND s.entity_id=m.id) AS guarded
        FROM _agg g JOIN public.marketplace_listings m ON m.id=g.entity_id
        WHERE m.duplicate_of_id IS NULL AND m.status IN ('active','sold_out') AND g.strong_dead >= 1
      ), flagc AS (
        SELECT * FROM cand c
        WHERE NOT (strong_dead >= 2 AND NOT guarded
                   AND (fresh_alive_at IS NULL OR fresh_alive_at <= newest_dead_at))
          AND NOT EXISTS (SELECT 1 FROM public.entity_existence_audit a
                          WHERE a.entity_type='marketplace' AND a.entity_id=c.id AND a.reverted_at IS NULL
                            AND a.action IN ('flag','archive'))
      )
      INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals)
      SELECT 'marketplace', f.id, 'flag',
        CASE WHEN f.guarded THEN 'guarded_dead_needs_review' ELSE 'single_dead_signal' END,
        jsonb_build_object('strong_dead', f.strong_dead, 'newest_dead_at', f.newest_dead_at, 'guarded', f.guarded)
      FROM flagc f;
      GET DIAGNOSTICS v_flagged = ROW_COUNT;
    END IF;
  END IF;

  IF NOT p_dry_run AND v_run_id IS NOT NULL THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), items_examined=v_archive_eligible+v_flagged,
          items_changed=v_archived+v_flagged+v_reopened,
          summary=jsonb_build_object('archived',v_archived,'flagged',v_flagged,'reopened',v_reopened)
      WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  END IF;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'entity_type', p_entity_type,
    'archive_eligible', v_archive_eligible, 'archived', v_archived,
    'flag_eligible', v_flagged, 'reopened', v_reopened);
EXCEPTION WHEN OTHERS THEN
  IF NOT p_dry_run AND v_run_id IS NOT NULL THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  END IF;
  RAISE;
END; $function$;

-- Zero-arg wrappers so the data-driven dispatcher (^run_[a-z0-9_]+$) resolves them.
CREATE OR REPLACE FUNCTION public.run_existence_decision_venue() RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT public.run_existence_decision('venue', false); $$;
CREATE OR REPLACE FUNCTION public.run_existence_decision_event() RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT public.run_existence_decision('event', false); $$;
CREATE OR REPLACE FUNCTION public.run_existence_decision_marketplace() RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT public.run_existence_decision('marketplace', false); $$;


-- Event date-lifecycle: the past-event gap fix. Past active events -> completed;
-- long-past (>180d) events lose search indexability and emit a date_lifecycle dead
-- signal (the decision engine makes any terminal call). Storm-safe keyset batches.
CREATE OR REPLACE FUNCTION public.run_event_date_lifecycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_completed int := 0; v_deindexed int := 0; v_batch int; v_total_c int := 0; v_total_d int := 0;
BEGIN
  PERFORM public.assert_admin_or_internal();
  SET LOCAL statement_timeout = 0;

  -- past active -> completed (soft, reversible)
  LOOP
    WITH c AS (
      SELECT id FROM public.events
      WHERE status='active' AND duplicate_of_id IS NULL
        AND coalesce(end_date, start_date) < now()
      ORDER BY id LIMIT 300
    ), upd AS (
      UPDATE public.events e SET status='completed', updated_at=now()
      FROM c WHERE e.id=c.id AND e.status IS DISTINCT FROM 'completed'
      RETURNING e.id
    )
    SELECT count(*) INTO v_batch FROM upd;
    v_total_c := v_total_c + v_batch;
    EXIT WHEN v_batch < 300;
  END LOOP;

  -- long-past -> de-index + emit date_lifecycle:dead signal (idempotent: only newly indexable)
  LOOP
    WITH c AS (
      SELECT id FROM public.events
      WHERE duplicate_of_id IS NULL AND seo_indexable IS TRUE
        AND coalesce(end_date, start_date) < now() - interval '180 days'
      ORDER BY id LIMIT 300
    ), upd AS (
      UPDATE public.events e SET seo_indexable=false, updated_at=now()
      FROM c WHERE e.id=c.id
      RETURNING e.id
    ), sig AS (
      INSERT INTO public.entity_existence_signals (entity_type, entity_id, signal_kind, verdict, weight, source, details)
      SELECT 'event', id, 'date_lifecycle', 'dead', 0.6, 'run_event_date_lifecycle',
             jsonb_build_object('reason','event_ended_over_180d')
      FROM upd
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM upd;
    v_total_d := v_total_d + v_batch;
    EXIT WHEN v_batch < 300;
  END LOOP;

  RETURN jsonb_build_object('completed', v_total_c, 'deindexed', v_total_d);
END; $function$;

-- Back-compat wrapper: the existing event_auto_archive automation calls run_event_auto_archive().
CREATE OR REPLACE FUNCTION public.run_event_auto_archive() RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT public.run_event_date_lifecycle(); $$;


-- Ledger pruning: keep the latest ~20 signals per entity and anything < 180 days.
CREATE OR REPLACE FUNCTION public.run_existence_signals_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deleted int := 0; v_batch int;
BEGIN
  PERFORM public.assert_admin_or_internal();
  SET LOCAL statement_timeout = 0;
  LOOP
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY entity_type, entity_id ORDER BY observed_at DESC) rn
      FROM public.entity_existence_signals
    ), del AS (
      DELETE FROM public.entity_existence_signals s
      USING ranked r
      WHERE s.id=r.id AND r.rn > 20 AND s.observed_at < now() - interval '180 days'
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM del;
    v_deleted := v_deleted + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;
  RETURN jsonb_build_object('deleted', v_deleted);
END; $function$;

REVOKE ALL ON FUNCTION public.run_existence_decision(text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.run_event_date_lifecycle() FROM public, anon;
REVOKE ALL ON FUNCTION public.run_existence_signals_purge() FROM public, anon;
