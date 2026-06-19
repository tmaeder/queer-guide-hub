-- Village Truth Engine — quality layer for queer_villages
-- Villages were the only place-type entity with NO quality infrastructure (cities/events/
-- venues all have one). Mirrors the City Truth Engine (20260607100000/110000).
-- Measured baseline (190 rows): 34% of history mentions anything queer (rest is generic
-- Wikipedia), descriptions avg 73 chars, only 24% have any venue linked, and
-- boundaries/notable_landmarks/website/editorial_hook are 0% populated.
--
-- Adds:
--   * queer_villages.completeness_score / trust_score / shell_status / needs_attention /
--     field_provenance / enrichment_status / last_verified_at / last_refreshed_at
--   * village_quality_signals   — append-only ledger
--   * village_review_queue      — gate for LLM history/description/hook/landmarks overwrites
--   * village_coverage_gaps     — coverage radar output (every village)
--   * compute_village_completeness(uuid) + run_village_completeness_recompute()
--   * run_village_trust_recompute() + run_village_coverage_radar()
--   * relink_village_venues(uuid,int) — proximity venue↔village backfill
--   * approve_village_review / reject_village_review
--   * villages_due_for_refresh(int) selector
--   * admin_automations + dispatch wiring + cron (SQL jobs + gated edge enrich)
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn).
-- queer_villages IS in the search_documents sync, but at ~190 rows a full nightly
-- recompute is trivial; the IS DISTINCT FROM guard avoids no-op writes.

-- ===== 1. queer_villages: truth columns =====
ALTER TABLE public.queer_villages
  ADD COLUMN IF NOT EXISTS completeness_score smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trust_score        smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shell_status       text NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS needs_attention    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS field_provenance   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_status  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_refreshed_at  timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queer_villages_shell_status_check') THEN
    ALTER TABLE public.queer_villages ADD CONSTRAINT queer_villages_shell_status_check
      CHECK (shell_status IN ('real','ghost'));
  END IF;
END $$;

COMMENT ON COLUMN public.queer_villages.completeness_score IS
  'Queer-weighted field-coverage 0-100 from compute_village_completeness(). Distinct from trust_score.';
COMMENT ON COLUMN public.queer_villages.trust_score IS
  'Composite truth 0-100 from village_quality_signals (completeness+linkage+freshness+relevance+admin). ghost (indexable, 0 venues+events) caps at 15.';
COMMENT ON COLUMN public.queer_villages.shell_status IS
  'real | ghost (seo_indexable but zero linked venues+events).';
COMMENT ON COLUMN public.queer_villages.field_provenance IS
  'Per-field fusion {field:{value,confidence,sources[]}} written by the village enricher.';

CREATE INDEX IF NOT EXISTS idx_villages_completeness   ON public.queer_villages(completeness_score);
CREATE INDEX IF NOT EXISTS idx_villages_trust          ON public.queer_villages(trust_score);
CREATE INDEX IF NOT EXISTS idx_villages_last_verified  ON public.queer_villages(last_verified_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_villages_shell_status   ON public.queer_villages(shell_status) WHERE shell_status <> 'real';
CREATE INDEX IF NOT EXISTS idx_villages_needs_attention ON public.queer_villages(id) WHERE needs_attention;

-- ===== 2. village_quality_signals ledger =====
CREATE TABLE IF NOT EXISTS public.village_quality_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id  uuid NOT NULL REFERENCES public.queer_villages(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN
    ('completeness','linkage','freshness','relevance','admin_feedback','enrichment')),
  value       numeric(5,4) NOT NULL DEFAULT 0,
  weight      numeric(4,3) NOT NULL DEFAULT 1.000,
  source      text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_village_quality_signals_v
  ON public.village_quality_signals(village_id, signal_type, created_at DESC);

ALTER TABLE public.village_quality_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='village_quality_signals' AND policyname='vqs_read') THEN
    CREATE POLICY "vqs_read" ON public.village_quality_signals
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='village_quality_signals' AND policyname='vqs_admin_write') THEN
    CREATE POLICY "vqs_admin_write" ON public.village_quality_signals
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;
GRANT ALL ON TABLE public.village_quality_signals TO service_role;

-- ===== 3. village_review_queue (LLM overwrite gate) =====
-- history/description/editorial_hook/notable_landmarks LLM proposals that would overwrite
-- non-empty fields (or any editorial_hook) land here; a human approves; approval copies
-- to the column. Empty-field auto-fills bypass this (handled in the edge function).
CREATE TABLE IF NOT EXISTS public.village_review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id     uuid NOT NULL REFERENCES public.queer_villages(id) ON DELETE CASCADE,
  field          text NOT NULL CHECK (field IN ('history','description','editorial_hook','notable_landmarks')),
  proposed_value jsonb NOT NULL,             -- {value:..} (string or text[] for landmarks)
  citations      jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence     numeric(3,2),
  model          text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  reviewer_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_village_review_queue_open
  ON public.village_review_queue(village_id, field) WHERE status='open';

ALTER TABLE public.village_review_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='village_review_queue' AND policyname='vrq_read') THEN
    CREATE POLICY "vrq_read" ON public.village_review_queue
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='village_review_queue' AND policyname='vrq_admin_write') THEN
    CREATE POLICY "vrq_admin_write" ON public.village_review_queue
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;
GRANT ALL ON TABLE public.village_review_queue TO service_role;

-- ===== 4. village_coverage_gaps =====
CREATE TABLE IF NOT EXISTS public.village_coverage_gaps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id        uuid REFERENCES public.queer_villages(id) ON DELETE CASCADE,
  village_name      text,
  gap_score         smallint NOT NULL DEFAULT 0,
  missing_fields    text[] NOT NULL DEFAULT '{}',
  content_counts    jsonb NOT NULL DEFAULT '{}'::jsonb,
  shell_status      text NOT NULL DEFAULT 'real',
  resolution        text NOT NULL DEFAULT 'enrich' CHECK (resolution IN ('enrich','review')),
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','queued','resolved','ignored')),
  last_checked_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT village_coverage_gaps_village_uk UNIQUE (village_id)
);
CREATE INDEX IF NOT EXISTS idx_village_coverage_gaps_rank ON public.village_coverage_gaps(status, gap_score DESC);

ALTER TABLE public.village_coverage_gaps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='village_coverage_gaps' AND policyname='vcg_read') THEN
    CREATE POLICY "vcg_read" ON public.village_coverage_gaps
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='village_coverage_gaps' AND policyname='vcg_admin_write') THEN
    CREATE POLICY "vcg_admin_write" ON public.village_coverage_gaps
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;
GRANT ALL ON TABLE public.village_coverage_gaps TO service_role;

-- ===== 5. compute_village_completeness — queer-weighted field coverage (0..100) =====
--   queer_content 0.30 | description 0.20 | linkage 0.20 |
--   image 0.10         | geo 0.10        | extras 0.10 (landmarks/website/hook)
CREATE OR REPLACE FUNCTION public.compute_village_completeness(p_id uuid)
RETURNS smallint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v             public.queer_villages%ROWTYPE;
  v_venues      int := 0;
  v_events      int := 0;
  v_queer       numeric := 0;
  v_desc        numeric := 0;
  v_linkage     numeric := 0;
  v_geo         numeric := 0;
  v_image       numeric := 0;
  v_extras      numeric := 0;
  v_desc_len    int := 0;
BEGIN
  SELECT * INTO v FROM public.queer_villages WHERE id = p_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT count(*) INTO v_venues FROM public.venues x
    WHERE x.queer_village_id = p_id AND x.duplicate_of_id IS NULL;
  SELECT count(*) INTO v_events FROM public.events x
    WHERE x.queer_village_id = p_id AND x.duplicate_of_id IS NULL;

  -- queer_content (0.30): queer-relevant history 0.5 + linked venues 0.3 + tags 0.2
  v_queer :=
      (CASE WHEN v.history IS NOT NULL
                 AND v.history ~* '(lgbt|lgbtq|queer|gay|lesbian|trans|pride|rainbow|drag)' THEN 0.5 ELSE 0 END)
    + (CASE WHEN v_venues > 0 THEN 0.3 ELSE 0 END)
    + (CASE WHEN v.tags IS NOT NULL AND array_length(v.tags,1) > 0 THEN 0.2 ELSE 0 END);

  -- description (0.20): length ladder
  v_desc_len := coalesce(length(trim(v.description)), 0);
  v_desc := CASE
    WHEN v_desc_len >= 200 THEN 1.0
    WHEN v_desc_len >= 120 THEN 0.7
    WHEN v_desc_len >= 60  THEN 0.4
    ELSE 0 END;

  -- linkage (0.20): log-scaled venue+event density (saturates ~10)
  v_linkage := least(1.0, ln(1 + v_venues + v_events) / ln(11));

  -- geo (0.10): valid coords 0.6 + boundaries 0.4
  v_geo :=
      (CASE WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL
                 AND NOT (v.latitude = 0 AND v.longitude = 0) THEN 0.6 ELSE 0 END)
    + (CASE WHEN v.boundaries IS NOT NULL THEN 0.4 ELSE 0 END);

  -- image (0.10)
  v_image := CASE WHEN v.image_url IS NOT NULL OR coalesce(array_length(v.images,1),0) > 0 THEN 1.0 ELSE 0 END;

  -- extras (0.10): landmarks 0.34 + website 0.33 + editorial_hook 0.33
  v_extras :=
      (CASE WHEN coalesce(array_length(v.notable_landmarks,1),0) > 0 THEN 0.34 ELSE 0 END)
    + (CASE WHEN v.website IS NOT NULL AND length(trim(v.website)) > 0 THEN 0.33 ELSE 0 END)
    + (CASE WHEN v.editorial_hook IS NOT NULL AND length(trim(v.editorial_hook)) > 0 THEN 0.33 ELSE 0 END);

  RETURN round(100 * least(1.0, greatest(0.0,
      0.30*v_queer + 0.20*v_desc + 0.20*v_linkage
    + 0.10*v_geo   + 0.10*v_image + 0.10*v_extras)))::smallint;
END; $$;
ALTER FUNCTION public.compute_village_completeness(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compute_village_completeness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_village_completeness(uuid) TO service_role, authenticated;

-- ===== 6. completeness recompute (nightly, full-scan; 190 rows) =====
CREATE OR REPLACE FUNCTION public.run_village_completeness_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_changed int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'village_completeness_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'village_completeness_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT q.id, public.compute_village_completeness(q.id) AS new_score FROM public.queer_villages q
  ),
  upd AS (
    UPDATE public.queer_villages q SET completeness_score = s.new_score
    FROM scope s WHERE q.id = s.id AND q.completeness_score IS DISTINCT FROM s.new_score
    RETURNING q.id, s.new_score
  ),
  sig AS (
    INSERT INTO public.village_quality_signals (village_id, signal_type, value, source)
    SELECT id, 'completeness', (new_score/100.0)::numeric(5,4), 'completeness_recompute' FROM upd
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upd;

  SELECT count(*) INTO v_examined FROM public.queer_villages;

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
ALTER FUNCTION public.run_village_completeness_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_village_completeness_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_village_completeness_recompute(boolean) TO service_role, authenticated;

-- ===== 7. trust recompute (nightly) =====
--   completeness 0.40 | linkage 0.20 | freshness 0.15 | relevance 0.15 | admin_feedback 0.10
--   ghost (indexable, zero venues+events) caps at 15.
CREATE OR REPLACE FUNCTION public.run_village_trust_recompute(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_changed int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'village_trust_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'village_trust_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH counts AS (
    SELECT q.id, q.seo_indexable, q.completeness_score, q.needs_attention, q.history,
           q.last_refreshed_at, q.updated_at,
      (SELECT count(*) FROM public.venues v WHERE v.queer_village_id=q.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e WHERE e.queer_village_id=q.id AND e.duplicate_of_id IS NULL) AS events
    FROM public.queer_villages q
  ),
  adminfb AS (
    SELECT DISTINCT ON (village_id) village_id, value
    FROM public.village_quality_signals WHERE signal_type='admin_feedback'
    ORDER BY village_id, created_at DESC
  ),
  scored AS (
    SELECT c.id, c.seo_indexable, c.needs_attention,
      least(1.0, greatest(0.0, coalesce(c.completeness_score,0)/100.0)) AS completeness,
      least(1.0, ln(1 + c.venues + c.events) / ln(11)) AS linkage,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(c.last_refreshed_at,c.updated_at))/86400.0)/90.0) AS freshness,
      (CASE WHEN c.history ~* '(lgbt|lgbtq|queer|gay|lesbian|trans|pride|rainbow|drag)' THEN 1.0 ELSE 0.3 END) AS relevance,
      coalesce(af.value, 0.5) AS admin_feedback,
      (c.venues=0 AND c.events=0) AS is_empty
    FROM counts c
    LEFT JOIN adminfb af ON af.village_id=c.id
  ),
  final AS (
    SELECT id,
      CASE WHEN seo_indexable AND is_empty THEN 'ghost' ELSE 'real' END AS new_shell,
      CASE WHEN seo_indexable AND is_empty THEN 15
        ELSE round(100 * greatest(0.0, least(1.0,
              0.40*completeness + 0.20*linkage + 0.15*freshness
            + 0.15*relevance + 0.10*admin_feedback
            - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))
      END::smallint AS new_trust
    FROM scored
  )
  UPDATE public.queer_villages q
    SET trust_score=f.new_trust, shell_status=f.new_shell, last_verified_at=now()
  FROM final f
  WHERE q.id=f.id
    AND (q.trust_score IS DISTINCT FROM f.new_trust OR q.shell_status IS DISTINCT FROM f.new_shell);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.queer_villages;

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
ALTER FUNCTION public.run_village_trust_recompute(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_village_trust_recompute(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_village_trust_recompute(boolean) TO service_role, authenticated;

-- ===== 8. coverage radar (weekly) — scans every village =====
CREATE OR REPLACE FUNCTION public.run_village_coverage_radar(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_changed int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'village_coverage_radar';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'village_coverage_radar', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH base AS (
    SELECT q.id, q.name, q.seo_indexable, q.completeness_score, q.description, q.history,
           q.image_url, q.images, q.latitude, q.longitude, q.boundaries,
           q.notable_landmarks, q.website, q.editorial_hook, q.tags,
      (SELECT count(*) FROM public.venues v WHERE v.queer_village_id=q.id AND v.duplicate_of_id IS NULL) AS venues,
      (SELECT count(*) FROM public.events e WHERE e.queer_village_id=q.id AND e.duplicate_of_id IS NULL) AS events,
      (SELECT count(*) FROM public.hotels h WHERE h.queer_village_id=q.id) AS hotels
    FROM public.queer_villages q
  ),
  computed AS (
    SELECT b.*,
      (b.venues=0 AND b.events=0) AS is_empty,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN b.description IS NULL OR length(trim(b.description))<120 THEN 'description' END,
        CASE WHEN b.history IS NULL OR b.history !~* '(lgbt|lgbtq|queer|gay|lesbian|trans|pride|rainbow|drag)' THEN 'queer_history' END,
        CASE WHEN b.venues=0 THEN 'venues' END,
        CASE WHEN b.editorial_hook IS NULL THEN 'editorial_hook' END,
        CASE WHEN coalesce(array_length(b.notable_landmarks,1),0)=0 THEN 'notable_landmarks' END,
        CASE WHEN b.boundaries IS NULL THEN 'boundaries' END,
        CASE WHEN b.website IS NULL OR length(trim(b.website))=0 THEN 'website' END,
        CASE WHEN b.image_url IS NULL AND coalesce(array_length(b.images,1),0)=0 THEN 'image' END,
        CASE WHEN b.latitude IS NULL OR b.longitude IS NULL THEN 'coords' END,
        CASE WHEN coalesce(array_length(b.tags,1),0)=0 THEN 'tags' END
      ], NULL) AS missing
    FROM base b
  ),
  routed AS (
    SELECT c.*,
      CASE WHEN c.seo_indexable AND c.is_empty THEN 'ghost' ELSE 'real' END AS shell,
      CASE WHEN c.seo_indexable AND c.is_empty THEN 'review' ELSE 'enrich' END AS resolution,
      least(100, greatest(0, 100 - coalesce(c.completeness_score,0)
            + CASE WHEN c.is_empty THEN 10 ELSE 0 END))::smallint AS gap_score
    FROM computed c
  ),
  upsert AS (
    INSERT INTO public.village_coverage_gaps
      (village_id, village_name, gap_score, missing_fields, content_counts, shell_status, resolution, suggested_actions, status, last_checked_at)
    SELECT r.id, r.name, r.gap_score, r.missing,
      jsonb_build_object('venues',r.venues,'events',r.events,'hotels',r.hotels),
      r.shell, r.resolution,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'field', mf,
                'source', CASE mf
                            WHEN 'queer_history' THEN 'llm'
                            WHEN 'description' THEN 'llm'
                            WHEN 'editorial_hook' THEN 'llm'
                            WHEN 'notable_landmarks' THEN 'llm'
                            WHEN 'venues' THEN 'relink'
                            WHEN 'boundaries' THEN 'wikidata'
                            WHEN 'coords' THEN 'wikidata'
                            ELSE 'manual' END,
                'q', r.name)), '[]'::jsonb)
       FROM unnest(r.missing) AS mf),
      'open', now()
    FROM routed r
    ON CONFLICT (village_id) DO UPDATE
      SET village_name=EXCLUDED.village_name, gap_score=EXCLUDED.gap_score,
          missing_fields=EXCLUDED.missing_fields, content_counts=EXCLUDED.content_counts,
          shell_status=EXCLUDED.shell_status, resolution=EXCLUDED.resolution,
          suggested_actions=EXCLUDED.suggested_actions, last_checked_at=now(),
          status=CASE WHEN public.village_coverage_gaps.status='ignored' THEN 'ignored'
                      WHEN EXCLUDED.gap_score=0 THEN 'resolved' ELSE 'open' END
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upsert;

  SELECT count(*) INTO v_examined FROM public.queer_villages;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('gaps_upserted',v_changed,'villages_examined',v_examined,'forced',p_force) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('gaps_upserted',v_changed,'villages_examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_village_coverage_radar(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_village_coverage_radar(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_village_coverage_radar(boolean) TO service_role, authenticated;

-- ===== 9. relink_village_venues — proximity venue↔village backfill =====
-- Links venues with NULL queer_village_id that sit within p_radius_m of the village
-- centroid AND share the village's city_id. Only fills NULLs (never overrides a manual
-- or existing link), so it is reversible by nulling. Returns count linked. PostGIS in
-- the `extensions` schema. Per-village to keep each UPDATE small (search-trigger safe).
CREATE OR REPLACE FUNCTION public.relink_village_venues(p_village_id uuid, p_radius_m integer DEFAULT 1200)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_lat double precision; v_lng double precision; v_city uuid; v_linked int := 0;
BEGIN
  SELECT latitude, longitude, city_id INTO v_lat, v_lng, v_city
  FROM public.queer_villages WHERE id = p_village_id;
  IF v_lat IS NULL OR v_lng IS NULL OR (v_lat=0 AND v_lng=0) THEN RETURN 0; END IF;

  WITH near AS (
    SELECT v.id FROM public.venues v
    WHERE v.queer_village_id IS NULL
      AND v.duplicate_of_id IS NULL
      AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
      AND NOT (v.latitude=0 AND v.longitude=0)
      AND (v_city IS NULL OR v.city_id = v_city)
      AND extensions.ST_DWithin(
            extensions.ST_SetSRID(extensions.ST_MakePoint(v.longitude, v.latitude),4326)::extensions.geography,
            extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat),4326)::extensions.geography,
            p_radius_m)
  ),
  upd AS (
    UPDATE public.venues v SET queer_village_id = p_village_id
    FROM near n WHERE v.id = n.id
    RETURNING 1
  )
  SELECT count(*) INTO v_linked FROM upd;

  IF v_linked > 0 THEN
    UPDATE public.queer_villages SET last_refreshed_at = now() WHERE id = p_village_id;
  END IF;
  RETURN v_linked;
END; $$;
ALTER FUNCTION public.relink_village_venues(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.relink_village_venues(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relink_village_venues(uuid, integer) TO service_role;

-- Bulk nearest-assignment relink, bounded per call (search-trigger safe). Each unlinked
-- venue is assigned to its single NEAREST village within p_radius_m sharing its city.
-- Returns rows linked; call repeatedly until 0. Only fills NULLs (reversible). Used by
-- scripts/data-quality/relink-villages.mjs for the one-time + ongoing backfill.
CREATE OR REPLACE FUNCTION public.run_village_relink_batch(p_radius_m integer DEFAULT 800, p_batch integer DEFAULT 300)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_linked int := 0;
BEGIN
  WITH unlinked AS (
    SELECT v.id, v.city_id,
           extensions.ST_SetSRID(extensions.ST_MakePoint(v.longitude, v.latitude),4326)::extensions.geography AS g
    FROM public.venues v
    WHERE v.queer_village_id IS NULL AND v.duplicate_of_id IS NULL
      AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL AND NOT (v.latitude=0 AND v.longitude=0)
  ),
  nearest AS (
    SELECT u.id AS venue_id, q.id AS village_id, q.dist
    FROM unlinked u
    JOIN LATERAL (
      SELECT q.id,
             extensions.ST_Distance(u.g, extensions.ST_SetSRID(extensions.ST_MakePoint(q.longitude,q.latitude),4326)::extensions.geography) AS dist
      FROM public.queer_villages q
      WHERE (q.city_id IS NULL OR q.city_id = u.city_id)
        AND q.latitude IS NOT NULL AND q.longitude IS NOT NULL AND NOT (q.latitude=0 AND q.longitude=0)
      ORDER BY u.g <-> extensions.ST_SetSRID(extensions.ST_MakePoint(q.longitude,q.latitude),4326)::extensions.geography
      LIMIT 1
    ) q ON true
    WHERE q.dist <= p_radius_m
    ORDER BY q.dist
    LIMIT p_batch
  ),
  upd AS (
    UPDATE public.venues v SET queer_village_id = n.village_id
    FROM nearest n WHERE v.id = n.venue_id RETURNING 1
  )
  SELECT count(*) INTO v_linked FROM upd;
  RETURN v_linked;
END; $$;
ALTER FUNCTION public.run_village_relink_batch(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_village_relink_batch(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_village_relink_batch(integer, integer) TO service_role;

-- ===== 10. villages_due_for_refresh selector =====
-- never-refreshed > ghost/empty > low-completeness > stale.
CREATE OR REPLACE FUNCTION public.villages_due_for_refresh(p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, name text, slug text, completeness_score smallint, trust_score smallint,
              shell_status text, venue_count bigint, last_refreshed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.name, q.slug, q.completeness_score, q.trust_score, q.shell_status,
    (SELECT count(*) FROM public.venues v WHERE v.queer_village_id=q.id AND v.duplicate_of_id IS NULL) AS venue_count,
    q.last_refreshed_at
  FROM public.queer_villages q
  ORDER BY
    q.last_refreshed_at NULLS FIRST,
    (q.shell_status='ghost') DESC,
    q.completeness_score ASC,
    q.updated_at ASC
  LIMIT greatest(1, least(p_limit, 200));
$$;
ALTER FUNCTION public.villages_due_for_refresh(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.villages_due_for_refresh(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.villages_due_for_refresh(integer) TO service_role, authenticated;

-- ===== 11. approve / reject review =====
CREATE OR REPLACE FUNCTION public.approve_village_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.village_review_queue%ROWTYPE; v_val jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.village_review_queue WHERE id=p_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review row not found or not open'; END IF;
  v_val := r.proposed_value->'value';

  IF r.field='notable_landmarks' THEN
    UPDATE public.queer_villages
      SET notable_landmarks = ARRAY(SELECT jsonb_array_elements_text(v_val)),
          last_refreshed_at = now(),
          field_provenance = field_provenance || jsonb_build_object(r.field,
            jsonb_build_object('source','llm+human','confidence',r.confidence,'citations',r.citations))
      WHERE id=r.village_id;
  ELSE
    UPDATE public.queer_villages
      SET history        = CASE WHEN r.field='history' THEN v_val#>>'{}' ELSE history END,
          description    = CASE WHEN r.field='description' THEN v_val#>>'{}' ELSE description END,
          editorial_hook = CASE WHEN r.field='editorial_hook' THEN v_val#>>'{}' ELSE editorial_hook END,
          last_refreshed_at = now(),
          field_provenance = field_provenance || jsonb_build_object(r.field,
            jsonb_build_object('source','llm+human','confidence',r.confidence,'citations',r.citations))
      WHERE id=r.village_id;
  END IF;

  UPDATE public.village_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now() WHERE id=p_id;
  RETURN jsonb_build_object('approved',true,'village_id',r.village_id,'field',r.field);
END; $$;
ALTER FUNCTION public.approve_village_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_village_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_village_review(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_village_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.village_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now()
    WHERE id=p_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'review row not found or not open'; END IF;
  RETURN jsonb_build_object('rejected',true);
END; $$;
ALTER FUNCTION public.reject_village_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_village_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_village_review(uuid, text) TO authenticated, service_role;

-- ===== 12. register automations (PAUSED) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('village_completeness_recompute','Recompute village completeness scores',
   'Nightly queer-weighted field-coverage score (0-100) per queer village. Feeds trust recompute.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_village_completeness_recompute"}'::jsonb, '35 3 * * *'),
  ('village_trust_recompute','Recompute village trust scores',
   'Nightly composite trust_score from completeness + venue linkage + freshness + queer relevance.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_village_trust_recompute"}'::jsonb, '50 3 * * *'),
  ('village_coverage_radar','Detect village content gaps',
   'Weekly scan of every queer village; records village_coverage_gaps (missing fields + content counts + resolution route).',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_village_coverage_radar"}'::jsonb, '30 4 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 13. extend dispatch RPCs (carry forward ALL current slugs + village ones) =====
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_result jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_slug = 'event_auto_archive' then v_result := public.run_event_auto_archive();
  elsif p_slug = 'staging_auto_reject_stale' then v_result := public.run_staging_auto_reject_stale();
  elsif p_slug = 'workflow_runs_purge' then v_result := public.run_workflow_runs_purge();
  elsif p_slug = 'enrichment_log_purge' then v_result := public.run_enrichment_log_purge();
  elsif p_slug = 'event_trust_recompute' then v_result := public.run_event_trust_recompute();
  elsif p_slug = 'event_coverage_radar' then v_result := public.run_event_coverage_radar();
  elsif p_slug = 'venue_coord_snap' then v_result := public.run_venue_coord_snap();
  elsif p_slug = 'city_trust_recompute' then v_result := public.run_city_trust_recompute();
  elsif p_slug = 'city_coverage_radar' then v_result := public.run_city_coverage_radar();
  elsif p_slug = 'city_safety_backfill' then v_result := public.run_city_safety_backfill();
  elsif p_slug = 'hotel_safety_backfill' then v_result := public.run_hotel_safety_backfill();
  elsif p_slug = 'amenity_coverage_summary' then v_result := public.run_amenity_coverage_summary();
  elsif p_slug = 'personality_trust_recompute' then v_result := public.run_personality_trust_recompute();
  elsif p_slug = 'personality_coverage_radar' then v_result := public.run_personality_coverage_radar();
  elsif p_slug = 'personality_auto_promote' then v_result := public.run_personality_auto_promote();
  elsif p_slug = 'village_completeness_recompute' then v_result := public.run_village_completeness_recompute();
  elsif p_slug = 'village_trust_recompute' then v_result := public.run_village_trust_recompute();
  elsif p_slug = 'village_coverage_radar' then v_result := public.run_village_coverage_radar();
  else raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;
  return v_result;
end; $$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode='42501'; end if;
  select id into v_automation_id from public.admin_automations where slug = p_slug;
  if v_automation_id is null then raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;

  if p_slug = 'event_auto_archive' then
    select count(*) into v_examined from public.events
    where status='active' and end_date is not null and end_date < now() - interval '7 days';
  elsif p_slug = 'staging_auto_reject_stale' then
    select count(*) into v_examined from public.ingestion_staging
    where review_status='pending_review' and disposition='pending' and created_at < now() - interval '60 days';
  elsif p_slug = 'workflow_runs_purge' then
    select count(*) into v_examined from public.workflow_runs
    where status='completed' and started_at < now() - interval '30 days';
  elsif p_slug = 'enrichment_log_purge' then
    select count(*) into v_examined from public.enrichment_log
    where status in ('skipped','done') and created_at < now() - interval '30 days';
  elsif p_slug = 'event_trust_recompute' then
    select count(*) into v_examined from public.events
    where duplicate_of_id is null
      and (start_date > now() - interval '7 days' or last_verified_at is null or updated_at > now() - interval '2 days');
  elsif p_slug = 'event_coverage_radar' then
    select count(*) into v_examined from public.cities where is_major_city = true;
  elsif p_slug = 'venue_coord_snap' then
    select count(*) into v_examined from public.venues_misplaced(null) where is_geocodable = false;
  elsif p_slug = 'city_trust_recompute' then
    select count(*) into v_examined from public.cities c
    where c.duplicate_of_id is null
      and (c.last_verified_at is null or c.updated_at > c.last_verified_at or c.last_verified_at < now() - interval '30 days');
  elsif p_slug = 'city_coverage_radar' then
    select count(*) into v_examined from public.cities where duplicate_of_id is null;
  elsif p_slug = 'city_safety_backfill' then
    select count(*) into v_examined from public.cities c
    where c.duplicate_of_id is null
      and (c.safety_notes is null or length(trim(c.safety_notes))=0)
      and coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      and not exists (select 1 from public.city_review_queue q
                      where q.city_id=c.id and q.field='safety_notes' and q.status='open');
  elsif p_slug = 'hotel_safety_backfill' then
    select count(*) into v_examined from public.hotels h
    where h.queer_safety_notes is null
       or h.queer_safety_notes ilike 'LGBTQ+-host accommodation listed on misterb&b%'
       or h.queer_safety_notes ilike '%equality score%';
  elsif p_slug = 'personality_trust_recompute' then
    select count(*) into v_examined from public.personalities p
    where p.duplicate_of_id is null and coalesce(p.review_status,'')<>'archived'
      and (p.last_verified_at is null or p.updated_at > p.last_verified_at or p.last_verified_at < now() - interval '30 days');
  elsif p_slug = 'personality_coverage_radar' then
    select count(*) into v_examined from public.personalities
    where duplicate_of_id is null and coalesce(review_status,'')<>'archived';
  elsif p_slug = 'personality_auto_promote' then
    select count(*) into v_examined from public.personalities_promotable(1000);
  elsif p_slug in ('village_completeness_recompute','village_trust_recompute','village_coverage_radar') then
    select count(*) into v_examined from public.queer_villages;
  else raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  values (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  return jsonb_build_object('would_change', v_examined);
end; $$;

-- ===== 14. cron: SQL jobs (no-op while paused) =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='village_completeness_recompute') THEN PERFORM cron.unschedule('village_completeness_recompute'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='village_trust_recompute') THEN PERFORM cron.unschedule('village_trust_recompute'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='village_coverage_radar') THEN PERFORM cron.unschedule('village_coverage_radar'); END IF;
END $$;
SELECT cron.schedule('village_completeness_recompute', '35 3 * * *', 'SELECT public.run_village_completeness_recompute();');
SELECT cron.schedule('village_trust_recompute',        '50 3 * * *', 'SELECT public.run_village_trust_recompute();');
SELECT cron.schedule('village_coverage_radar',         '30 4 * * 1', 'SELECT public.run_village_coverage_radar();');

-- ===== 15. cron: agentic edge enrich (internal-secret gated) =====
-- Weekly grounded queer enrichment over live villages. pipeline-enrich-village is
-- verify_jwt=false and self-gates via requireInternalOrAdmin, so the cron presents
-- the vault internal_invoke_secret as X-Internal-Secret (house pattern). The job is
-- registered but the run only does work once OpenAI/CF AI is available; everything it
-- proposes is review-gated, so this is safe to leave scheduled.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='village_agentic_enrich') THEN PERFORM cron.unschedule('village_agentic_enrich'); END IF;
END $$;
SELECT cron.schedule('village_agentic_enrich', '40 5 * * 0',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-enrich-village',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode','agentic','batch_limit',8),
    timeout_milliseconds := 30000
  ) as request_id;
  $cron$);
