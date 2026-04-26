-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — cms_ai_cache: keyed AI response cache for cms-ai edge function.
-- Cache lifetime is implicit via the source hash inside cache_key.
-- DRAFT — review and apply via Supabase CLI when ready.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cms_ai_cache (
  cache_key TEXT PRIMARY KEY,
  op TEXT NOT NULL,
  content_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  output JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cms_ai_cache_op_type_idx
  ON public.cms_ai_cache (op, content_type, record_id);

CREATE INDEX IF NOT EXISTS cms_ai_cache_created_at_idx
  ON public.cms_ai_cache (created_at);

ALTER TABLE public.cms_ai_cache ENABLE ROW LEVEL SECURITY;

-- Service role only; admin UI fetches AI results via the edge function not directly.
CREATE POLICY cms_ai_cache_service_role_all
  ON public.cms_ai_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.cms_ai_cache IS
  'Cache of cms-ai edge function outputs keyed by (op, content_type, record_id, locale, source_hash). Sweep entries older than 30 days via cron if growth becomes a concern.';
