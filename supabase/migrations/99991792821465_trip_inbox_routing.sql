-- Only server-provisioned, confirmed routes may be advertised by the app.
ALTER TABLE public.trip_inboxes
  ADD COLUMN routing_status text NOT NULL DEFAULT 'pending'
    CHECK (routing_status IN ('pending', 'ready', 'failed', 'revoked')),
  ADD COLUMN routing_rule_id text;
UPDATE public.trip_inboxes SET routing_status = 'revoked' WHERE revoked_at IS NOT NULL;
CREATE UNIQUE INDEX trip_inboxes_one_active_per_trip
  ON public.trip_inboxes(trip_id) WHERE revoked_at IS NULL;

-- All address lifecycle mutations now go through trip-inbox-manage, which
-- authenticates the caller, checks can_edit_trip, and provisions Cloudflare.
DROP POLICY IF EXISTS trip_inboxes_insert ON public.trip_inboxes;
DROP POLICY IF EXISTS trip_inboxes_update ON public.trip_inboxes;
DROP POLICY IF EXISTS trip_inboxes_delete ON public.trip_inboxes;
REVOKE INSERT, UPDATE, DELETE ON public.trip_inboxes FROM anon, authenticated;
