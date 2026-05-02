-- Apply profiles hardening (retry)
DO $$
BEGIN
  -- Remove public-read policy from profiles table
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Public can view public profiles only" ON public.profiles';
  EXCEPTION WHEN others THEN NULL; END;

  -- Ensure anon has no table privileges on profiles
  BEGIN
    EXECUTE 'REVOKE ALL ON TABLE public.profiles FROM anon';
  EXCEPTION WHEN others THEN NULL; END;

  -- Restrict profiles_public to authenticated users only
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='profiles_public'
  ) THEN
    BEGIN
      EXECUTE 'REVOKE ALL ON public.profiles_public FROM anon';
      EXECUTE 'GRANT SELECT ON public.profiles_public TO authenticated';
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  -- Lock down legacy public_profiles if it exists (no public access)
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='public_profiles'
  ) THEN
    BEGIN
      EXECUTE 'REVOKE ALL ON public.public_profiles FROM anon, authenticated';
      BEGIN
        EXECUTE 'ALTER VIEW public.public_profiles SET (security_invoker = on)';
      EXCEPTION WHEN others THEN NULL; END;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
END$$;