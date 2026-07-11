-- Mailbox inbound email — unify booking forwarding with username@queer.guide.
--
-- The trip-inbox Cloudflare Email Worker now also receives `*@queer.guide`
-- (catch-all) and delivers to `mailbox_emails` (direction='inbound'). Booking
-- confirmations forwarded by the mailbox owner are parsed in the worker and
-- inserted as orphan reservations (trip_id NULL, source='inbox').
--
-- This migration:
--   1. Adds mailbox_emails to the realtime publication (the useMailbox
--      inbound subscription existed but never fired — table was missing).
--   2. Adds a threading lookup index (owner_id, message_id_header).
--   3. Adds retention: purge trash/spam after 30 days, strip body_html from
--      old inbound mail after 180 days (DB is disk-constrained).
--   4. Soft-deprecates the never-shipped trips+TOKEN forwarding scheme.

-- ----------------------------------------------------------------------------
-- 1. Realtime publication (idempotent).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'mailbox_emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mailbox_emails;
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 2. Threading lookup: inbound worker resolves In-Reply-To/References against
--    the owner's existing messages.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS mailbox_emails_owner_msgid_idx
  ON public.mailbox_emails (owner_id, message_id_header)
  WHERE message_id_header IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Retention. Hard-delete trash/spam after 30 days; NULL body_html on
--    inbound rows older than 180 days (body_text stays for search/replies).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_mailbox_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_stripped integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.mailbox_emails
     WHERE folder IN ('trash', 'spam')
       AND updated_at < now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  WITH stripped AS (
    UPDATE public.mailbox_emails
       SET body_html = NULL
     WHERE direction = 'inbound'
       AND body_html IS NOT NULL
       AND created_at < now() - interval '180 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_stripped FROM stripped;

  RETURN v_deleted + v_stripped;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_mailbox_emails() FROM public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-mailbox-emails',
      '41 3 * * *',
      $cron$SELECT public.purge_mailbox_emails();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4. Deprecate the trips+TOKEN@queer.guide scheme. It never shipped (no
--    worker ever consumed user_id_for_email_token) and the UI now points at
--    the user's own mailbox address. Hard drop in a later migration.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_or_create_email_token() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_email_token() FROM authenticated;
COMMENT ON TABLE public.user_email_tokens IS
  'DEPRECATED 2026-07 — trips+TOKEN forwarding scheme never shipped; superseded by inbound mailbox delivery (username@queer.guide). Drop after 2026-09.';
