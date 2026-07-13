-- Admin messages ("Postfach") — internal admin-to-admin messaging, ported from
-- the PHP tool's nachrichten. Deliberately SEPARATE from the user-facing DM
-- infra (conversations/messages, which powers /hub/messages) — this is a staff
-- back-office channel with threads, read state and drafts, optionally about a
-- specific personality.

CREATE TABLE IF NOT EXISTS public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text,
  body text NOT NULL,
  /** Root message id of the thread; a root row points at itself. */
  thread_id uuid,
  /** Optional subject-matter link. */
  personality_id uuid REFERENCES public.personalities(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_messages_recipient
  ON public.admin_messages (recipient_id, is_read)
  WHERE is_draft = false;
CREATE INDEX IF NOT EXISTS idx_admin_messages_thread
  ON public.admin_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_messages_sender
  ON public.admin_messages (sender_id, created_at DESC);

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- A message is visible to its sender and recipient only. Drafts are visible to
-- the sender alone (a draft's recipient must not see it yet).
DROP POLICY IF EXISTS "admin_messages_select" ON public.admin_messages;
CREATE POLICY "admin_messages_select" ON public.admin_messages
  FOR SELECT USING (
    sender_id = (select auth.uid())
    OR (recipient_id = (select auth.uid()) AND is_draft = false)
  );

-- Only staff may originate messages, and only as themselves.
DROP POLICY IF EXISTS "admin_messages_insert" ON public.admin_messages;
CREATE POLICY "admin_messages_insert" ON public.admin_messages
  FOR INSERT WITH CHECK (
    sender_id = (select auth.uid())
    AND (has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor'))
  );

-- Sender can edit/delete own drafts; recipient can update (mark read). Both
-- parties can delete their view.
DROP POLICY IF EXISTS "admin_messages_update" ON public.admin_messages;
CREATE POLICY "admin_messages_update" ON public.admin_messages
  FOR UPDATE USING (
    sender_id = (select auth.uid()) OR recipient_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "admin_messages_delete" ON public.admin_messages;
CREATE POLICY "admin_messages_delete" ON public.admin_messages
  FOR DELETE USING (
    sender_id = (select auth.uid()) OR recipient_id = (select auth.uid())
  );
