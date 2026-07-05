-- Live status for in-chat submission cards. community_submissions RLS is
-- own-only, so other conversation participants need a narrow SECURITY DEFINER
-- window: status + promoted pointer only, scoped by conversation membership.
CREATE OR REPLACE FUNCTION public.get_chat_submission_status(p_message_id uuid)
RETURNS TABLE (
  submission_id uuid,
  status text,
  promoted_to_table text,
  promoted_to_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_msg record;
BEGIN
  SELECT m.conversation_id, m.metadata, m.sender_id
    INTO v_msg
    FROM public.messages m
   WHERE m.id = p_message_id
     AND m.message_type = 'submission';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = v_msg.conversation_id
       AND cp.user_id = (SELECT auth.uid())
  ) THEN
    RETURN;
  END IF;

  -- Only submissions owned by the message sender: a crafted metadata payload
  -- can't be used to probe arbitrary submission ids.
  BEGIN
    RETURN QUERY
    SELECT cs.id, cs.status, cs.promoted_to_table, cs.promoted_to_id
      FROM public.community_submissions cs
     WHERE cs.submitted_by = v_msg.sender_id
       AND cs.id IN (
         SELECT (jsonb_array_elements_text(COALESCE(v_msg.metadata->'submission_ids', '[]'::jsonb)))::uuid
       );
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_submission_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_submission_status(uuid) TO authenticated;
