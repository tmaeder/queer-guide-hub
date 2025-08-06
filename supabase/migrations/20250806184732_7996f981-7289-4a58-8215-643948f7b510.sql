-- Enhanced Session Security and Authentication Monitoring (Simplified)

-- Create session timeout configuration
CREATE TABLE IF NOT EXISTS public.session_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeout_minutes integer NOT NULL DEFAULT 60,
  max_concurrent_sessions integer NOT NULL DEFAULT 3,
  require_reauthentication_minutes integer NOT NULL DEFAULT 1440,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.session_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.session_config (timeout_minutes, max_concurrent_sessions, require_reauthentication_minutes)
VALUES (60, 3, 1440)
ON CONFLICT DO NOTHING;

-- Create session tracking table
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token text NOT NULL UNIQUE,
  ip_address inet NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_activity timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour'),
  is_active boolean NOT NULL DEFAULT true,
  suspicious_activity boolean NOT NULL DEFAULT false,
  location_data jsonb DEFAULT '{}'
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Create failed login attempts tracking
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  ip_address inet NOT NULL,
  user_agent text,
  attempt_type text NOT NULL DEFAULT 'password',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  blocked_until timestamp with time zone
);

ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;