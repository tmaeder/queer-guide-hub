-- RLS-supporting indexes to minimize full-table scans on common policy predicates
-- All statements are safe via IF EXISTS checks or IF NOT EXISTS

-- user_photos.owner_id for owner-based policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_photos'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_photos' AND column_name = 'owner_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_user_photos_owner ON public.user_photos(owner_id);
  END IF;
END
$$;

-- events.created_by for creator ownership checks
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'created_by'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events(created_by);
  END IF;
END
$$;

-- events.is_public for public visibility filters
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'is_public'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_events_is_public ON public.events(is_public);
  END IF;
END
$$;

-- membership checks used in USING/WITH CHECK clauses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'group_memberships'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'group_memberships' AND column_name = 'user_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'group_memberships' AND column_name = 'group_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_group_memberships_user_group 
      ON public.group_memberships(user_id, group_id);
  END IF;
END
$$;

-- Optional: if a group_admins table exists, index (user_id, group_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'group_admins'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'group_admins' AND column_name = 'user_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'group_admins' AND column_name = 'group_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_group_admins_user_group 
      ON public.group_admins(user_id, group_id);
  END IF;
END
$$;