-- ============================================================================
-- Background Automation System — Tables, Functions, RLS, Indexes, Realtime
-- ============================================================================

-- ── 1. automation_modules ───────────────────────────────────────────────────

CREATE TABLE public.automation_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id UUID REFERENCES public.workflow_definitions(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  module_type TEXT NOT NULL CHECK (module_type IN (
    'content_validation','link_sanitization','data_normalization',
    'geo_enrichment','auto_tagging','ai_enhancement'
  )),
  content_types TEXT[] NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  auto_approve_threshold NUMERIC(3,2) DEFAULT 0.85
    CHECK (auto_approve_threshold >= 0 AND auto_approve_threshold <= 1.01),
  batch_size INT DEFAULT 50 CHECK (batch_size BETWEEN 1 AND 500),
  rate_limit_per_hour INT DEFAULT 200,
  config JSONB DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  total_runs INT DEFAULT 0,
  total_changes_proposed INT DEFAULT 0,
  total_changes_applied INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_automation_modules_slug ON public.automation_modules(slug);
CREATE INDEX idx_automation_modules_enabled ON public.automation_modules(is_enabled) WHERE is_enabled = true;

-- ── 2. automation_rules ─────────────────────────────────────────────────────

CREATE TABLE public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.automation_modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'required','format','length','regex','url_valid','geo_match',
    'normalize','sanitize','ai_check','custom'
  )),
  rule_config JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical')),
  is_enabled BOOLEAN DEFAULT true,
  auto_fix BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(module_id, name)
);

CREATE INDEX idx_automation_rules_module ON public.automation_rules(module_id);
CREATE INDEX idx_automation_rules_content_type ON public.automation_rules(content_type);
CREATE INDEX idx_automation_rules_enabled ON public.automation_rules(module_id, is_enabled) WHERE is_enabled = true;

-- ── 3. content_changes ──────────────────────────────────────────────────────

CREATE TABLE public.content_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.automation_modules(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  content_name TEXT,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'update','insert','delete','normalize','sanitize','enrich','flag'
  )),
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','auto_approved','approved','rejected','applied','reverted')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  batch_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_changes_status ON public.content_changes(status);
CREATE INDEX idx_content_changes_module ON public.content_changes(module_id);
CREATE INDEX idx_content_changes_content ON public.content_changes(content_type, content_id);
CREATE INDEX idx_content_changes_created ON public.content_changes(created_at DESC);
CREATE INDEX idx_content_changes_pending ON public.content_changes(created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_content_changes_batch ON public.content_changes(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_content_changes_confidence ON public.content_changes(confidence) WHERE status = 'pending';

-- ── 4. automation_run_log ───────────────────────────────────────────────────

CREATE TABLE public.automation_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.automation_modules(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  content_type TEXT,
  items_scanned INT DEFAULT 0,
  changes_proposed INT DEFAULT 0,
  changes_auto_approved INT DEFAULT 0,
  changes_pending_review INT DEFAULT 0,
  errors INT DEFAULT 0,
  duration_ms INT,
  run_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_automation_run_log_module ON public.automation_run_log(module_id);
CREATE INDEX idx_automation_run_log_created ON public.automation_run_log(created_at DESC);
CREATE INDEX idx_automation_run_log_module_recent ON public.automation_run_log(module_id, created_at DESC);

-- ── 5. Triggers ─────────────────────────────────────────────────────────────

CREATE TRIGGER set_automation_modules_updated_at
  BEFORE UPDATE ON public.automation_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.automation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_modules_admin_all" ON public.automation_modules
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "automation_rules_admin_all" ON public.automation_rules
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "content_changes_admin_all" ON public.content_changes
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "automation_run_log_admin_all" ON public.automation_run_log
  FOR ALL USING (has_role((SELECT auth.uid()), 'admin'::app_role));

-- ── 7. Realtime ─────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.content_changes;

-- ── 8. DB Functions ─────────────────────────────────────────────────────────

-- Apply a single content change to its target table
CREATE OR REPLACE FUNCTION public.apply_content_change(p_change_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_change RECORD;
  v_allowed_tables TEXT[] := ARRAY[
    'venues','events','personalities','news_articles',
    'cities','countries','unified_tags','marketplace_listings',
    'community_groups','hotels','queer_villages'
  ];
  v_sql TEXT;
  v_value TEXT;
BEGIN
  SELECT * INTO v_change FROM public.content_changes
    WHERE id = p_change_id AND status IN ('pending','auto_approved','approved')
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change % not found or not in applicable status', p_change_id;
  END IF;

  IF NOT v_change.content_type = ANY(v_allowed_tables) THEN
    RAISE EXCEPTION 'Invalid content_type: %', v_change.content_type;
  END IF;

  -- Skip flag-only changes (they don't modify data)
  IF v_change.change_type = 'flag' THEN
    UPDATE public.content_changes
    SET status = 'applied', applied_at = now()
    WHERE id = p_change_id;
    RETURN TRUE;
  END IF;

  -- Extract text value from JSONB
  v_value := v_change.new_value #>> '{}';

  -- Build safe dynamic SQL with format(%I) for identifiers
  v_sql := format(
    'UPDATE %I SET %I = $1 WHERE id = $2',
    v_change.content_type,
    v_change.field_name
  );

  EXECUTE v_sql USING v_value, v_change.content_id;

  UPDATE public.content_changes
  SET status = 'applied', applied_at = now()
  WHERE id = p_change_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'apply_content_change failed for %: %', p_change_id, SQLERRM;
  RETURN FALSE;
END;
$$;

-- Revert a previously applied change
CREATE OR REPLACE FUNCTION public.revert_content_change(p_change_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_change RECORD;
  v_allowed_tables TEXT[] := ARRAY[
    'venues','events','personalities','news_articles',
    'cities','countries','unified_tags','marketplace_listings',
    'community_groups','hotels','queer_villages'
  ];
  v_sql TEXT;
  v_value TEXT;
BEGIN
  SELECT * INTO v_change FROM public.content_changes
    WHERE id = p_change_id AND status = 'applied'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change % not found or not applied', p_change_id;
  END IF;

  IF NOT v_change.content_type = ANY(v_allowed_tables) THEN
    RAISE EXCEPTION 'Invalid content_type: %', v_change.content_type;
  END IF;

  IF v_change.change_type = 'flag' THEN
    UPDATE public.content_changes
    SET status = 'reverted', reverted_at = now()
    WHERE id = p_change_id;
    RETURN TRUE;
  END IF;

  v_value := v_change.old_value #>> '{}';

  v_sql := format(
    'UPDATE %I SET %I = $1 WHERE id = $2',
    v_change.content_type,
    v_change.field_name
  );

  EXECUTE v_sql USING v_value, v_change.content_id;

  UPDATE public.content_changes
  SET status = 'reverted', reverted_at = now()
  WHERE id = p_change_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'revert_content_change failed for %: %', p_change_id, SQLERRM;
  RETURN FALSE;
END;
$$;

-- Bulk apply multiple changes
CREATE OR REPLACE FUNCTION public.bulk_apply_content_changes(p_change_ids UUID[])
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_applied INT := 0;
  v_id UUID;
BEGIN
  FOREACH v_id IN ARRAY p_change_ids LOOP
    BEGIN
      IF public.apply_content_change(v_id) THEN
        v_applied := v_applied + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'bulk_apply skipped %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_applied;
END;
$$;

-- Increment module counters (called from edge functions)
CREATE OR REPLACE FUNCTION public.increment_automation_counters(
  p_module_id UUID,
  p_runs INT DEFAULT 1,
  p_proposed INT DEFAULT 0,
  p_applied INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.automation_modules
  SET
    total_runs = total_runs + p_runs,
    total_changes_proposed = total_changes_proposed + p_proposed,
    total_changes_applied = total_changes_applied + p_applied,
    updated_at = now()
  WHERE id = p_module_id;
END;
$$;

-- Get automation health stats
CREATE OR REPLACE FUNCTION public.get_automation_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pending_count', (SELECT count(*) FROM public.content_changes WHERE status = 'pending'),
    'auto_approved_24h', (SELECT count(*) FROM public.content_changes WHERE status IN ('auto_approved','applied') AND created_at > now() - interval '24 hours'),
    'rejected_24h', (SELECT count(*) FROM public.content_changes WHERE status = 'rejected' AND created_at > now() - interval '24 hours'),
    'applied_24h', (SELECT count(*) FROM public.content_changes WHERE status = 'applied' AND created_at > now() - interval '24 hours'),
    'errors_24h', (SELECT coalesce(sum(errors), 0) FROM public.automation_run_log WHERE created_at > now() - interval '24 hours'),
    'modules', (
      SELECT jsonb_agg(jsonb_build_object(
        'slug', m.slug,
        'display_name', m.display_name,
        'is_enabled', m.is_enabled,
        'last_run_at', m.last_run_at,
        'last_run_status', m.last_run_status,
        'total_runs', m.total_runs,
        'pending', (SELECT count(*) FROM public.content_changes cc WHERE cc.module_id = m.id AND cc.status = 'pending')
      ))
      FROM public.automation_modules m
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
