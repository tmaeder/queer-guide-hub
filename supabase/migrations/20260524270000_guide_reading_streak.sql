-- Phase 5 — guide reading streak helper.
-- Returns the user's current consecutive-ISO-weeks streak based on
-- marketplace_guide_reads.completed_at. Used for the quiet caption on
-- /marketplace (no flame icon, no shaming when broken — §5).

CREATE OR REPLACE FUNCTION public.marketplace_guide_reading_streak(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_streak INT := 0;
  v_week   DATE;
  v_prev   DATE;
BEGIN
  IF p_user_id IS NULL THEN RETURN 0; END IF;

  v_week := date_trunc('week', now())::date;

  FOR v_prev IN
    SELECT DISTINCT date_trunc('week', completed_at)::date AS wk
      FROM public.marketplace_guide_reads
     WHERE user_id = p_user_id
       AND completed_at IS NOT NULL
     ORDER BY wk DESC
  LOOP
    -- The latest completed week must be this week OR last week — anything
    -- older means today's streak is 0 (we won't shame interruptions).
    IF v_streak = 0 THEN
      IF v_prev = v_week OR v_prev = v_week - INTERVAL '7 days' THEN
        v_streak := 1;
        v_week := v_prev;
      ELSE
        RETURN 0;
      END IF;
    ELSE
      IF v_prev = v_week - INTERVAL '7 days' THEN
        v_streak := v_streak + 1;
        v_week := v_prev;
      ELSE
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN v_streak;
END $$;

GRANT EXECUTE ON FUNCTION public.marketplace_guide_reading_streak(UUID) TO authenticated;
COMMENT ON FUNCTION public.marketplace_guide_reading_streak(UUID) IS
  'Consecutive ISO-weeks with at least one completed guide read. Phase 5 §5.';
