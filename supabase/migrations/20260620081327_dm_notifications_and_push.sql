-- Phase 2: DM in-app notifications + web-push queue + last-message maintenance.

-- Opt-in DM push preference
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dm_push_enabled boolean NOT NULL DEFAULT false;

-- Dedup index for one DM notification per (recipient, conversation)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dm_uniq
  ON public.notifications (user_id, related_id) WHERE type = 'dm';

-- Lightweight push queue (drained by cron → push-dispatcher). Service-role only.
CREATE TABLE IF NOT EXISTS public.dm_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  sender_name text,
  preview text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS dm_push_queue_pending ON public.dm_push_queue (queued_at)
  WHERE processed_at IS NULL;
ALTER TABLE public.dm_push_queue ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) touches this table.

-- Allow 'dm' kind in the push de-dupe log
ALTER TABLE public.push_sent DROP CONSTRAINT IF EXISTS push_sent_kind_check;
ALTER TABLE public.push_sent ADD CONSTRAINT push_sent_kind_check
  CHECK (kind IN ('next_item','doc_expiry','dm','dm_digest'));

-- AFTER INSERT on messages: maintain conversation last-message, create one
-- in-app notification per non-muted recipient, and enqueue a push.
CREATE OR REPLACE FUNCTION public.notify_on_direct_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender text;
  v_preview text;
BEGIN
  -- Keep the rail fresh (nothing else maintains these columns).
  UPDATE public.conversations
     SET last_message_id = NEW.id,
         last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.conversation_id;

  -- System messages never notify.
  IF COALESCE(NEW.message_type, 'text') = 'system' THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_sender FROM public.profiles WHERE user_id = NEW.sender_id;
  v_preview := CASE COALESCE(NEW.message_type, 'text')
    WHEN 'image' THEN '📷 Photo'
    WHEN 'gif' THEN 'GIF'
    WHEN 'sticker' THEN 'Sticker'
    WHEN 'voice' THEN '🎤 Voice message'
    ELSE left(COALESCE(NEW.content, ''), 140)
  END;

  -- In-app notifications (deduped per conversation)
  INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, read)
  SELECT cp.user_id, 'dm', COALESCE(v_sender, 'New message'), v_preview,
         '/messages?conversation=' || NEW.conversation_id::text,
         NEW.conversation_id, false
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
    AND COALESCE(cp.is_muted, false) = false
  ON CONFLICT (user_id, related_id) WHERE type = 'dm'
  DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title,
                action_url = EXCLUDED.action_url, read = false,
                created_at = now(), updated_at = now();

  -- Enqueue web push for the same recipients
  INSERT INTO public.dm_push_queue (recipient_id, conversation_id, sender_name, preview)
  SELECT cp.user_id, NEW.conversation_id, COALESCE(v_sender, 'New message'), v_preview
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
    AND COALESCE(cp.is_muted, false) = false;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_on_direct_message ON public.messages;
CREATE TRIGGER trg_notify_on_direct_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_direct_message();

-- Drain: atomically claim all pending rows (mark processed) and return the
-- collapsed, eligible set (push on, not in DND), latest per conversation.
CREATE OR REPLACE FUNCTION public.claim_dm_push_batch()
RETURNS TABLE (recipient_id uuid, conversation_id uuid, sender_name text, preview text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH pending AS (
    SELECT q.* FROM public.dm_push_queue q
    WHERE q.processed_at IS NULL
    FOR UPDATE SKIP LOCKED
  ),
  marked AS (
    UPDATE public.dm_push_queue SET processed_at = now()
    WHERE id IN (SELECT id FROM pending)
  )
  SELECT DISTINCT ON (p.recipient_id, p.conversation_id)
    p.recipient_id, p.conversation_id, p.sender_name, p.preview
  FROM pending p
  JOIN public.profiles pr ON pr.user_id = p.recipient_id
  WHERE pr.dm_push_enabled = true
    AND (pr.dnd_until IS NULL OR pr.dnd_until < now())
  ORDER BY p.recipient_id, p.conversation_id, p.queued_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_dm_push_batch() TO service_role;
