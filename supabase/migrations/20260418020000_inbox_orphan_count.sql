-- =============================================================================
-- Header badge for orphan reservations.
--
-- The Inbox page already runs `suggestTripGroupings` client-side; a user
-- who never visits the page never learns that three orphan reservations
-- cover the same dates. This view drives a numeric badge in the header
-- user menu — a cheap forcing function without notifications.
--
-- `security_invoker = on` makes the view obey RLS as the querying user,
-- so plain `auth.uid() = user_id` on `reservations` is sufficient and
-- no extra policy is needed on the view.
-- =============================================================================

CREATE OR REPLACE VIEW public.inbox_orphan_count_v
WITH (security_invoker = on)
AS
SELECT
  user_id,
  COUNT(*)::int AS orphan_count
FROM public.reservations
WHERE trip_id IS NULL
  AND status NOT IN ('cancelled', 'completed')
GROUP BY user_id;

GRANT SELECT ON public.inbox_orphan_count_v TO authenticated;

COMMENT ON VIEW public.inbox_orphan_count_v IS
  'Per-user count of orphan (unattached, open) reservations. Drives the Inbox badge in the header.';
