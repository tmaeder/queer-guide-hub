-- Repair: venue_field_provenance + venue_consensus_audit are MISSING on prod.
-- Migration 20260528000001 is recorded applied in schema_migrations, but the two
-- tables it creates don't exist (history drift — the "schema_migrations == repo
-- files but DB lacks the objects" class noted in CLAUDE.md). The consequence is
-- silent and severe: approve_venue_review / reject_venue_review INSERT into
-- venue_consensus_audit, so EVERY accessibility-review approval has errored with
-- 42P01 since the engine launched — which is the real reason the review queue
-- was never cleared (0 approved / 0 rejected ever). The backfill's provenance
-- upsert into venue_field_provenance also failed (swallowed, non-fatal).
-- This recreates both exactly as 20260528000001 defined them. Idempotent.

CREATE TABLE IF NOT EXISTS public.venue_field_provenance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  field       text NOT NULL,
  value       jsonb,
  source      text NOT NULL,
  confidence  numeric(3,2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  is_winning  boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, field, source)
);
CREATE INDEX IF NOT EXISTS idx_vfp_venue_field ON public.venue_field_provenance (venue_id, field);
CREATE INDEX IF NOT EXISTS idx_vfp_winning     ON public.venue_field_provenance (venue_id, field) WHERE is_winning;

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
  action            text NOT NULL,
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vca_venue   ON public.venue_consensus_audit (venue_id);
CREATE INDEX IF NOT EXISTS idx_vca_run     ON public.venue_consensus_audit (pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_vca_created ON public.venue_consensus_audit (created_at DESC);

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

NOTIFY pgrst, 'reload schema';
