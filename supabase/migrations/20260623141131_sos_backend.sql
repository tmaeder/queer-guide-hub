-- People-layer rethink — Phase 6: real SOS backend.
-- Replaces the client-only useSOS (bypassable localStorage cooldown, raw
-- notification inserts) with a durable alert record + server-enforced cooldown +
-- trusted-contacts (falling back to all accepted friends). type='sos' is already
-- in the notifications allowlist (Phase 1). Recipients are resolved server-side;
-- the client cannot target arbitrary users.

CREATE TABLE IF NOT EXISTS public.sos_trusted_contacts (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  lat         double precision,
  lng         double precision,
  accuracy    double precision,
  message     text,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS sos_alerts_sender_idx ON public.sos_alerts (sender_id, created_at DESC);

ALTER TABLE public.sos_trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stc_self ON public.sos_trusted_contacts;
CREATE POLICY stc_self ON public.sos_trusted_contacts
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Sender and any current recipient (trusted contact or accepted friend) can read
-- an alert; only the sender can resolve it. Inserts go through send_sos (definer)
-- only — no INSERT policy.
DROP POLICY IF EXISTS sos_alerts_select ON public.sos_alerts;
CREATE POLICY sos_alerts_select ON public.sos_alerts
  FOR SELECT TO authenticated
  USING (
    sender_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.sos_trusted_contacts tc
               WHERE tc.user_id = sender_id AND tc.contact_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.user_relationships r
               WHERE r.relationship_type = 'friend' AND r.status = 'accepted'
                 AND ((r.user_id = sender_id AND r.target_user_id = (select auth.uid()))
                   OR (r.user_id = (select auth.uid()) AND r.target_user_id = sender_id)))
  );
DROP POLICY IF EXISTS sos_alerts_resolve ON public.sos_alerts;
CREATE POLICY sos_alerts_resolve ON public.sos_alerts
  FOR UPDATE TO authenticated
  USING (sender_id = (select auth.uid())) WITH CHECK (sender_id = (select auth.uid()));

REVOKE ALL ON public.sos_trusted_contacts FROM anon;
REVOKE ALL ON public.sos_alerts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sos_trusted_contacts TO authenticated;
GRANT SELECT, UPDATE ON public.sos_alerts TO authenticated;

CREATE OR REPLACE FUNCTION public.send_sos(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_accuracy double precision DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS TABLE(alert_id uuid, recipients int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_alert uuid;
  v_recipients uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  -- Server-enforced cooldown (5 min) — not bypassable from the client.
  IF EXISTS (SELECT 1 FROM public.sos_alerts
             WHERE sender_id = v_uid AND created_at > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'sos_cooldown';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE user_id = v_uid;

  -- Trusted contacts if chosen, else all accepted friends.
  SELECT array_agg(DISTINCT contact_id) INTO v_recipients
  FROM public.sos_trusted_contacts WHERE user_id = v_uid;

  IF v_recipients IS NULL THEN
    SELECT array_agg(DISTINCT fid) INTO v_recipients FROM (
      SELECT target_user_id fid FROM public.user_relationships
        WHERE user_id = v_uid AND relationship_type = 'friend' AND status = 'accepted'
      UNION
      SELECT user_id FROM public.user_relationships
        WHERE target_user_id = v_uid AND relationship_type = 'friend' AND status = 'accepted'
    ) f;
  END IF;

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'sos_no_recipients';
  END IF;

  INSERT INTO public.sos_alerts (sender_id, lat, lng, accuracy, message)
  VALUES (v_uid, p_lat, p_lng, p_accuracy, p_message)
  RETURNING id INTO v_alert;

  INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, read, metadata)
  SELECT r, 'sos',
         COALESCE(v_name, 'Someone') || ' needs help',
         CASE WHEN p_lat IS NOT NULL THEN 'Sent an SOS with their location.' ELSE 'Sent an SOS.' END,
         '/user/' || v_uid::text, v_alert, false,
         jsonb_build_object('sos', true, 'sender_id', v_uid, 'alert_id', v_alert, 'lat', p_lat, 'lng', p_lng)
  FROM unnest(v_recipients) r;

  RETURN QUERY SELECT v_alert, array_length(v_recipients, 1);
END $$;

REVOKE ALL ON FUNCTION public.send_sos(double precision, double precision, double precision, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_sos(double precision, double precision, double precision, text) TO authenticated;
