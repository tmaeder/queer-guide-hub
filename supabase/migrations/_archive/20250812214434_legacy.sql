-- 1) Create a text-keyed rate limiting table for generic identifiers (e.g., user IDs)
CREATE TABLE IF NOT EXISTS public.auth_rate_limit_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce RLS similar to auth_rate_limit (system managed only)
ALTER TABLE public.auth_rate_limit_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System manages rate limiting keys" ON public.auth_rate_limit_keys;
CREATE POLICY "System manages rate limiting keys"
ON public.auth_rate_limit_keys
AS RESTRICTIVE
FOR ALL
TO public
USING (false)
WITH CHECK (false);


-- 2) New function: rate limiting using a text key (not inet)
CREATE OR REPLACE FUNCTION public.check_rate_limit_key(
  identifier text,
  max_attempts integer DEFAULT 5,
  time_window_minutes integer DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  attempt_count INTEGER;
  time_cutoff TIMESTAMPTZ;
BEGIN
  time_cutoff := now() - (time_window_minutes || ' minutes')::interval;

  -- Clean old attempts
  DELETE FROM public.auth_rate_limit_keys
  WHERE last_attempt < time_cutoff;

  -- Check current attempts for this identifier
  SELECT COALESCE(SUM(attempt_count), 0) INTO attempt_count
  FROM public.auth_rate_limit_keys
  WHERE key = identifier
    AND last_attempt >= time_cutoff;

  IF attempt_count >= max_attempts THEN
    -- Log security event
    PERFORM public.log_enhanced_security_event(
      'RATE_LIMIT_EXCEEDED',
      auth.uid(),
      jsonb_build_object(
        'identifier', identifier,
        'attempts', attempt_count,
        'max_attempts', max_attempts,
        'timestamp', now()
      ),
      'high'
    );
    RETURN FALSE;
  END IF;

  -- Record this attempt
  INSERT INTO public.auth_rate_limit_keys (key, attempt_count)
  VALUES (identifier, 1)
  ON CONFLICT (key)
  DO UPDATE SET 
    attempt_count = auth_rate_limit_keys.attempt_count + 1,
    last_attempt = now();

  RETURN TRUE;
END;
$$;


-- 3) Replace validate_user_content to leverage text-keyed limiter instead of inet-only
CREATE OR REPLACE FUNCTION public.validate_user_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Content length validation
  IF NEW.content IS NOT NULL THEN
    IF length(NEW.content) > 10000 THEN
      RAISE EXCEPTION 'Content exceeds maximum length of 10000 characters';
    END IF;
    
    -- Basic XSS pattern detection
    IF NEW.content ~* '<script|javascript:|data:|vbscript:|on\\w+=' THEN
      PERFORM public.log_enhanced_security_event(
        'XSS_ATTEMPT_DETECTED',
        auth.uid(),
        jsonb_build_object(
          'content_preview', left(NEW.content, 100),
          'table', TG_TABLE_NAME,
          'timestamp', now()
        ),
        'high'
      );
      RAISE EXCEPTION 'Potentially malicious content detected';
    END IF;
    
    -- Rate limiting for content creation (keyed by user id when available)
    IF NOT public.check_rate_limit_key(coalesce(auth.uid()::text, 'anonymous'), 20, 60) THEN
      RAISE EXCEPTION 'Rate limit exceeded for content creation';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;


-- 4) Harden profiles RLS: owners + admins only; drop permissive/unknown policies
DO $$
DECLARE
  policy_name text;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    -- Enable and force RLS
    EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY';

    -- Drop any existing policies to avoid permissive overlaps
    FOR policy_name IN
      SELECT polname FROM pg_policy p
      JOIN pg_class c ON p.polrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relname = 'profiles'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_name);
    END LOOP;

    -- Owner policies
    EXECUTE $$
      CREATE POLICY "Profiles: owners can SELECT" ON public.profiles
      FOR SELECT USING (auth.uid() = user_id);
    $$;

    EXECUTE $$
      CREATE POLICY "Profiles: owners can UPDATE" ON public.profiles
      FOR UPDATE USING (auth.uid() = user_id);
    $$;

    EXECUTE $$
      CREATE POLICY "Profiles: owners can INSERT" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    $$;

    -- Admins can read all
    EXECUTE $$
      CREATE POLICY "Profiles: admins can SELECT all" ON public.profiles
      FOR SELECT USING (has_role((SELECT auth.uid()), 'admin'::app_role));
    $$;
  END IF;
END
$$;


-- 5) Ensure security_events.metadata column exists (used by log_enhanced_security_event)
DO $$
BEGIN
  IF to_regclass('public.security_events') IS NOT NULL THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.security_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT ''{}''::jsonb';
    EXCEPTION WHEN others THEN
      -- ignore if cannot alter
      NULL;
    END;
  END IF;
END
$$;


-- 6) Restrict EXECUTE on powerful maintenance functions from anon/authenticated roles
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'consolidate_rls_policies',
        'fix_rls_policies',
        'consolidate_policies',
        'examine_table_policies',
        'consolidate_table_policies',
        'add_rls_policy_indexes',
        'analyze_rls_policy_performance',
        'generate_optimized_rls_policy',
        'fix_table_rls_policies',
        'get_tables_with_multiple_permissive_policies',
        'get_table_policies'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, authenticated;', r.proname, r.args);
  END LOOP;
END
$$;