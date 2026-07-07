-- Schema for the ntfy-based replacement of Web Push (VAPID) end-user
-- notifications. Additive only — push_subscriptions/push-dispatcher
-- stay in place until the ntfy-dispatcher/ntfy-provision edge
-- functions exist and the VPS-hosted ntfy server (infra/ntfy/) is
-- live; see the cutover phases in the approved plan.

CREATE TABLE IF NOT EXISTS public.ntfy_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  ntfy_username text NOT NULL,
  -- ntfy-issued access token. Secret — never client-writable (see the
  -- lack of insert/update/delete policies below); only ntfy-provision/
  -- ntfy-revoke (service_role) write this column.
  access_token text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  -- Unlike Web Push's 404/410-on-dead-endpoint signal, ntfy topics
  -- never expire — publishing to an unsubscribed topic still returns
  -- 200. A 401/403 (revoked token/ACL) is the only reliable "this
  -- subscription is stale" signal, tracked here instead.
  failure_count int NOT NULL DEFAULT 0,
  last_failure_at timestamptz
);

-- One row per user: ntfy fans out to every device subscribed to the
-- topic server-side, so (unlike push_subscriptions, one row per
-- browser/device endpoint) there's no per-device row to track here.
CREATE UNIQUE INDEX IF NOT EXISTS ntfy_subscriptions_user_uniq
  ON public.ntfy_subscriptions (user_id);

ALTER TABLE public.ntfy_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ntfy_subscriptions_select_own" ON public.ntfy_subscriptions;
CREATE POLICY "ntfy_subscriptions_select_own"
  ON public.ntfy_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users:
-- access_token must never be client-forgeable. All writes go through
-- ntfy-provision/ntfy-revoke (service_role, bypasses RLS).

-- NOTE: push_sent stays as-is here, NOT renamed. push_next_item_candidates()
-- and push_doc_expiry_candidates() (20260418010000_push_subscriptions.sql)
-- reference it by literal name in their SQL bodies — renaming it now would
-- break today's live Web Push reminders before ntfy-dispatcher exists to
-- replace them. The push_sent -> notification_sent rename (cosmetic only;
-- schema is already delivery-mechanism-agnostic) belongs in the Phase 2
-- sunset migration, alongside updating those two functions and
-- push-dispatcher/claim_dm_push_batch in the same transaction.
