-- Retry: create missing policies using catalog checks instead of IF NOT EXISTS

-- 2) Venue check-ins: strict owner-scoped read/update/delete
DO $$
DECLARE v_exists boolean;
BEGIN
  -- read own
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_checkins' AND policyname='checkins read own'
  ) INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE 'CREATE POLICY "checkins read own" ON public.venue_checkins FOR SELECT USING (auth.uid() = user_id)';
  END IF;

  -- update own
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_checkins' AND policyname='checkins update own'
  ) INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE 'CREATE POLICY "checkins update own" ON public.venue_checkins FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;

  -- delete own
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venue_checkins' AND policyname='checkins delete own'
  ) INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE 'CREATE POLICY "checkins delete own" ON public.venue_checkins FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END$$;

-- 3) Bookings: admin manage all (support staff)
DO $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='admins manage bookings'
  ) INTO v_exists;
  IF NOT v_exists THEN
    EXECUTE 'CREATE POLICY "admins manage bookings" ON public.bookings FOR ALL USING (has_role((select auth.uid()), ''admin''::public.app_role)) WITH CHECK (has_role((select auth.uid()), ''admin''::public.app_role))';
  END IF;
END$$;