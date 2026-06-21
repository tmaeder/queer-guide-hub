-- Phase 4c: "free to meet" — a self-set, auto-expiring availability flag per
-- conversation. Reuses is_conversation_participant() for RLS.
CREATE TABLE IF NOT EXISTS public.conversation_availability (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_avail_select ON public.conversation_availability;
CREATE POLICY conv_avail_select ON public.conversation_availability
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, (select auth.uid())));

DROP POLICY IF EXISTS conv_avail_upsert ON public.conversation_availability;
CREATE POLICY conv_avail_upsert ON public.conversation_availability
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid())
    AND public.is_conversation_participant(conversation_id, (select auth.uid())));

DROP POLICY IF EXISTS conv_avail_update ON public.conversation_availability;
CREATE POLICY conv_avail_update ON public.conversation_availability
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS conv_avail_delete ON public.conversation_availability;
CREATE POLICY conv_avail_delete ON public.conversation_availability
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Set (or clear, when p_minutes <= 0) my availability for a conversation.
CREATE OR REPLACE FUNCTION public.set_conversation_availability(p_conversation_id uuid, p_minutes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_conversation_participant(p_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 THEN
    DELETE FROM public.conversation_availability
      WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
    RETURN;
  END IF;
  INSERT INTO public.conversation_availability (conversation_id, user_id, available_until, updated_at)
  VALUES (p_conversation_id, auth.uid(), now() + make_interval(mins => p_minutes), now())
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET available_until = EXCLUDED.available_until, updated_at = now();
END $$;

GRANT EXECUTE ON FUNCTION public.set_conversation_availability(uuid, int) TO authenticated;
