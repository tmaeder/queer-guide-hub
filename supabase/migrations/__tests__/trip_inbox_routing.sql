-- Run after the routing migration. Checks no direct client mutation remains.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.trip_inboxes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.trip_inboxes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.trip_inboxes', 'DELETE')
     OR has_table_privilege('anon', 'public.trip_inboxes', 'INSERT') THEN
    RAISE EXCEPTION 'Trip inbox mutation must be server-only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='trip_inboxes_one_active_per_trip') THEN
    RAISE EXCEPTION 'Missing concurrent-enable guard';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trip_inboxes' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'Unexpected inbox write policy';
  END IF;
END $$;
ROLLBACK;
