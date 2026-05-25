-- Followup to milestone Phase 6 — RPCs for the IntimateMatchThread consent
-- UI: setting your own photo-unlock flag (a or b is resolved server-side from
-- the conversation participants) and sharing/withdrawing live location with
-- an auto-expire timestamp.

-- ---------------------------------------------------------------------------
-- Determine which side (a/b) the caller is on, in a match conversation.
-- Convention: lexically-smaller user_id is side 'a'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intimate_my_consent_side(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_other uuid;
  v_a uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  -- Must be a participant. RLS would prevent reading otherwise, but the
  -- SECURITY DEFINER context lets us be explicit.
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
     WHERE conversation_id = p_conversation_id AND user_id = v_uid
  ) THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_other
    FROM public.conversation_participants
   WHERE conversation_id = p_conversation_id
     AND user_id <> v_uid
   LIMIT 1;
  IF v_other IS NULL THEN RETURN NULL; END IF;

  v_a := LEAST(v_uid, v_other);
  RETURN CASE WHEN v_uid = v_a THEN 'a' ELSE 'b' END;
END
$$;
REVOKE EXECUTE ON FUNCTION public.intimate_my_consent_side(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.intimate_my_consent_side(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Toggle the caller's photo-unlock flag (writes to photo_unlocked_a or _b
-- depending on side).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intimate_set_my_photo_unlock(
  p_conversation_id uuid,
  p_unlocked        boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_side text;
BEGIN
  v_side := public.intimate_my_consent_side(p_conversation_id);
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  IF v_side = 'a' THEN
    UPDATE public.intimate_thread_consent
       SET photo_unlocked_a = p_unlocked, updated_at = now()
     WHERE conversation_id = p_conversation_id;
  ELSE
    UPDATE public.intimate_thread_consent
       SET photo_unlocked_b = p_unlocked, updated_at = now()
     WHERE conversation_id = p_conversation_id;
  END IF;
END
$$;
REVOKE EXECUTE ON FUNCTION public.intimate_set_my_photo_unlock(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.intimate_set_my_photo_unlock(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Share live location (auto-expire). p_minutes capped 5..240.
-- A second call replaces the prior window; passing NULL clears it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intimate_share_my_location(
  p_conversation_id uuid,
  p_minutes         int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capped int;
BEGIN
  IF public.intimate_my_consent_side(p_conversation_id) IS NULL THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  IF p_minutes IS NULL THEN
    UPDATE public.intimate_thread_consent
       SET location_shared_at  = NULL,
           location_expires_at = NULL,
           updated_at          = now()
     WHERE conversation_id = p_conversation_id;
    RETURN;
  END IF;

  v_capped := LEAST(240, GREATEST(5, p_minutes));
  UPDATE public.intimate_thread_consent
     SET location_shared_at  = now(),
         location_expires_at = now() + (v_capped || ' minutes')::interval,
         updated_at          = now()
   WHERE conversation_id = p_conversation_id;
END
$$;
REVOKE EXECUTE ON FUNCTION public.intimate_share_my_location(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.intimate_share_my_location(uuid, int) TO authenticated;
