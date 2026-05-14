-- Tighten RLS for security events without breaking system inserts
DO $$
BEGIN
  -- Ensure table exists before applying
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='security_events'
  ) THEN
    -- Enable RLS and revoke broad privileges
    EXECUTE 'ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.security_events FROM anon, authenticated';

    -- Admins can view security events
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' AND tablename='security_events' AND policyname='Admins can view security events'
    ) THEN
      EXECUTE 'CREATE POLICY "Admins can view security events" ON public.security_events FOR SELECT USING (has_role((select auth.uid()), ''admin''::public.app_role))';
    END IF;

    -- Allow only internal definer roles to insert via SECURITY DEFINER functions
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' AND tablename='security_events' AND policyname='System can insert security events'
    ) THEN
      EXECUTE 'CREATE POLICY "System can insert security events" ON public.security_events FOR INSERT WITH CHECK (current_user IN (''postgres'',''supabase_admin''))';
    END IF;
  END IF;
END$$;