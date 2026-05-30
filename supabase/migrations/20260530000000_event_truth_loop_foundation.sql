-- Continuous Event Truth Loop — foundation
-- Turns events from a one-time ingest gate into living records that
-- continuously re-verify themselves. Adds:
--   * events.trust_score / last_verified_at / liveness_status / field_provenance
--   * event_quality_signals (append-only ledger written by all verifiers)
--   * event_coverage_gaps (coverage radar output)
--   * run_event_trust_recompute()  — nightly composite decaying score (pure SQL)
--   * run_event_coverage_radar()   — weekly empty-city detection (pure SQL)
--   * dispatch wiring + paused admin_automations + cron registrations
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn).

-- ===== 1. events: trust + liveness columns =====
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS trust_score       smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS liveness_status   text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS field_provenance  jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_liveness_status_check'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_liveness_status_check
      CHECK (liveness_status IN ('live','sold_out','cancelled','postponed','moved_online','dead_link','unknown'));
  END IF;
END $$;

COMMENT ON COLUMN public.events.trust_score IS
  'Composite truth/trust 0-100 from event_quality_signals (corroboration+liveness+freshness+engagement+relevance+admin feedback). Distinct from quality_score (=completeness).';
COMMENT ON COLUMN public.events.field_provenance IS
  'Per-field fusion result {field:{value,confidence,sources[],corroborated}} written by event-corroboration.';

CREATE INDEX IF NOT EXISTS idx_events_trust_score    ON public.events(trust_score)      WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_last_verified   ON public.events(last_verified_at NULLS FIRST) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_liveness_status ON public.events(liveness_status)  WHERE liveness_status <> 'unknown';

-- ===== 2. event_quality_signals ledger =====
CREATE TABLE IF NOT EXISTS public.event_quality_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN
    ('corroboration','liveness','freshness','engagement','admin_feedback','enrichment','relevance','safety')),
  value       numeric(5,4) NOT NULL DEFAULT 0,   -- normalized 0.0000..1.0000
  weight      numeric(4,3) NOT NULL DEFAULT 1.000,
  source      text,                              -- which job/source emitted it
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_quality_signals_event
  ON public.event_quality_signals(event_id, signal_type, created_at DESC);

ALTER TABLE public.event_quality_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_quality_signals' AND policyname='eqs_read') THEN
    CREATE POLICY "eqs_read" ON public.event_quality_signals
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_quality_signals' AND policyname='eqs_admin_write') THEN
    CREATE POLICY "eqs_admin_write" ON public.event_quality_signals
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;

-- ===== 3. event_coverage_gaps =====
CREATE TABLE IF NOT EXISTS public.event_coverage_gaps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id           uuid REFERENCES public.cities(id) ON DELETE CASCADE,
  city_name         text,
  upcoming_count    int NOT NULL DEFAULT 0,
  suggested_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','queued','resolved','ignored')),
  last_checked_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_coverage_gaps_city_uk UNIQUE (city_id)
);
CREATE INDEX IF NOT EXISTS idx_event_coverage_gaps_status
  ON public.event_coverage_gaps(status, upcoming_count);

ALTER TABLE public.event_coverage_gaps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_coverage_gaps' AND policyname='ecg_read') THEN
    CREATE POLICY "ecg_read" ON public.event_coverage_gaps
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_coverage_gaps' AND policyname='ecg_admin_write') THEN
    CREATE POLICY "ecg_admin_write" ON public.event_coverage_gaps
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;

-- ===== 4. trust recompute (pure SQL, nightly) =====
-- Composite, decaying. Weights are the constants below (edit to retune).
--   completeness 0.25 | corroboration 0.20 | freshness 0.15 |
--   engagement 0.15   | relevance 0.15     | admin_feedback 0.10
-- Liveness dead/cancelled hard-caps trust at 10. Corroboration conflict −15.
-- Scopes to upcoming + recently-changed + never-verified events to bound churn.
CREATE OR REPLACE FUNCTION public.run_event_trust_recompute()
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
  FROM public.admin_automations WHERE slug = 'event_trust_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'event_trust_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT id, quality_score, lgbti_relevance_score, liveness_status, needs_attention,
           start_date, updated_at, last_verified_at
    FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (start_date > now() - interval '7 days'
           OR last_verified_at IS NULL
           OR updated_at > now() - interval '2 days')
  ),
  corr AS (   -- latest corroboration signal per event
    SELECT DISTINCT ON (event_id) event_id, value
    FROM public.event_quality_signals WHERE signal_type='corroboration'
    ORDER BY event_id, created_at DESC
  ),
  adminfb AS ( -- latest admin_feedback signal per event
    SELECT DISTINCT ON (event_id) event_id, value
    FROM public.event_quality_signals WHERE signal_type='admin_feedback'
    ORDER BY event_id, created_at DESC
  ),
  eng AS (    -- engagement: RSVPs going/interested + favorites
    SELECT s.id AS event_id,
      (SELECT count(*) FROM public.event_attendees a
         WHERE a.event_id=s.id AND a.status IN ('going','interested')) AS rsvps,
      (SELECT count(*) FROM public.event_favorites f WHERE f.event_id=s.id) AS favs
    FROM scope s
  ),
  scored AS (
    SELECT s.id,
      -- component scores 0..1
      least(1.0, greatest(0.0, coalesce(s.quality_score,0)/100.0))                       AS completeness,
      coalesce(c.value, 0.5)                                                              AS corroboration,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(s.last_verified_at,s.updated_at))/86400.0)/30.0) AS freshness,
      least(1.0, (coalesce(e.rsvps,0)*2 + coalesce(e.favs,0))/20.0)                       AS engagement,
      coalesce(s.lgbti_relevance_score, 0.5)::numeric                                     AS relevance,
      coalesce(a.value, 0.5)                                                              AS admin_feedback,
      s.liveness_status, s.needs_attention
    FROM scope s
    LEFT JOIN corr c    ON c.event_id=s.id
    LEFT JOIN adminfb a ON a.event_id=s.id
    LEFT JOIN eng e     ON e.event_id=s.id
  ),
  final AS (
    SELECT id,
      CASE
        WHEN liveness_status IN ('dead_link','cancelled') THEN 10
        ELSE round(100 * greatest(0.0, least(1.0,
              0.25*completeness + 0.20*corroboration + 0.15*freshness
            + 0.15*engagement   + 0.15*relevance     + 0.10*admin_feedback
            - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))
      END::smallint AS new_trust
    FROM scored
  )
  UPDATE public.events ev
    SET trust_score = f.new_trust,
        last_verified_at = now()
  FROM final f
  WHERE ev.id = f.id AND ev.trust_score IS DISTINCT FROM f.new_trust;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.events
  WHERE duplicate_of_id IS NULL
    AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');

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
ALTER FUNCTION public.run_event_trust_recompute() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_event_trust_recompute() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_event_trust_recompute() TO service_role, authenticated;

-- ===== 5. coverage radar (pure SQL, weekly) =====
-- Flags cities whose upcoming-event count is below threshold and records a gap
-- with suggested source queries. min_count configurable via constant below.
CREATE OR REPLACE FUNCTION public.run_event_coverage_radar()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_min_count     int := 3;     -- cities with fewer upcoming events than this are "thin"
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'event_coverage_radar';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'event_coverage_radar', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH city_counts AS (
    SELECT c.id AS city_id, c.name AS city_name,
      (SELECT count(*) FROM public.events e
         WHERE e.city_id = c.id AND e.duplicate_of_id IS NULL
           AND e.status='active' AND e.start_date > now()) AS upcoming
    FROM public.cities c
    WHERE c.is_major_city = true
  ),
  thin AS (
    SELECT city_id, city_name, upcoming FROM city_counts WHERE upcoming < v_min_count
  ),
  upsert AS (
    INSERT INTO public.event_coverage_gaps (city_id, city_name, upcoming_count, suggested_queries, status, last_checked_at)
    SELECT city_id, city_name, upcoming,
      jsonb_build_array(
        jsonb_build_object('source','eventbrite','q', city_name||' lgbtq'),
        jsonb_build_object('source','eventbrite','q', city_name||' gay pride'),
        jsonb_build_object('source','ticketmaster','q', city_name||' pride')
      ),
      'open', now()
    FROM thin
    ON CONFLICT (city_id) DO UPDATE
      SET upcoming_count=EXCLUDED.upcoming_count,
          suggested_queries=EXCLUDED.suggested_queries,
          last_checked_at=now(),
          status=CASE WHEN public.event_coverage_gaps.status='ignored'
                      THEN 'ignored' ELSE 'open' END
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upsert;

  -- Auto-resolve gaps that now have enough coverage.
  UPDATE public.event_coverage_gaps g SET status='resolved', last_checked_at=now()
  WHERE g.status IN ('open','queued')
    AND (SELECT count(*) FROM public.events e
           WHERE e.city_id=g.city_id AND e.duplicate_of_id IS NULL
             AND e.status='active' AND e.start_date > now()) >= v_min_count;

  SELECT count(*) INTO v_examined FROM public.cities WHERE is_major_city = true;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('gaps_flagged',v_changed,'cities_examined',v_examined,'min_count',v_min_count)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('gaps_flagged',v_changed,'cities_examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_event_coverage_radar() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_event_coverage_radar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_event_coverage_radar() TO service_role, authenticated;

-- ===== 6. register automations (PAUSED) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('event_trust_recompute','Recompute event trust scores',
   'Nightly composite decaying trust_score from event_quality_signals + engagement + relevance + admin feedback.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_event_trust_recompute"}'::jsonb, '40 3 * * *'),
  ('event_coverage_radar','Detect event coverage gaps',
   'Weekly scan for cities with few upcoming events; records event_coverage_gaps with suggested source queries.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_event_coverage_radar"}'::jsonb, '20 4 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 7. extend dispatch RPCs =====
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSIF p_slug = 'event_trust_recompute' THEN v_result := public.run_event_trust_recompute();
  ELSIF p_slug = 'event_coverage_radar' THEN v_result := public.run_event_coverage_radar();
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
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- ===== 8. cron: SQL jobs (no-op while paused) =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='event_trust_recompute') THEN PERFORM cron.unschedule('event_trust_recompute'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='event_coverage_radar')  THEN PERFORM cron.unschedule('event_coverage_radar');  END IF;
END $$;
SELECT cron.schedule('event_trust_recompute', '40 3 * * *',  'SELECT public.run_event_trust_recompute();');
SELECT cron.schedule('event_coverage_radar',  '20 4 * * 1',  'SELECT public.run_event_coverage_radar();');

-- ===== 9. cron: edge-function jobs =====
-- liveness daily 02:10, corroboration daily 02:40, agentic-enrich hourly :50.
-- Each POSTs /functions/v1/<fn> with the shared webhook secret read from Vault
-- (vault.decrypted_secrets name='event_quality_webhook_secret'), which must match
-- the EVENT_QUALITY_WEBHOOK_SECRET env var on the deployed functions. Until both
-- exist the POSTs return 401 and rotate harmlessly — i.e. effectively paused.
-- One-time setup (operator, outside this migration):
--   select vault.create_secret('<secret>', 'event_quality_webhook_secret', 'Event Truth Loop cron auth');
--   supabase secrets set EVENT_QUALITY_WEBHOOK_SECRET=<secret>
DO $$
DECLARE
  v jsonb := '[
    {"job":"event_liveness_checker","fn":"event-liveness-checker","sched":"10 2 * * *","body":{"batch_limit":50}},
    {"job":"event_corroboration","fn":"event-corroboration","sched":"40 2 * * *","body":{"batch_limit":100}},
    {"job":"event_agentic_enrich","fn":"event-agentic-enrich","sched":"50 * * * *","body":{"batch_limit":5}}
  ]'::jsonb;
  e jsonb;
BEGIN
  FOR e IN SELECT * FROM jsonb_array_elements(v) LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = e->>'job') THEN
      PERFORM cron.unschedule(e->>'job');
    END IF;
    PERFORM cron.schedule(
      e->>'job', e->>'sched',
      format(
        $cron$
        select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='event_quality_webhook_secret')
          ),
          body := %L::jsonb
        ) as request_id;
        $cron$, e->>'fn', e->'body'
      )
    );
  END LOOP;
END $$;

COMMENT ON SCHEMA cron IS
  'pg_cron: includes event truth-loop jobs (event_trust_recompute, event_coverage_radar [SQL]; event_liveness_checker, event_corroboration, event_agentic_enrich [edge, gated by Vault secret event_quality_webhook_secret]).';
