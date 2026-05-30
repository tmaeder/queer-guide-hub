-- =============================================================================
-- Venue Truth Engine — Phase 0: provenance + confidence layer
-- =============================================================================
-- Today venue quality is a single composite venues.quality_score. There is no
-- record of WHICH source asserted a field, HOW confident we are, or WHEN it was
-- last seen. This migration adds the provenance layer that the consensus-merge
-- node (Phase 1) writes to, the audit trail for merge decisions, and the
-- selector RPC that drives the lean continuous refresh loop (Phase 2).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. venue_field_provenance — one row per (venue, field, source) candidate.
--    is_winning marks the value that consensus chose for that field.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_field_provenance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  field       text NOT NULL,                 -- e.g. 'name','website','hours','lgbti_relevance_score'
  value       jsonb,                          -- candidate value (jsonb so any field type fits)
  source      text NOT NULL,                  -- google|osm|foursquare|tomtom|tripadvisor|wikidata|website|llm|admin|existing
  confidence  numeric(3,2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  is_winning  boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, field, source)
);

CREATE INDEX IF NOT EXISTS idx_vfp_venue_field
  ON public.venue_field_provenance (venue_id, field);
CREATE INDEX IF NOT EXISTS idx_vfp_winning
  ON public.venue_field_provenance (venue_id, field) WHERE is_winning;

COMMENT ON TABLE public.venue_field_provenance IS
  'Per-field, per-source candidate values for venues with confidence. is_winning marks the consensus-chosen value. Written by pipeline-consensus-merge.';

-- ---------------------------------------------------------------------------
-- 2. venue_consensus_audit — one row per merge decision (parity with
--    news_dedup_audit). Records who agreed, who conflicted, and the action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_consensus_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  staging_id        uuid,
  pipeline_run_id   uuid,
  field             text NOT NULL,
  winning_value     jsonb,
  winning_source    text,
  confidence        numeric(3,2),
  agreeing_sources  text[] NOT NULL DEFAULT '{}',
  conflicting_sources text[] NOT NULL DEFAULT '{}',
  action            text NOT NULL,            -- auto_commit | triage | closure_flag | no_change | skipped
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vca_venue       ON public.venue_consensus_audit (venue_id);
CREATE INDEX IF NOT EXISTS idx_vca_run         ON public.venue_consensus_audit (pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_vca_created     ON public.venue_consensus_audit (created_at DESC);

COMMENT ON TABLE public.venue_consensus_audit IS
  'Audit trail of venue field-level consensus decisions: winning value, agreeing/conflicting sources, and the commit/triage action taken.';

-- ---------------------------------------------------------------------------
-- 3. Selector indexes on venues for the lean refresh loop
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_venues_refresh_order
  ON public.venues (last_refreshed_at NULLS FIRST)
  WHERE closed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. venues_due_for_refresh(limit) — budgeted, prioritized work-list for the
--    continuous loop. Never returns closed venues. Priority:
--    never-refreshed > broken-url > oldest-refresh > low-quality.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venues_due_for_refresh(p_limit int DEFAULT 25)
RETURNS TABLE (
  id              uuid,
  name            text,
  slug            text,
  latitude        numeric,
  longitude       numeric,
  website         text,
  foursquare_id   text,
  tomtom_id       text,
  external_id     text,
  platform_ids    jsonb,
  quality_score   smallint,
  url_status      varchar,
  last_refreshed_at timestamptz,
  refresh_reason  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id, v.name, v.slug, v.latitude, v.longitude, v.website,
    v.foursquare_id, v.tomtom_id, v.external_id, v.platform_ids,
    v.quality_score, v.url_status, v.last_refreshed_at,
    CASE
      WHEN v.last_refreshed_at IS NULL THEN 'never_refreshed'
      WHEN v.url_status IS NOT NULL AND v.url_status NOT IN ('200','') THEN 'broken_url'
      WHEN v.quality_score < 50 THEN 'low_quality'
      ELSE 'stale'
    END AS refresh_reason
  FROM public.venues v
  WHERE v.closed_at IS NULL
    AND v.duplicate_of_id IS NULL
  ORDER BY
    (v.last_refreshed_at IS NOT NULL),                                  -- never-refreshed first
    (v.url_status IS NULL OR v.url_status IN ('200','')),               -- broken-url next
    v.quality_score ASC NULLS FIRST,                                    -- low quality next
    v.last_refreshed_at ASC NULLS FIRST                                 -- then oldest
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

COMMENT ON FUNCTION public.venues_due_for_refresh(int) IS
  'Returns a budgeted, prioritized batch of venues for the continuous refresh loop (wf-venue-refresh). Excludes closed and duplicate venues.';

-- ---------------------------------------------------------------------------
-- 5. RLS + grants (admin-only read; service_role full — mirrors news_dedup_audit)
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_field_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_consensus_audit  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_field_provenance_admin_all ON public.venue_field_provenance;
CREATE POLICY venue_field_provenance_admin_all ON public.venue_field_provenance
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS venue_consensus_audit_admin_all ON public.venue_consensus_audit;
CREATE POLICY venue_consensus_audit_admin_all ON public.venue_consensus_audit
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

GRANT ALL ON TABLE public.venue_field_provenance TO authenticated, service_role;
GRANT ALL ON TABLE public.venue_consensus_audit  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.venues_due_for_refresh(int) TO authenticated, service_role;
