-- Amenity Truth Engine — Phase 2: quality ledger, review gate, work-list selector.
-- Mirrors City/Venue truth engines (20260607100000 / 20260528000000). Reuses the
-- existing venue_field_provenance + venue_consensus_audit tables.
--
-- Deliberately does NOT store a recomputed completeness score on venues:
-- trg_search_documents_venue fires on EVERY venue UPDATE (not column-scoped), so a
-- nightly 32k-row score write would storm the search sync on a disk-constrained DB.
-- The selector ranks by cardinality(amenities) directly; the admin panel counts live.
-- The only venue UPDATEs are the bounded, batched backfill writes (which SHOULD re-index).
-- Idempotent; no CONCURRENTLY (runs in a txn).

-- ===== 1. venue_quality_signals — append-only ledger (written by backfill, bounded) =====
CREATE TABLE IF NOT EXISTS public.venue_quality_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN
    ('amenity_coverage','accessibility_coverage','enrichment','admin_feedback','corroboration')),
  value       numeric(5,4) NOT NULL DEFAULT 0,   -- normalized 0.0000..1.0000
  weight      numeric(4,3) NOT NULL DEFAULT 1.000,
  source      text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venue_quality_signals_venue
  ON public.venue_quality_signals(venue_id, signal_type, created_at DESC);

ALTER TABLE public.venue_quality_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS venue_quality_signals_admin_all ON public.venue_quality_signals;
CREATE POLICY venue_quality_signals_admin_all ON public.venue_quality_signals
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
GRANT ALL ON TABLE public.venue_quality_signals TO authenticated, service_role;

-- ===== 2. venue_review_queue — accessibility safety gate =====
-- accessibility_attributes / accessibility_notes from the LLM NEVER land on venues
-- directly: the enricher inserts here, a human approves, approval copies to the column.
CREATE TABLE IF NOT EXISTS public.venue_review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  field          text NOT NULL CHECK (field IN ('accessibility_attributes','accessibility_notes','amenities')),
  proposed_value jsonb NOT NULL,                          -- {value: [...slugs] | "text", rationale}
  citations      jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{quote, source}]
  confidence     numeric(3,2),
  model          text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  reviewer_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_venue_review_queue_open
  ON public.venue_review_queue(venue_id, field) WHERE status='open';
CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_review_queue_open
  ON public.venue_review_queue(venue_id, field) WHERE status='open';

ALTER TABLE public.venue_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS venue_review_queue_admin_all ON public.venue_review_queue;
CREATE POLICY venue_review_queue_admin_all ON public.venue_review_queue
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
GRANT ALL ON TABLE public.venue_review_queue TO authenticated, service_role;

-- ===== 3. approve / reject RPCs (atomic, audited, admin-only) =====
CREATE OR REPLACE FUNCTION public.approve_venue_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r        public.venue_review_queue%ROWTYPE;
  v_slugs  text[];
  v_text   text;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  SELECT * INTO r FROM public.venue_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  IF r.field IN ('accessibility_attributes','amenities') THEN
    -- proposed_value.value (or proposed_value itself) is an array of canonical slugs.
    SELECT array_agg(DISTINCT s) INTO v_slugs
    FROM jsonb_array_elements_text(coalesce(r.proposed_value->'value', r.proposed_value)) AS t(s);

    IF r.field = 'accessibility_attributes' THEN
      UPDATE public.venues
        SET accessibility_attributes =
          (SELECT array(SELECT DISTINCT unnest(coalesce(accessibility_attributes,'{}'::text[]) || coalesce(v_slugs,'{}'::text[])) ORDER BY 1))
        WHERE id = r.venue_id;
    ELSE
      UPDATE public.venues
        SET amenities =
          (SELECT array(SELECT DISTINCT unnest(coalesce(amenities,'{}'::text[]) || coalesce(v_slugs,'{}'::text[])) ORDER BY 1)),
            amenities_verified = true
        WHERE id = r.venue_id;
    END IF;
  ELSIF r.field = 'accessibility_notes' THEN
    v_text := r.proposed_value->>'value';
    UPDATE public.venues SET accessibility_notes = v_text WHERE id = r.venue_id;
  ELSE
    RAISE EXCEPTION 'unsupported review field: %', r.field USING ERRCODE='22023';
  END IF;

  UPDATE public.venue_review_queue
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id = p_id;

  INSERT INTO public.venue_consensus_audit (venue_id, field, winning_value, winning_source, confidence, agreeing_sources, action, details)
  VALUES (r.venue_id, r.field, r.proposed_value, 'llm+human', r.confidence, ARRAY['llm','human'], 'auto_commit',
          jsonb_build_object('approved_by', auth.uid(), 'citations', r.citations));

  IF NOT EXISTS (SELECT 1 FROM public.venue_review_queue WHERE venue_id=r.venue_id AND status='open') THEN
    UPDATE public.venues SET needs_attention=false WHERE id=r.venue_id AND needs_attention;
  END IF;

  RETURN jsonb_build_object('approved', true, 'field', r.field, 'venue_id', r.venue_id);
END; $$;
ALTER FUNCTION public.approve_venue_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_venue_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_venue_review(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_venue_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.venue_review_queue%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.venue_review_queue WHERE id = p_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review item not found or not open' USING ERRCODE='22023'; END IF;

  UPDATE public.venue_review_queue
    SET status='rejected', reviewer_id=auth.uid(), reviewed_at=now(), reviewer_note=p_note
    WHERE id = p_id;

  INSERT INTO public.venue_consensus_audit (venue_id, field, winning_value, winning_source, confidence, action, details)
  VALUES (r.venue_id, r.field, r.proposed_value, 'llm', r.confidence, 'no_change',
          jsonb_build_object('rejected_by', auth.uid(), 'note', p_note));

  IF NOT EXISTS (SELECT 1 FROM public.venue_review_queue WHERE venue_id=r.venue_id AND status='open') THEN
    UPDATE public.venues SET needs_attention=false WHERE id=r.venue_id AND needs_attention;
  END IF;

  RETURN jsonb_build_object('rejected', true, 'field', r.field, 'venue_id', r.venue_id);
END; $$;
ALTER FUNCTION public.reject_venue_review(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_venue_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_venue_review(uuid, text) TO authenticated, service_role;

-- ===== 4. work-list selector (empty-amenities first) =====
CREATE INDEX IF NOT EXISTS idx_venues_amenity_backfill
  ON public.venues (last_refreshed_at NULLS FIRST)
  WHERE closed_at IS NULL AND duplicate_of_id IS NULL
        AND coalesce(array_length(amenities,1),0) = 0;

CREATE OR REPLACE FUNCTION public.venues_due_for_amenity_backfill(p_limit int DEFAULT 25)
RETURNS TABLE (
  id              uuid,
  name            text,
  category        text,
  description     text,
  tags            text[],
  amenities       text[],
  accessibility_attributes text[],
  platform_ids    jsonb,
  last_refreshed_at timestamptz,
  refresh_reason  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    v.id, v.name, v.category, v.description, v.tags, v.amenities,
    v.accessibility_attributes, v.platform_ids, v.last_refreshed_at,
    CASE
      WHEN coalesce(array_length(v.amenities,1),0) = 0 THEN 'no_amenities'
      WHEN coalesce(array_length(v.accessibility_attributes,1),0) = 0 THEN 'no_accessibility'
      WHEN v.amenities_verified IS NOT TRUE THEN 'unverified'
      ELSE 'stale'
    END AS refresh_reason
  FROM public.venues v
  WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL
  ORDER BY
    (coalesce(array_length(v.amenities,1),0) > 0),                 -- empty amenities first
    (coalesce(array_length(v.accessibility_attributes,1),0) > 0),  -- no accessibility next
    (v.amenities_verified IS TRUE),                                -- unverified next
    v.last_refreshed_at ASC NULLS FIRST                            -- then oldest
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.venues_due_for_amenity_backfill(int) TO service_role, authenticated;
COMMENT ON FUNCTION public.venues_due_for_amenity_backfill(int) IS
  'Prioritized batch for amenity-truth-backfill: empty-amenities > no-accessibility > unverified > stale. Excludes closed/duplicate venues.';

-- ===== 5. coverage health pulse (light aggregate — no per-row writes) =====
CREATE OR REPLACE FUNCTION public.run_amenity_coverage_summary(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_summary       jsonb;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'amenity_coverage_summary';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'amenity_coverage_summary', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  SELECT jsonb_build_object(
    'total',           count(*),
    'with_amenities',  count(*) FILTER (WHERE coalesce(array_length(amenities,1),0) > 0),
    'with_accessibility', count(*) FILTER (WHERE coalesce(array_length(accessibility_attributes,1),0) > 0),
    'verified',        count(*) FILTER (WHERE amenities_verified),
    'needs_attention', count(*) FILTER (WHERE needs_attention)
  ) INTO v_summary
  FROM public.venues
  WHERE closed_at IS NULL AND duplicate_of_id IS NULL;

  v_summary := v_summary || jsonb_build_object(
    'open_reviews', (SELECT count(*) FROM public.venue_review_queue WHERE status='open'));

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=(v_summary->>'total')::int, summary=v_summary WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN v_summary;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_amenity_coverage_summary(boolean) TO service_role, authenticated;

-- ===== 6. register automation (PAUSED) + dispatch wiring =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('amenity_coverage_summary','Amenity coverage health pulse',
   'Weekly aggregate of venue amenity + accessibility coverage and open accessibility reviews. Read-only; no per-row writes.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_amenity_coverage_summary"}'::jsonb, '35 4 * * 1')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

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
  ELSIF p_slug = 'city_safety_backfill' THEN v_result := public.run_city_safety_backfill();
  ELSIF p_slug = 'hotel_safety_backfill' THEN v_result := public.run_hotel_safety_backfill();
  ELSIF p_slug = 'amenity_coverage_summary' THEN v_result := public.run_amenity_coverage_summary();
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  RETURN v_result;
END; $$;

-- Weekly cron for the health pulse (read-only).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='amenity_coverage_summary') THEN
    PERFORM cron.unschedule('amenity_coverage_summary');
  END IF;
  PERFORM cron.schedule('amenity_coverage_summary', '35 4 * * 1', 'SELECT public.run_amenity_coverage_summary();');
END $$;
