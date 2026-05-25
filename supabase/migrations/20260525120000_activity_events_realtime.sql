-- Phase 3a follow-up: add user_activity_events to the supabase_realtime
-- publication so /me + the activity strip can subscribe to live inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'user_activity_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_events;
  END IF;
END $$;
