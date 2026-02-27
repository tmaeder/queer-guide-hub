-- ChatGPT OAuth token storage
-- Stores encrypted OAuth access/refresh tokens for OpenAI API access

CREATE TABLE IF NOT EXISTS public.chatgpt_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,          -- AES-GCM encrypted
  refresh_token TEXT,                  -- AES-GCM encrypted
  token_type TEXT NOT NULL DEFAULT 'bearer',
  expires_at TIMESTAMPTZ,
  scope TEXT,
  openai_organization_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Index for fast lookup of active tokens
CREATE INDEX idx_chatgpt_oauth_active ON public.chatgpt_oauth_tokens (is_active) WHERE is_active = true;

-- Only one active token at a time
CREATE UNIQUE INDEX idx_chatgpt_oauth_single_active ON public.chatgpt_oauth_tokens (is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.chatgpt_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "chatgpt_oauth_admin_only"
  ON public.chatgpt_oauth_tokens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- Service role bypass for edge functions
CREATE POLICY "chatgpt_oauth_service_role"
  ON public.chatgpt_oauth_tokens
  FOR ALL
  USING (auth.role() = 'service_role');
