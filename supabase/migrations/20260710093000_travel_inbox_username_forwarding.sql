-- Travel Inbox via username email forwarding.
--
-- Users forward booking-confirmation emails to `{username}@queer.guide`. A
-- Cloudflare Email Worker (workers/travel-inbox) resolves the username to a
-- user, parses the email via Workers AI, encrypts the raw body, and inserts a
-- `travel_inbox_items` row (status='pending'). It then calls
-- `travel_inbox_post_item()` which drops a rich itinerary-card message into the
-- user's dedicated "Travel Inbox" conversation, surfaced natively in
-- /hub/messages. Nothing auto-commits — a guessable address demands a human
-- approval gate, so the card lands as 'pending' with Approve / Reject actions.

-- ----------------------------------------------------------------------------
-- 1. Allow the new 'itinerary' chat-card message type.
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'text','image','file','system','gif','sticker','voice',
    'entity_share','submission','itinerary'
  ]));

-- ----------------------------------------------------------------------------
-- 2. Tag a conversation as a system "Travel Inbox" thread (one per user).
--    get_inbox_feed ignores this column; it just lets us find/create the
--    thread idempotently without string-matching the title.
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS system_kind text;
CREATE INDEX IF NOT EXISTS conversations_system_kind_idx
  ON public.conversations (system_kind) WHERE system_kind IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Reserve live role mailboxes so no user can own an address that is also a
--    system mailbox (submit/press/feedback/contact/… already reserved).
-- ----------------------------------------------------------------------------
INSERT INTO public.reserved_usernames (name, reason) VALUES
  ('tip','route'),('bug','route'),('info','route'),('hello','route'),('mail','route')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Resolve an inbound local-part → user_id (service-role only, used by the
--    worker). Matches exact username first, then the lookalike collision key.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_id_for_username(p_text text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id
  FROM public.profiles p
  WHERE p.username = lower(p_text)
     OR p.username_key = lower(replace(replace(p_text, '.', ''), '_', ''))
  ORDER BY (p.username = lower(p_text)) DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.user_id_for_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_id_for_username(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. travel_inbox_items — per-user, approval-gated parsed bookings.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.travel_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_subject text,
  raw_from text,
  raw_body_encrypted bytea,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','slotted','failed')),
  parse_confidence numeric,
  parsed_type text
    CHECK (parsed_type IS NULL OR parsed_type IN (
      'lodging','flight','rail','restaurant','activity','unknown'
    )),
  parsed_vendor text,
  parsed_title text,
  parsed_start_at timestamptz,
  parsed_end_at timestamptz,
  parsed_location text,
  parsed_price numeric,
  parsed_currency text,
  parsed_confirmation text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  slotted_reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_inbox_items_user_status_idx
  ON public.travel_inbox_items (user_id, status);

ALTER TABLE public.travel_inbox_items ENABLE ROW LEVEL SECURITY;

-- Owner may read + update their own items (status changes also flow through the
-- SECURITY DEFINER RPC below). Inserts come from the worker via service role.
DROP POLICY IF EXISTS travel_inbox_items_select ON public.travel_inbox_items;
DROP POLICY IF EXISTS travel_inbox_items_update ON public.travel_inbox_items;
CREATE POLICY travel_inbox_items_select ON public.travel_inbox_items
  FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY travel_inbox_items_update ON public.travel_inbox_items
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 6. Post a parsed item as an itinerary card in the user's Travel Inbox
--    conversation (service-role only; called by the worker).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.travel_inbox_post_item(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.travel_inbox_items;
  v_conv uuid;
  v_msg uuid;
  v_content text;
  v_meta jsonb;
BEGIN
  SELECT * INTO v FROM public.travel_inbox_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'travel_inbox_item % not found', p_item_id;
  END IF;

  -- Find (or lazily create) the user's dedicated Travel Inbox thread.
  SELECT c.id INTO v_conv
  FROM public.conversations c
  JOIN public.conversation_participants cp
    ON cp.conversation_id = c.id AND cp.user_id = v.user_id
  WHERE c.system_kind = 'travel_inbox'
  LIMIT 1;

  IF v_conv IS NULL THEN
    INSERT INTO public.conversations (conversation_type, title, system_kind, participants_count)
    VALUES ('direct', 'Travel Inbox', 'travel_inbox', 1)
    RETURNING id INTO v_conv;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv, v.user_id);
  END IF;

  v_content := COALESCE(v.parsed_title, v.raw_subject, 'Forwarded booking');
  v_meta := jsonb_build_object(
    'kind', 'itinerary',
    'item_id', v.id,
    'status', v.status,
    'booking_type', v.parsed_type,
    'vendor', v.parsed_vendor,
    'title', v.parsed_title,
    'start', v.parsed_start_at,
    'end', v.parsed_end_at,
    'location', v.parsed_location,
    'price', v.parsed_price,
    'currency', v.parsed_currency,
    'confirmation', v.parsed_confirmation
  );

  INSERT INTO public.messages (conversation_id, sender_id, content, message_type, metadata)
  VALUES (v_conv, v.user_id, v_content, 'itinerary', v_meta)
  RETURNING id INTO v_msg;

  UPDATE public.conversations
     SET last_message_id = v_msg, last_message_at = now(), updated_at = now()
   WHERE id = v_conv;

  UPDATE public.travel_inbox_items SET message_id = v_msg WHERE id = p_item_id;

  RETURN v_msg;
END $$;
REVOKE ALL ON FUNCTION public.travel_inbox_post_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.travel_inbox_post_item(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. Approve / reject a pending item (owner only). Patches the linked card's
--    metadata.status so the message re-renders live via realtime.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_travel_inbox_item_status(p_item uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_msg uuid;
BEGIN
  IF p_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid status %', p_status;
  END IF;

  SELECT user_id, message_id INTO v_owner, v_msg
  FROM public.travel_inbox_items WHERE id = p_item;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'travel_inbox_item % not found', p_item;
  END IF;
  IF v_owner <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.travel_inbox_items SET status = p_status WHERE id = p_item;

  IF v_msg IS NOT NULL THEN
    UPDATE public.messages
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', to_jsonb(p_status)),
           updated_at = now()
     WHERE id = v_msg;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_travel_inbox_item_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_travel_inbox_item_status(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Privacy cleanup — purge encrypted raw bodies 30 days after arrival.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_travel_inbox_raw_bodies()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  WITH purged AS (
    UPDATE public.travel_inbox_items
       SET raw_body_encrypted = NULL
     WHERE raw_body_encrypted IS NOT NULL
       AND created_at < (now() - interval '30 days')
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM purged;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.purge_travel_inbox_raw_bodies() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-travel-inbox-raw-bodies',
      '23 3 * * *',
      $cron$SELECT public.purge_travel_inbox_raw_bodies();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;
