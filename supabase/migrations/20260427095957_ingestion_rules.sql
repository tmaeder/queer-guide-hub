-- Rules engine for community submissions: hashtag/handle/keyword
-- → label / tag / priority / route. Evaluated by pipeline-apply-rules
-- between media-process and safety-relevance. Append-only audit
-- writes hits to ingestion_rule_hits.

CREATE TABLE IF NOT EXISTS public.ingestion_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  priority     INTEGER NOT NULL DEFAULT 100,
  -- match: { platforms?: text[], any_of?: text[], all_of?: text[], regex?: text }
  -- platforms = NULL/empty → all
  -- any_of/all_of are case-insensitive substring matches against
  --   raw_text || ocr_text || vision_summary || transcript_text
  match        JSONB NOT NULL,
  -- actions: { add_labels?: text[], set_priority?: int, set_status?: text,
  --           force_review?: bool, set_permission_level?: text }
  actions      JSONB NOT NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_rules_enabled
  ON public.ingestion_rules(enabled, priority)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS public.ingestion_rule_hits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL REFERENCES public.ingestion_rules(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.community_submissions(id) ON DELETE CASCADE,
  matched_terms JSONB,
  applied_actions JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_rule_hits_submission
  ON public.ingestion_rule_hits(submission_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_rule_hits_rule
  ON public.ingestion_rule_hits(rule_id, created_at DESC);

ALTER TABLE public.ingestion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_rule_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_rules_admin_all ON public.ingestion_rules;
CREATE POLICY ingestion_rules_admin_all ON public.ingestion_rules
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS ingestion_rule_hits_admin_read ON public.ingestion_rule_hits;
CREATE POLICY ingestion_rule_hits_admin_read ON public.ingestion_rule_hits
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingestion_rules TO authenticated;
GRANT SELECT ON public.ingestion_rule_hits TO authenticated;
GRANT INSERT, SELECT ON public.ingestion_rule_hits TO service_role;
