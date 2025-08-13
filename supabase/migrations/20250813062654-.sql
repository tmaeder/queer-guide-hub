-- Events: add is_public flag and tighten public read via flag + view
DO $$
BEGIN
  -- Add is_public column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='events' AND column_name='is_public'
  ) THEN
    EXECUTE 'ALTER TABLE public.events ADD COLUMN is_public boolean NOT NULL DEFAULT true';
  END IF;

  -- Drop overly permissive public read policies
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Public read access for events" ON public.events';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Events are viewable by authenticated users" ON public.events';
  EXCEPTION WHEN others THEN NULL; END;

  -- Ensure owner can always read their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='Events read own'
  ) THEN
    EXECUTE 'CREATE POLICY "Events read own" ON public.events FOR SELECT USING ((SELECT auth.uid()) = created_by)';
  END IF;

  -- Public can read only active, explicitly public events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='Public can view public events'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can view public events" ON public.events FOR SELECT USING (is_public = true AND status = ''active'')';
  END IF;

  -- Create a safe public view of events
  BEGIN
    EXECUTE 'DROP VIEW IF EXISTS public.events_public';
  EXCEPTION WHEN others THEN NULL; END;

  EXECUTE $$
    CREATE VIEW public.events_public AS
    SELECT 
      id, title, description, start_date, end_date,
      venue_id, venue_name, address, city, state, country,
      latitude, longitude,
      price_min, price_max, is_free,
      images, age_restriction, ticket_url, website,
      created_at, updated_at
    FROM public.events
    WHERE is_public = true AND status = ''active''
  $$;

  -- Ensure invoker semantics and grants on the view
  BEGIN
    EXECUTE 'ALTER VIEW public.events_public SET (security_invoker = on)';
  EXCEPTION WHEN others THEN NULL; END;
  EXECUTE 'GRANT SELECT ON public.events_public TO anon, authenticated';
END$$;

-- Storage tightening for user photos
DO $$
BEGIN
  -- Remove open read policy on storage.objects for user-photos bucket
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view user photos" ON storage.objects';
  EXCEPTION WHEN others THEN NULL; END;

  -- Create owner/admin read policy mapping to user_photos metadata
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Read user-photos if owner or admin'
  ) THEN
    EXECUTE $$
      CREATE POLICY "Read user-photos if owner or admin"
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'user-photos' AND EXISTS (
          SELECT 1 FROM public.user_photos p
          WHERE p.storage_path = storage.objects.name
            AND (p.user_id = (SELECT auth.uid()) OR has_role((SELECT auth.uid()), 'admin'::public.app_role))
        )
      )
    $$;
  END IF;
END$$;