-- Repair drift: chatgpt_oauth_tokens missing on prod.
-- Source migration 20260226200000 is recorded applied but the table doesn't
-- exist (same history-drift class as venue_consensus_audit). The admin
-- "Connect ChatGPT" screen (useChatGPTConnection) + chatgpt-oauth edge function
-- read/write it, so the feature is silently broken. Standalone additive table,
-- zero blast radius (no triggers/backfill/realtime). Recreates it verbatim.

CREATE TABLE IF NOT EXISTS public.chatgpt_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT NOT NULL DEFAULT 'bearer',
  expires_at TIMESTAMPTZ,
  scope TEXT,
  openai_organization_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_active
  ON public.chatgpt_oauth_tokens (is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatgpt_oauth_single_active
  ON public.chatgpt_oauth_tokens (is_active) WHERE is_active = true;

ALTER TABLE public.chatgpt_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chatgpt_oauth_admin_only" ON public.chatgpt_oauth_tokens;
CREATE POLICY "chatgpt_oauth_admin_only" ON public.chatgpt_oauth_tokens
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

DROP POLICY IF EXISTS "chatgpt_oauth_service_role" ON public.chatgpt_oauth_tokens;
CREATE POLICY "chatgpt_oauth_service_role" ON public.chatgpt_oauth_tokens
  FOR ALL USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
