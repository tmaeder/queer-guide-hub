-- =============================================================================
-- Web push subscriptions + cron dispatchers for Today-mode reminders.
--
-- Two reminder types (keep the scope small):
--   A. `next_item` — 30 min before the next reservation on an active trip.
--   B. `doc_expiry` — 30 days + 7 days before a trip_documents.expiry_date.
--
-- Deliverability: the dispatcher edge function swallows 410/404 responses
-- (endpoint retired) by deleting the stale subscription row. VAPID keys
-- live in function secrets (VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_uniq
  ON public.push_subscriptions (user_id, endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users CRUD their own rows.
CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_insert_own"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_update_own"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role reads all rows for dispatch (no explicit policy needed —
-- service_role bypasses RLS by default).

-- -----------------------------------------------------------------------------
-- De-dupe log: one row per (user, kind, ref, day). Prevents firing twice
-- for the same reservation or document on the same day if cron re-runs.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('next_item', 'doc_expiry')),
  ref_id uuid NOT NULL,
  day_bucket date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_sent_uniq
  ON public.push_sent (user_id, kind, ref_id, day_bucket);

ALTER TABLE public.push_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_sent_select_own"
  ON public.push_sent FOR SELECT
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Helper RPC: returns reservations that start in the next 25–35 min and
-- haven't already triggered a push today. Called by the cron job.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_next_item_candidates()
RETURNS TABLE (
  reservation_id uuid,
  user_id uuid,
  trip_id uuid,
  title text,
  start_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.user_id, r.trip_id, r.title, r.start_at
  FROM public.reservations r
  WHERE r.start_at BETWEEN now() + interval '25 minutes' AND now() + interval '35 minutes'
    AND r.status IN ('pending', 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.push_sent s
      WHERE s.user_id = r.user_id
        AND s.kind = 'next_item'
        AND s.ref_id = r.id
        AND s.day_bucket = current_date
    );
$$;

-- -----------------------------------------------------------------------------
-- Helper RPC: returns trip_documents whose expiry is 30 or 7 days out and
-- haven't already triggered a push today.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_doc_expiry_candidates()
RETURNS TABLE (
  document_id uuid,
  user_id uuid,
  doc_type text,
  title text,
  days_out int,
  expiry_date date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.user_id, d.doc_type, d.title,
         (d.expiry_date - current_date)::int AS days_out,
         d.expiry_date
  FROM public.trip_documents d
  WHERE d.expiry_date IS NOT NULL
    AND (d.expiry_date - current_date) IN (30, 7)
    AND NOT EXISTS (
      SELECT 1 FROM public.push_sent s
      WHERE s.user_id = d.user_id
        AND s.kind = 'doc_expiry'
        AND s.ref_id = d.id
        AND s.day_bucket = current_date
    );
$$;

GRANT EXECUTE ON FUNCTION public.push_next_item_candidates() TO service_role;
GRANT EXECUTE ON FUNCTION public.push_doc_expiry_candidates() TO service_role;

-- -----------------------------------------------------------------------------
-- Cron: next-item reminder every 5 min (minute :02 offset to avoid :00
-- thundering-herd).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('push-next-item')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-next-item');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'push-next-item',
  '2-59/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/push-dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := '{"kind": "next_item"}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);

-- -----------------------------------------------------------------------------
-- Cron: document expiry once daily at 09:03 UTC (7am Berlin summer-ish —
-- close enough for a daily digest; users who want exact local time can
-- negotiate the windowing later).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('push-doc-expiry')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-doc-expiry');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'push-doc-expiry',
  '3 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/push-dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
    body := '{"kind": "doc_expiry"}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);
