-- Followup to milestone — streak shields (1 grace gap per rolling 30 days).
--
-- Existing logic in on_venue_checkin_inserted resets current_streak to 1
-- whenever the last checkin was more than 1 day ago. This migration adds an
-- optional grace: if the user has not consumed a streak shield in the last
-- 30 days, AND the gap is small enough (≤ 2 days), the streak continues and
-- the shield is marked consumed.
--
-- This is intentionally NOT user-callable — the trigger applies the shield
-- automatically. Users see the kept streak; we surface "1 grace day used"
-- in the UI from streak_shields_used_at[-1].

ALTER TABLE public.user_gamification
  ADD COLUMN IF NOT EXISTS streak_shields_used_at timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[];

-- Replace the existing trigger function. The body is identical to the
-- 20260524160000 version except for the streak-reset branch, which now
-- consults the shield helper before resetting.
CREATE OR REPLACE FUNCTION public.on_venue_checkin_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_new_venue  boolean;
  v_last_date     date;
  v_today         date := (NEW.checked_in_at AT TIME ZONE 'UTC')::date;
  v_points        integer := 10;
  v_prev_streak   integer;
  v_new_streak    integer;
  v_gap_days      integer;
  v_shields       timestamptz[];
  v_shield_count  integer;
BEGIN
  -- Bootstrap row if missing.
  INSERT INTO public.user_gamification (user_id) VALUES (NEW.user_id)
  ON CONFLICT DO NOTHING;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.venue_checkins
     WHERE user_id = NEW.user_id AND venue_id = NEW.venue_id AND id <> NEW.id
  ) INTO v_is_new_venue;

  IF v_is_new_venue THEN v_points := v_points + 5; END IF;

  SELECT last_checkin_date, current_streak, streak_shields_used_at
    INTO v_last_date, v_prev_streak, v_shields
    FROM public.user_gamification WHERE user_id = NEW.user_id FOR UPDATE;

  IF v_last_date IS NULL THEN
    v_new_streak := 1;
  ELSE
    v_gap_days := (v_today - v_last_date);
    IF v_gap_days = 0 THEN
      v_new_streak := v_prev_streak;
    ELSIF v_gap_days = 1 THEN
      v_new_streak := COALESCE(v_prev_streak, 0) + 1;
    ELSIF v_gap_days BETWEEN 2 AND 3 THEN
      -- Eligible-for-shield window. Apply only if no shield used in 30d.
      v_shield_count := (
        SELECT COUNT(*) FROM unnest(COALESCE(v_shields, ARRAY[]::timestamptz[])) AS t
         WHERE t >= now() - INTERVAL '30 days'
      );
      IF v_shield_count = 0 THEN
        v_new_streak := COALESCE(v_prev_streak, 0) + 1;
        v_shields := COALESCE(v_shields, ARRAY[]::timestamptz[]) || ARRAY[now()];
      ELSE
        v_new_streak := 1;
      END IF;
    ELSE
      v_new_streak := 1;
    END IF;
  END IF;

  UPDATE public.user_gamification
     SET points                  = points + v_points,
         level                   = public.compute_level(points + v_points),
         current_streak          = v_new_streak,
         longest_streak          = GREATEST(longest_streak, v_new_streak),
         last_checkin_date       = v_today,
         total_checkins          = total_checkins + 1,
         total_venues            = total_venues + CASE WHEN v_is_new_venue THEN 1 ELSE 0 END,
         streak_shields_used_at  = v_shields,
         updated_at              = now()
   WHERE user_id = NEW.user_id;

  PERFORM public.evaluate_achievements(NEW.user_id);

  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.on_venue_checkin_inserted() FROM PUBLIC, anon, authenticated;

-- Convenience helper for the frontend: returns whether the caller has a
-- shield available right now and (if a shield was used) when.
CREATE OR REPLACE FUNCTION public.my_streak_shield_status()
RETURNS TABLE(
  available           boolean,
  last_used_at        timestamptz,
  next_available_at   timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_arr timestamptz[];
  v_recent timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    available := false;
    last_used_at := NULL;
    next_available_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT streak_shields_used_at INTO v_arr
    FROM public.user_gamification WHERE user_id = v_uid;
  SELECT MAX(t) INTO v_recent
    FROM unnest(COALESCE(v_arr, ARRAY[]::timestamptz[])) AS t
   WHERE t >= now() - INTERVAL '30 days';
  available := v_recent IS NULL;
  last_used_at := v_recent;
  next_available_at := CASE WHEN v_recent IS NULL THEN now() ELSE v_recent + INTERVAL '30 days' END;
  RETURN NEXT;
END
$$;
REVOKE EXECUTE ON FUNCTION public.my_streak_shield_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_streak_shield_status() TO authenticated;
