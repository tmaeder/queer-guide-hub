-- Trip & Event Notifications
-- Mirrors trip nudges (warning/critical) into the notifications inbox so users
-- see them without opening the trip workspace. Also adds event_reminder
-- notifications for saved events starting in 1-3 days.

-- 1. Extend the notifications type check to allow new types
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY(ARRAY['message','event','system','trip_nudge','event_reminder'])
  );

-- 2. Unique partial index on metadata->>'nudge_dedupe_key' for idempotent inserts
CREATE UNIQUE INDEX IF NOT EXISTS notifications_nudge_dedupe_idx
  ON notifications(user_id, (metadata->>'nudge_dedupe_key'))
  WHERE metadata->>'nudge_dedupe_key' IS NOT NULL;

-- 3. SQL function: insert event reminder notifications for saved events
--    starting in 1-3 days. Called by pg_cron daily. Idempotent.
CREATE OR REPLACE FUNCTION public.insert_event_reminder_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO notifications(user_id, type, title, content, action_url, metadata)
  SELECT
    ef.user_id,
    'event_reminder',
    e.title,
    'Event you saved starts ' || CASE
      WHEN e.start_date::date = CURRENT_DATE + 1 THEN 'tomorrow'
      WHEN e.start_date::date = CURRENT_DATE + 2 THEN 'in 2 days'
      ELSE 'in 3 days'
    END || '.',
    '/events/' || e.id::text,
    jsonb_build_object(
      'nudge_dedupe_key', 'event_reminder:' || e.id::text || ':' || ef.user_id::text || ':' || e.start_date::date::text,
      'event_id', e.id,
      'event_title', e.title,
      'starts_at', e.start_date
    )
  FROM event_favorites ef
  JOIN events e ON e.id = ef.event_id
  WHERE
    e.start_date::date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 3
    AND e.status = 'active'
  ON CONFLICT (user_id, (metadata->>'nudge_dedupe_key'))
  WHERE metadata->>'nudge_dedupe_key' IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4. Register the event reminder cron (daily at 08:00 UTC)
SELECT cron.schedule(
  'event_reminder_notifications',
  '0 8 * * *',
  $$SELECT public.insert_event_reminder_notifications()$$
);
