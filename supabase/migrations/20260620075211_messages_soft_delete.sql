-- Phase 1c: soft-delete for messages (preserves reply integrity) + immutability guard.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Defense-in-depth: on UPDATE, pin identity/ownership columns and stamp updated_at.
-- Only content/edited_at/deleted_at/metadata/attachments are meant to change.
CREATE OR REPLACE FUNCTION public.messages_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.sender_id := OLD.sender_id;
  NEW.conversation_id := OLD.conversation_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_messages_guard_update ON public.messages;
CREATE TRIGGER trg_messages_guard_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard_update();
