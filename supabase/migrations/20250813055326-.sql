-- Harden sensitive data exposure across key tables
-- 1) Profiles: remove table-level public read and restrict view to authenticated only
DO $$
BEGIN
  -- Drop any policy that exposes rows based on privacy_settings
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Public can view public profiles only" ON public.profiles';
  EXCEPTION WHEN others THEN NULL; END;

  -- Ensure only owners/admins can read/update profiles at the table level (policies already exist elsewhere)
  -- Ensure anon cannot select directly from table, rely on RLS + explicit grants
  BEGIN
    EXECUTE 'REVOKE ALL ON TABLE public.profiles FROM anon';
  EXCEPTION WHEN others THEN NULL; END;

  -- profiles_public should be readable only by authenticated users
  BEGIN
    EXECUTE 'REVOKE ALL ON public.profiles_public FROM anon';
    EXECUTE 'GRANT SELECT ON public.profiles_public TO authenticated';
  EXCEPTION WHEN others THEN NULL; END;

  -- If a legacy public_profiles view exists (includes sensitive columns), lock it down
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'public_profiles'
  ) THEN
    BEGIN
      EXECUTE 'REVOKE ALL ON public.public_profiles FROM anon, authenticated';
      -- Optional: convert to invoker for safety
      BEGIN
        EXECUTE 'ALTER VIEW public.public_profiles SET (security_invoker = on)';
      EXCEPTION WHEN others THEN NULL; END;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
END$$;

-- 2) Venue check-ins: restrict read access to owner only
DO $$
BEGIN
  -- Remove broad read policies
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view all checkins" ON public.venue_checkins';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Check-ins are viewable by authenticated users" ON public.venue_checkins';
  EXCEPTION WHEN others THEN NULL; END;

  -- Ensure strict owner-scoped policies
  BEGIN
    EXECUTE $$CREATE POLICY IF NOT EXISTS "checkins read own"
      ON public.venue_checkins FOR SELECT USING (auth.uid() = user_id)$$;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    EXECUTE $$CREATE POLICY IF NOT EXISTS "checkins update own"
      ON public.venue_checkins FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)$$;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    EXECUTE $$CREATE POLICY IF NOT EXISTS "checkins delete own"
      ON public.venue_checkins FOR DELETE USING (auth.uid() = user_id)$$;
  EXCEPTION WHEN others THEN NULL; END;
END$$;

-- 3) Bookings: ensure anon has no privileges; owners-only enforced by RLS policies already present
DO $$
BEGIN
  BEGIN
    EXECUTE 'REVOKE ALL ON TABLE public.bookings FROM anon';
  EXCEPTION WHEN others THEN NULL; END;

  -- Optionally allow admins full access (if needed for support ops)
  BEGIN
    EXECUTE $$CREATE POLICY IF NOT EXISTS "admins manage bookings"
      ON public.bookings FOR ALL
      USING (has_role((select auth.uid()), 'admin'::public.app_role))
      WITH CHECK (has_role((select auth.uid()), 'admin'::public.app_role))$$;
  EXCEPTION WHEN others THEN NULL; END;
END$$;

-- 4) Group memberships already private to members; no change needed. Messages are participants-only; no change needed.
