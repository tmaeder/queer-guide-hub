-- Milestone "merry-plotting-beacon" Phase 5 — Dating / cruising engine.
--
-- Adds:
--   * intimate_likes / intimate_passes       — actor decisions on targets
--   * intimate_matches (view)                — mutual likes, viewer-scoped
--   * intimate_cruising_mode                 — per-user opt-in flag + safety ack
--   * intimate_opening_moves                 — curated conversation starters
--   * intimate_thread_consent                — consent state machine per match
--   * conversation_type extension            — 'match', 'system' added
--   * cruising_mode_eligible() helper        — soft-signal gate per plan
--   * on_intimate_like_inserted() trigger    — mutual detection → conversation
--
-- Phase 5 does NOT change intimate_profiles itself; existing opt-in/eligibility
-- + intimate_discovery_v stay as-is. The new tables sit alongside.

-- ---------------------------------------------------------------------------
-- 1. Likes & passes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intimate_likes (
  actor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, target_id),
  CHECK (actor_id <> target_id)
);
CREATE INDEX IF NOT EXISTS intimate_likes_target_idx ON public.intimate_likes (target_id);

ALTER TABLE public.intimate_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intimate_likes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intimate_likes_self_select ON public.intimate_likes;
CREATE POLICY intimate_likes_self_select ON public.intimate_likes
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR target_id = auth.uid());

DROP POLICY IF EXISTS intimate_likes_self_insert ON public.intimate_likes;
CREATE POLICY intimate_likes_self_insert ON public.intimate_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.is_intimate_eligible(auth.uid())
    AND public.is_intimate_eligible(target_id)
    AND NOT public.intimate_is_blocked(actor_id, target_id)
  );

DROP POLICY IF EXISTS intimate_likes_self_delete ON public.intimate_likes;
CREATE POLICY intimate_likes_self_delete ON public.intimate_likes
  FOR DELETE TO authenticated
  USING (actor_id = auth.uid());


CREATE TABLE IF NOT EXISTS public.intimate_passes (
  actor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, target_id),
  CHECK (actor_id <> target_id)
);
CREATE INDEX IF NOT EXISTS intimate_passes_actor_idx ON public.intimate_passes (actor_id, created_at DESC);

ALTER TABLE public.intimate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intimate_passes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intimate_passes_self_select ON public.intimate_passes;
CREATE POLICY intimate_passes_self_select ON public.intimate_passes
  FOR SELECT TO authenticated USING (actor_id = auth.uid());

DROP POLICY IF EXISTS intimate_passes_self_insert ON public.intimate_passes;
CREATE POLICY intimate_passes_self_insert ON public.intimate_passes
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS intimate_passes_self_delete ON public.intimate_passes;
CREATE POLICY intimate_passes_self_delete ON public.intimate_passes
  FOR DELETE TO authenticated USING (actor_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 2. Matches view — mutual likes, viewer-scoped
--
-- Returns one row per matched pair where the viewer is involved. matched_at is
-- the timestamp of the LATER of the two likes (when the match actually formed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.intimate_matches
WITH (security_invoker = true)
AS
SELECT
  a.actor_id    AS viewer_id,
  a.target_id   AS other_id,
  GREATEST(a.created_at, b.created_at) AS matched_at
FROM public.intimate_likes a
JOIN public.intimate_likes b
  ON b.actor_id = a.target_id
 AND b.target_id = a.actor_id
WHERE a.actor_id = auth.uid();

GRANT SELECT ON public.intimate_matches TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Cruising mode opt-in
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intimate_cruising_mode (
  user_id                 uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled_at              timestamptz,
  safety_acknowledged_at  timestamptz,
  city_id                 uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  radius_km               int CHECK (radius_km IS NULL OR radius_km BETWEEN 1 AND 200),
  expires_at              timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intimate_cruising_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intimate_cruising_mode FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intimate_cruising_mode_self_select ON public.intimate_cruising_mode;
CREATE POLICY intimate_cruising_mode_self_select ON public.intimate_cruising_mode
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS intimate_cruising_mode_self_insert ON public.intimate_cruising_mode;
CREATE POLICY intimate_cruising_mode_self_insert ON public.intimate_cruising_mode
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS intimate_cruising_mode_self_update ON public.intimate_cruising_mode;
CREATE POLICY intimate_cruising_mode_self_update ON public.intimate_cruising_mode
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- Soft-signal eligibility helper. Plan §Phase-5:
--   account_age_days >= 7 && reports_against = 0 && profile_completion >= 50
-- Plus the existing is_intimate_eligible() gate (verified_email + 18+).
CREATE OR REPLACE FUNCTION public.cruising_mode_eligible(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_intimate_eligible(p_uid)
    AND COALESCE(
      (SELECT (now() - u.created_at) >= INTERVAL '7 days' FROM auth.users u WHERE u.id = p_uid),
      false)
    AND COALESCE(
      (SELECT COUNT(*) = 0 FROM public.intimate_reports
        WHERE target_id = p_uid AND status IN ('open','in_review')),
      true)
    AND COALESCE(
      (SELECT (profile_completion_percentage IS NULL OR profile_completion_percentage >= 50)
         FROM public.profiles WHERE user_id = p_uid),
      false);
$$;

REVOKE EXECUTE ON FUNCTION public.cruising_mode_eligible(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cruising_mode_eligible(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. Opening moves — curated prompts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intimate_opening_moves (
  slug        text PRIMARY KEY,
  prompt      text NOT NULL,
  tone        text NOT NULL CHECK (tone IN ('warm','playful','direct','curious')),
  locale      text NOT NULL DEFAULT 'en',
  sort_order  int NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true
);

ALTER TABLE public.intimate_opening_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intimate_opening_moves_public_select ON public.intimate_opening_moves;
CREATE POLICY intimate_opening_moves_public_select ON public.intimate_opening_moves
  FOR SELECT TO anon, authenticated USING (active);

INSERT INTO public.intimate_opening_moves (slug, prompt, tone, locale, sort_order) VALUES
  ('warm-hello',       'Hi — your profile caught my attention. What''s your week looking like?',                   'warm',     'en', 10),
  ('curious-travel',   'I see you''re visiting too — first time here, or coming back?',                            'curious',  'en', 20),
  ('playful-share',    'Pick one: best venue you''ve been to in town, or one you''d like to try.',                 'playful',  'en', 30),
  ('direct-vibe',      'Looking for the same kind of energy. Want to talk?',                                       'direct',   'en', 40),
  ('warm-checkin',     'How are you actually doing today?',                                                        'warm',     'en', 50),
  ('curious-shared',   'We both like {{shared_tag}} — what got you into it?',                                      'curious',  'en', 60),
  ('playful-truth',    'Tell me something true that isn''t on your profile.',                                      'playful',  'en', 70),
  ('direct-meet',      'Coffee this week if our schedules line up?',                                               'direct',   'en', 80)
ON CONFLICT (slug) DO UPDATE SET
  prompt     = EXCLUDED.prompt,
  tone       = EXCLUDED.tone,
  locale     = EXCLUDED.locale,
  sort_order = EXCLUDED.sort_order;


-- ---------------------------------------------------------------------------
-- 5. Thread consent state — per match conversation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intimate_thread_consent (
  conversation_id      uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  matched_at           timestamptz NOT NULL DEFAULT now(),
  photo_unlocked_a     boolean NOT NULL DEFAULT false,
  photo_unlocked_b     boolean NOT NULL DEFAULT false,
  location_shared_at   timestamptz,
  location_expires_at  timestamptz,
  ended_at             timestamptz,
  ended_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intimate_thread_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intimate_thread_consent FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intimate_thread_consent_participant_select ON public.intimate_thread_consent;
CREATE POLICY intimate_thread_consent_participant_select ON public.intimate_thread_consent
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = intimate_thread_consent.conversation_id
       AND cp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS intimate_thread_consent_participant_update ON public.intimate_thread_consent;
CREATE POLICY intimate_thread_consent_participant_update ON public.intimate_thread_consent
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = intimate_thread_consent.conversation_id
       AND cp.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = intimate_thread_consent.conversation_id
       AND cp.user_id = auth.uid()
  ));


-- ---------------------------------------------------------------------------
-- 6. Conversation type extension — allow 'match' + 'system'
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_conversation_type_check
  CHECK (conversation_type = ANY (ARRAY['direct','group','match','system']));


-- ---------------------------------------------------------------------------
-- 7. Mutual-match detection trigger — on intimate_likes INSERT
--
-- If the reverse like exists, create:
--   * a conversations row with conversation_type='match'
--   * conversation_participants rows for both users
--   * intimate_thread_consent row
--   * an emit_user_activity event ('dating.match_formed' — 0 points by rule,
--     intentionally absent from activity_event_rules; logged as audit only)
--
-- Idempotent: if the conversation already exists for the pair, skip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_intimate_like_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reverse    boolean;
  v_existing   uuid;
  v_new_conv   uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.intimate_likes
     WHERE actor_id = NEW.target_id AND target_id = NEW.actor_id
  ) INTO v_reverse;

  IF NOT v_reverse THEN RETURN NEW; END IF;

  -- Check for an existing match conversation between these two users.
  SELECT c.id INTO v_existing
    FROM public.conversations c
    JOIN public.conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = NEW.actor_id
    JOIN public.conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = NEW.target_id
   WHERE c.conversation_type = 'match'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.conversations (conversation_type, participants_count, title)
  VALUES ('match', 2, NULL)
  RETURNING id INTO v_new_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id, joined_at, is_admin)
  VALUES (v_new_conv, NEW.actor_id, now(), false),
         (v_new_conv, NEW.target_id, now(), false);

  INSERT INTO public.intimate_thread_consent (conversation_id, matched_at)
  VALUES (v_new_conv, now());

  -- Audit-only event (0 points — dating engagement never feeds score).
  PERFORM public.emit_user_activity(
    NEW.actor_id, 'dating.match_formed', 'conversation', v_new_conv,
    jsonb_build_object('other_id', NEW.target_id), 0, NULL);
  PERFORM public.emit_user_activity(
    NEW.target_id, 'dating.match_formed', 'conversation', v_new_conv,
    jsonb_build_object('other_id', NEW.actor_id), 0, NULL);

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS intimate_likes_detect_match ON public.intimate_likes;
CREATE TRIGGER intimate_likes_detect_match
  AFTER INSERT ON public.intimate_likes
  FOR EACH ROW EXECUTE FUNCTION public.on_intimate_like_inserted();

-- Trigger fires as DEFINER regardless of EXECUTE grant; revoke client-callable.
REVOKE EXECUTE ON FUNCTION public.on_intimate_like_inserted() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 8. Realtime: opt new tables in so /discover and match toast can subscribe.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='intimate_likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intimate_likes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='intimate_thread_consent') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intimate_thread_consent;
  END IF;
END $$;
