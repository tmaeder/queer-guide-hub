-- Auto-watch import: refresh-watched-urls now re-scans changed sites and stages
-- the new items as the watch owner. Track import activity on the row and allow
-- the 'watch_import' notification type.

ALTER TABLE public.watched_urls
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.watched_urls.imported_count IS
  'Cumulative count of community_submissions auto-created from changes to this watched URL.';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['message','event','system','trip_nudge','event_reminder','watch_import']));
