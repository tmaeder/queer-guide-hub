-- City Truth Engine — foundation
-- Turns city pages from static directory rows into living, self-verifying records.
-- Mirrors the Event Truth Loop (20260530000000) + Venue Truth Engine (20260528000000).
-- Adds:
--   * cities.trust_score / completeness_score / last_verified_at / shell_status /
--     needs_attention / field_provenance / enrichment_status / safety_notes
--   * city_quality_signals   — append-only ledger written by all verifiers
--   * city_review_queue       — safety gate for lgbt_friendly_rating / safety_notes / editorial_hook
--   * city_consensus_audit    — merge/review decision trail
--   * city_coverage_gaps      — coverage radar output (every non-duplicate city)
--   * run_city_trust_recompute(p_force)  — nightly composite score (pure SQL)
--   * run_city_coverage_radar(p_force)   — weekly gap detection across all cities (pure SQL)
--   * dispatch wiring + paused admin_automations + cron registrations
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn). Cities are NOT in
-- the search_documents sync, so bulk score UPDATEs do not trigger tsvector storms.

-- ===== 1. cities: truth + shell columns =====
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS trust_score        smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completeness_score smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS shell_status       text NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS needs_attention    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS field_provenance   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_status  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_notes       text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cities_shell_status_check') THEN
    ALTER TABLE public.cities ADD CONSTRAINT cities_shell_status_check
      CHECK (shell_status IN ('real','placeholder','ghost','merged'));
  END IF;
END $$;

COMMENT ON COLUMN public.cities.trust_score IS
  'Composite truth/trust 0-100 from city_quality_signals (completeness+content_density+corroboration+freshness+relevance+admin feedback). Distinct from completeness_score (=field coverage).';
COMMENT ON COLUMN public.cities.completeness_score IS
  'Queer-weighted field-coverage 0-100 from compute_city_completeness(). Distinct from trust_score.';
COMMENT ON COLUMN public.cities.shell_status IS
  'real | placeholder (tmp- slug stub) | ghost (indexable, zero venues+events) | merged (duplicate_of_id set).';
COMMENT ON COLUMN public.cities.field_provenance IS
  'Per-field fusion {field:{value,confidence,sources[],corroborated}} written by city-factual-backfill / city-corroboration.';
COMMENT ON COLUMN public.cities.safety_notes IS
  'LGBTQ+ safety context. Review-gated: only ever written via approved city_review_queue rows, never auto-generated.';

CREATE INDEX IF NOT EXISTS idx_cities_trust_score      ON public.cities(trust_score)              WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cities_completeness      ON public.cities(completeness_score)        WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cities_last_verified     ON public.cities(last_verified_at NULLS FIRST) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cities_shell_status      ON public.cities(shell_status)              WHERE shell_status <> 'real';
CREATE INDEX IF NOT EXISTS idx_cities_needs_attention   ON public.cities(id)                        WHERE needs_attention;

-- One-time: mark duplicates as merged (they are excluded from scope below).
UPDATE public.cities SET shell_status='merged'
WHERE duplicate_of_id IS NOT NULL AND shell_status IS DISTINCT FROM 'merged';

-- ===== 2. city_quality_signals ledger =====
CREATE TABLE IF NOT EXISTS public.city_quality_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN
    ('completeness','corroboration','content_density','freshness','relevance','admin_feedback','enrichment','safety')),
  value       numeric(5,4) NOT NULL DEFAULT 0,   -- normalized 0.0000..1.0000
  weight      numeric(4,3) NOT NULL DEFAULT 1.000,
  source      text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_city_quality_signals_city
  ON public.city_quality_signals(city_id, signal_type, created_at DESC);

ALTER TABLE public.city_quality_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_quality_signals' AND policyname='cqs_read') THEN
    CREATE POLICY "cqs_read" ON public.city_quality_signals
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_quality_signals' AND policyname='cqs_admin_write') THEN
    CREATE POLICY "cqs_admin_write" ON public.city_quality_signals
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;

-- ===== 3. city_review_queue (safety gate) =====
-- lgbt_friendly_rating / safety_notes / editorial_hook NEVER land on cities directly;
-- the agentic enricher inserts here, a human approves, approval copies to the column.
CREATE TABLE IF NOT EXISTS public.city_review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id        uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  field          text NOT NULL CHECK (field IN ('lgbt_friendly_rating','safety_notes','editorial_hook')),
  proposed_value jsonb NOT NULL,            -- {value:.., rationale:.., scale:..}
  citations      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{url, quote}]
  confidence     numeric(3,2),
  model          text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  reviewer_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_city_review_queue_open
  ON public.city_review_queue(city_id, field) WHERE status='open';
-- Only one open proposal per (city, field): re-enrichment refreshes it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_city_review_queue_open
  ON public.city_review_queue(city_id, field) WHERE status='open';

ALTER TABLE public.city_review_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_review_queue' AND policyname='crq_read') THEN
    CREATE POLICY "crq_read" ON public.city_review_queue
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_review_queue' AND policyname='crq_admin_write') THEN
    CREATE POLICY "crq_admin_write" ON public.city_review_queue
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;

-- ===== 4. city_consensus_audit (decision trail) =====
CREATE TABLE IF NOT EXISTS public.city_consensus_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id            uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  field              text,
  winning_value      jsonb,
  winning_source     text,
  confidence         numeric(3,2),
  agreeing_sources   text[],
  conflicting_sources text[],
  action             text CHECK (action IN ('auto_commit','triage','review_gated','no_change')),
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_city_consensus_audit_city ON public.city_consensus_audit(city_id, created_at DESC);

ALTER TABLE public.city_consensus_audit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_consensus_audit' AND policyname='city_consensus_audit_admin_all') THEN
    CREATE POLICY city_consensus_audit_admin_all ON public.city_consensus_audit
      USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
  END IF;
END $$;
GRANT ALL ON TABLE public.city_consensus_audit TO authenticated, service_role;

-- ===== 5. city_coverage_gaps =====
CREATE TABLE IF NOT EXISTS public.city_coverage_gaps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id           uuid REFERENCES public.cities(id) ON DELETE CASCADE,
  city_name         text,
  gap_score         smallint NOT NULL DEFAULT 0,    -- 0..100, higher = more missing
  missing_fields    text[] NOT NULL DEFAULT '{}',
  content_counts    jsonb NOT NULL DEFAULT '{}'::jsonb,
  shell_status      text NOT NULL DEFAULT 'real',
  resolution        text NOT NULL DEFAULT 'enrich' CHECK (resolution IN ('enrich','merge','review')),
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','queued','resolved','ignored')),
  last_checked_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT city_coverage_gaps_city_uk UNIQUE (city_id)
);
CREATE INDEX IF NOT EXISTS idx_city_coverage_gaps_rank ON public.city_coverage_gaps(status, gap_score DESC);

ALTER TABLE public.city_coverage_gaps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_coverage_gaps' AND policyname='ccg_read') THEN
    CREATE POLICY "ccg_read" ON public.city_coverage_gaps
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='city_coverage_gaps' AND policyname='ccg_admin_write') THEN
    CREATE POLICY "ccg_admin_write" ON public.city_coverage_gaps
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;

-- ===== 6. trust recompute (pure SQL, nightly) =====
-- Static content-anchored entity (no liveness/engagement decay like events), so:
--   completeness 0.30 | content_density 0.25 | corroboration 0.15 |
--   relevance 0.15    | freshness 0.10      | admin_feedback 0.05
-- placeholder caps at 5, ghost at 15. Scopes by staleness/dirtiness to bound churn.
CREATE OR REPLACE FUNCTION public.run_city_trust_recompute(p_force boolean DEFAULT false)
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
  FROM public.admin_automations WHERE slug = 'city_trust_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_trust_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT c.id, c.slug, c.seo_indexable, c.completeness_score, c.lgbt_friendly_rating,
           c.needs_attention, c.last_refreshed_at, c.updated_at, c.last_verified_at
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND (p_force
           OR c.last_verified_at IS NULL
           OR c.updated_at > c.last_verified_at
           OR c.last_verified_at < now() - interval '30 days')
  ),
  counts AS (
    SELECT s.id,
      (SELECT count(*) FROM public.venues v   WHERE v.city_id=s.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e   WHERE e.city_id=s.id AND e.duplicate_of_id IS NULL) AS events,
      (SELECT count(*) FROM public.queer_villages q WHERE q.city_id=s.id) AS villages,
      (SELECT count(*) FROM public.festivals f WHERE f.city_id=s.id) AS festivals,
      (SELECT count(*) FROM public.hotels h    WHERE h.city_id=s.id) AS hotels
    FROM scope s
  ),
  corr AS (
    SELECT DISTINCT ON (city_id) city_id, value
    FROM public.city_quality_signals WHERE signal_type='corroboration'
    ORDER BY city_id, created_at DESC
  ),
  relsig AS (
    SELECT DISTINCT ON (city_id) city_id, value
    FROM public.city_quality_signals WHERE signal_type='relevance'
    ORDER BY city_id, created_at DESC
  ),
  adminfb AS (
    SELECT DISTINCT ON (city_id) city_id, value
    FROM public.city_quality_signals WHERE signal_type='admin_feedback'
    ORDER BY city_id, created_at DESC
  ),
  scored AS (
    SELECT s.id, s.slug, s.seo_indexable, s.needs_attention,
      least(1.0, greatest(0.0, coalesce(s.completeness_score,0)/100.0)) AS completeness,
      least(1.0, ln(1 + co.venues + co.events + co.villages + co.festivals + co.hotels) / ln(31)) AS content_density,
      coalesce(cr.value, 0.5) AS corroboration,
      coalesce(s.lgbt_friendly_rating::numeric/5.0, rs.value, 0.5) AS relevance,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(s.last_refreshed_at,s.updated_at))/86400.0)/90.0) AS freshness,
      coalesce(af.value, 0.5) AS admin_feedback,
      (co.venues=0 AND co.events=0) AS is_empty
    FROM scope s
    JOIN counts co    ON co.id=s.id
    LEFT JOIN corr cr ON cr.city_id=s.id
    LEFT JOIN relsig rs ON rs.city_id=s.id
    LEFT JOIN adminfb af ON af.city_id=s.id
  ),
  final AS (
    SELECT id,
      CASE WHEN slug LIKE 'tmp-%' THEN 'placeholder'
           WHEN seo_indexable AND is_empty THEN 'ghost'
           ELSE 'real' END AS new_shell,
      CASE
        WHEN slug LIKE 'tmp-%' THEN 5
        WHEN seo_indexable AND is_empty THEN 15
        ELSE round(100 * greatest(0.0, least(1.0,
              0.30*completeness + 0.25*content_density + 0.15*corroboration
            + 0.15*relevance    + 0.10*freshness       + 0.05*admin_feedback
            - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))
      END::smallint AS new_trust
    FROM scored
  )
  UPDATE public.cities c
    SET trust_score = f.new_trust,
        shell_status = f.new_shell,
        last_verified_at = now()
  FROM final f
  WHERE c.id = f.id
    AND (c.trust_score IS DISTINCT FROM f.new_trust OR c.shell_status IS DISTINCT FROM f.new_shell);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

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
ALTER FUNCTION public.run_city_trust_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_trust_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_trust_recompute(boolean) TO service_role, authenticated;

-- ===== 7. coverage radar (pure SQL, weekly) — scans EVERY non-duplicate city =====
CREATE OR REPLACE FUNCTION public.run_city_coverage_radar(p_force boolean DEFAULT false)
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
  FROM public.admin_automations WHERE slug = 'city_coverage_radar';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'city_coverage_radar', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH base AS (
    SELECT c.id, c.name, c.slug, c.seo_indexable, c.completeness_score,
      c.description, c.lgbt_friendly_rating, c.editorial_hook, c.best_time_to_visit,
      c.local_customs, c.image_url, c.curated_image_url, c.latitude, c.longitude,
      c.timezone, c.population, c.major_airport_code,
      (SELECT count(*) FROM public.venues v WHERE v.city_id=c.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e WHERE e.city_id=c.id AND e.duplicate_of_id IS NULL) AS events,
      (SELECT count(*) FROM public.queer_villages q WHERE q.city_id=c.id) AS villages,
      (SELECT count(*) FROM public.festivals f WHERE f.city_id=c.id) AS festivals,
      (SELECT count(*) FROM public.hotels h WHERE h.city_id=c.id) AS hotels
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
  ),
  computed AS (
    SELECT b.*,
      (b.venues=0 AND b.events=0) AS is_empty,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN b.description IS NULL OR length(trim(b.description))<40 THEN 'description' END,
        CASE WHEN b.lgbt_friendly_rating IS NULL THEN 'lgbt_friendly_rating' END,
        CASE WHEN b.editorial_hook IS NULL THEN 'editorial_hook' END,
        CASE WHEN b.villages=0 THEN 'neighborhoods' END,
        CASE WHEN b.best_time_to_visit IS NULL THEN 'best_time_to_visit' END,
        CASE WHEN b.local_customs IS NULL THEN 'local_customs' END,
        CASE WHEN b.image_url IS NULL AND b.curated_image_url IS NULL THEN 'image' END,
        CASE WHEN b.latitude IS NULL OR b.longitude IS NULL THEN 'coords' END,
        CASE WHEN b.timezone IS NULL THEN 'timezone' END,
        CASE WHEN b.population IS NULL THEN 'population' END,
        CASE WHEN b.major_airport_code IS NULL THEN 'major_airport_code' END
      ], NULL) AS missing
    FROM base b
  ),
  routed AS (
    SELECT c.*,
      CASE WHEN c.slug LIKE 'tmp-%' THEN 'placeholder'
           WHEN c.seo_indexable AND c.is_empty THEN 'ghost'
           ELSE 'real' END AS shell,
      CASE WHEN c.slug LIKE 'tmp-%' THEN 'merge'
           WHEN c.seo_indexable AND c.is_empty THEN 'review'
           ELSE 'enrich' END AS resolution,
      least(100, greatest(0, 100 - coalesce(c.completeness_score,0)
            + CASE WHEN c.is_empty THEN 10 ELSE 0 END))::smallint AS gap_score
    FROM computed c
  ),
  upsert AS (
    INSERT INTO public.city_coverage_gaps
      (city_id, city_name, gap_score, missing_fields, content_counts, shell_status, resolution, suggested_actions, status, last_checked_at)
    SELECT r.id, r.name, r.gap_score, r.missing,
      jsonb_build_object('venues',r.venues,'events',r.events,'villages',r.villages,'festivals',r.festivals,'hotels',r.hotels),
      r.shell, r.resolution,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'field', mf,
                'source', CASE mf
                            WHEN 'description' THEN 'wikipedia'
                            WHEN 'coords' THEN 'wikidata'
                            WHEN 'timezone' THEN 'wikidata'
                            WHEN 'population' THEN 'wikidata'
                            WHEN 'major_airport_code' THEN 'wikidata'
                            WHEN 'image' THEN 'wikipedia'
                            WHEN 'lgbt_friendly_rating' THEN 'llm'
                            WHEN 'editorial_hook' THEN 'llm'
                            WHEN 'best_time_to_visit' THEN 'llm'
                            WHEN 'local_customs' THEN 'llm'
                            WHEN 'neighborhoods' THEN 'manual'
                            ELSE 'llm' END,
                'q', r.name)), '[]'::jsonb)
       FROM unnest(r.missing) AS mf),
      'open', now()
    FROM routed r
    ON CONFLICT (city_id) DO UPDATE
      SET city_name=EXCLUDED.city_name, gap_score=EXCLUDED.gap_score,
          missing_fields=EXCLUDED.missing_fields, content_counts=EXCLUDED.content_counts,
          shell_status=EXCLUDED.shell_status, resolution=EXCLUDED.resolution,
          suggested_actions=EXCLUDED.suggested_actions, last_checked_at=now(),
          status=CASE WHEN public.city_coverage_gaps.status='ignored' THEN 'ignored'
                      WHEN EXCLUDED.gap_score=0 THEN 'resolved' ELSE 'open' END
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upsert;

  -- Auto-resolve well-covered cities.
  UPDATE public.city_coverage_gaps g SET status='resolved', last_checked_at=now()
  WHERE g.status IN ('open','queued')
    AND EXISTS (SELECT 1 FROM public.cities c WHERE c.id=g.city_id AND c.completeness_score >= 70);

  SELECT count(*) INTO v_examined FROM public.cities WHERE duplicate_of_id IS NULL;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('gaps_upserted',v_changed,'cities_examined',v_examined,'forced',p_force) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('gaps_upserted',v_changed,'cities_examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_city_coverage_radar(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_coverage_radar(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_city_coverage_radar(boolean) TO service_role, authenticated;

-- ===== 8. register automations (PAUSED) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('city_trust_recompute','Recompute city trust scores',
   'Nightly composite trust_score from city_quality_signals + completeness + content density + relevance.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_city_trust_recompute"}'::jsonb, '45 3 * * *'),
  ('city_coverage_radar','Detect city content gaps',
   'Weekly scan of every non-duplicate city; records city_coverage_gaps (missing fields + content counts + resolution route).',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_city_coverage_radar"}'::jsonb, '25 4 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 9. extend dispatch RPCs (carry forward latest known slugs) =====
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
  ELSIF p_slug = 'city_trust_recompute' THEN
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

-- ===== 10. cron: SQL jobs (no-op while paused) =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='city_trust_recompute') THEN PERFORM cron.unschedule('city_trust_recompute'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='city_coverage_radar')  THEN PERFORM cron.unschedule('city_coverage_radar');  END IF;
END $$;
SELECT cron.schedule('city_trust_recompute', '45 3 * * *', 'SELECT public.run_city_trust_recompute();');
SELECT cron.schedule('city_coverage_radar',  '25 4 * * 1', 'SELECT public.run_city_coverage_radar();');

-- ===== 11. cron: edge-function jobs (gated by Vault secret city_quality_webhook_secret) =====
-- factual-backfill daily 03:15, corroboration daily 03:45, agentic-enrich hourly :20.
-- Until vault secret city_quality_webhook_secret AND env CITY_QUALITY_WEBHOOK_SECRET
-- both exist, the POSTs return 401 and no-op (effectively paused).
-- One-time operator setup:
--   select vault.create_secret('<secret>', 'city_quality_webhook_secret', 'City Truth Engine cron auth');
--   supabase secrets set CITY_QUALITY_WEBHOOK_SECRET=<secret>
DO $$
DECLARE
  v jsonb := '[
    {"job":"city_factual_backfill","fn":"city-factual-backfill","sched":"15 3 * * *","body":{"batch_limit":120}},
    {"job":"city_corroboration","fn":"city-corroboration","sched":"45 3 * * *","body":{"batch_limit":200}},
    {"job":"city_agentic_enrich","fn":"city-agentic-enrich","sched":"20 * * * *","body":{"batch_limit":5}}
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
            'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
          ),
          body := %L::jsonb
        ) as request_id;
        $cron$, e->>'fn', e->'body'
      )
    );
  END LOOP;
END $$;

COMMENT ON SCHEMA cron IS
  'pg_cron: includes city truth-engine jobs (city_trust_recompute, city_coverage_radar [SQL]; city_factual_backfill, city_corroboration, city_agentic_enrich [edge, gated by Vault secret city_quality_webhook_secret]).';
