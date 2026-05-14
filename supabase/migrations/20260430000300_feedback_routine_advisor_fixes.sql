-- Advisor follow-ups for the feedback routine schema:
--   1. Lock down _fb_log_event (internal helper; should not be PostgREST-exposed).
--   2. Pin search_path on the routine_runs touch trigger.
--   3. Add explicit deny-all policy on feedback_dispatch_counters so the
--      "RLS enabled but no policy" advisor stops complaining; the table is
--      only ever touched by SECURITY DEFINER RPCs.

REVOKE ALL ON FUNCTION _fb_log_event(uuid, text, jsonb, text, uuid, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION tg_feedback_routine_runs_touch() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS dispatch_counters_no_access ON feedback_dispatch_counters;
CREATE POLICY dispatch_counters_no_access ON feedback_dispatch_counters
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);
