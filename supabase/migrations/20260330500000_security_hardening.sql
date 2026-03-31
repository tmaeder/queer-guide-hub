-- ============================================================================
-- Security Hardening Migration
-- Fixes: C3 (permissive RLS), H3 (FORCE RLS on PII), H5 (search_path),
--        M5 (restrict automation SELECT)
-- ============================================================================

-- H3: FORCE ROW LEVEL SECURITY on PII-sensitive tables
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_passkeys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.donations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_photos FORCE ROW LEVEL SECURITY;

-- C3: Fix overly permissive INSERT policies — scope to service_role
DROP POLICY IF EXISTS "donations_system_insert" ON public.donations;
CREATE POLICY "donations_service_role_insert"
  ON public.donations FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert captcha verifications" ON public.captcha_verifications;
CREATE POLICY "captcha_verifications_service_role_insert"
  ON public.captcha_verifications FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert security events" ON public.security_events;
CREATE POLICY "security_events_service_role_insert"
  ON public.security_events FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can manage processing jobs" ON public.video_processing_jobs;
CREATE POLICY "video_processing_jobs_service_role_all"
  ON public.video_processing_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Video renditions are viewable by all" ON public.video_renditions;
CREATE POLICY "video_renditions_public_read"
  ON public.video_renditions FOR SELECT USING (true);
CREATE POLICY "video_renditions_service_role_write"
  ON public.video_renditions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- M5: Restrict automation table SELECT to admin
DROP POLICY IF EXISTS "automation_modules_select" ON public.automation_modules;
CREATE POLICY "automation_modules_admin_select"
  ON public.automation_modules FOR SELECT USING (public.has_role_jwt('admin'));

DROP POLICY IF EXISTS "automation_rules_select" ON public.automation_rules;
CREATE POLICY "automation_rules_admin_select"
  ON public.automation_rules FOR SELECT USING (public.has_role_jwt('admin'));

DROP POLICY IF EXISTS "content_flags_select" ON public.content_flags;
CREATE POLICY "content_flags_authenticated_select"
  ON public.content_flags FOR SELECT TO authenticated USING (true);

-- H5: Harden remaining SECURITY DEFINER functions missing search_path=''
DROP FUNCTION IF EXISTS public.assign_user_role(uuid, text);
CREATE FUNCTION public.assign_user_role(user_id uuid, role_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  ) INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (assign_user_role.user_id, assign_user_role.role_name)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_article_views(article_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.news_articles SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = increment_article_views.article_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_listing_views(listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.marketplace_listings SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = increment_listing_views.listing_id;
END;
$$;

-- Grant service_role bypass on FORCE RLS tables (edge functions need access)
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'profiles', 'user_sessions', 'user_passkeys',
      'conversations', 'messages', 'conversation_participants',
      'donations', 'user_relationships', 'user_photos'
    ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_service_role_all" ON public.%I', tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%s_service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl
    );
  END LOOP;
END;
$$;
