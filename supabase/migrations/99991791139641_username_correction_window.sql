-- Username v2 gained a 12-month lock with no way back out of a typo.
--
-- change_username (20260612160000) blocks any change inside 12 months of the
-- last one and re-anchors username_changed_at on every change. So the FIRST
-- deliberate rename immediately costs a year, with no window to correct a
-- handle the user got wrong, shortened, or regretted on sight.
--
-- Measured on prod 2026-10-04: 19 profiles carry a username, exactly ONE has
-- ever reached the gate (axi, changed 2026-09-26 08:57 UTC, next change
-- 2027-09-26), and it is a correction case -- the user wants to adjust the
-- handle they had just picked eight days earlier. So the rule's entire
-- production effect to date is one locked-out user and nothing else. It is
-- not holding a squatting problem at bay; it has never had the chance.
--
-- The fix is a 30-day correction window, and the LOAD-BEARING half is that a
-- change inside the window does NOT re-anchor the clock. Allowing a recent
-- change while also stamping now() would slide the window forward on every
-- rename and make it an unlimited-churn loophole -- exactly what the 12-month
-- rule exists to stop. Anchoring on the FIRST change bounds it: rename at T,
-- corrections free until T+30d, then locked until T+12mo from T. One window
-- per rename, never a renewable one.
--
-- 30 days rather than 7: it sits inside the 90-day username_redirects TTL, so
-- every correction still has a live redirect from each handle it passes
-- through, and it covers the real case above without a per-user data patch.
-- No profiles row is touched by this migration -- the one locked user is
-- unblocked by the rule itself, which is reversible (drop the window) in a
-- way that a hand-nulled username_changed_at is not.
--
-- Everything else is unchanged: first claim is free, the post-auto-assign
-- change is free, the old handle still gets a 90-day redirect, and
-- admin_change_username remains the safety fast-track.

CREATE OR REPLACE FUNCTION change_username(new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new text := lower(trim(new_username));
  v_old text;
  v_changed_at timestamptz;
  v_auto boolean;
  v_in_grace boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT username, username_changed_at, username_auto_assigned
    INTO v_old, v_changed_at, v_auto
    FROM profiles WHERE user_id = v_uid
    FOR UPDATE;

  IF v_old IS NOT NULL AND lower(v_old) = v_new THEN
    RETURN jsonb_build_object('ok', true, 'username', v_new, 'unchanged', true);
  END IF;

  IF NOT username_available_for(v_new, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unavailable');
  END IF;

  -- correction window: still inside 30 days of the last rename
  v_in_grace := v_changed_at IS NOT NULL
                AND v_changed_at > now() - interval '30 days';

  -- policy gate only applies to a real change (not first claim, not the free
  -- change after auto-assignment, not a correction inside the window)
  IF v_old IS NOT NULL AND NOT v_auto
     AND v_changed_at IS NOT NULL
     AND NOT v_in_grace
     AND v_changed_at > now() - interval '12 months' THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'next_change_at', v_changed_at + interval '12 months');
  END IF;

  IF v_old IS NOT NULL THEN
    INSERT INTO username_redirects (old_username, user_id)
    VALUES (lower(v_old), v_uid)
    ON CONFLICT (old_username) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          created_at = now(),
          expires_at = now() + interval '90 days';
  END IF;

  -- a correction keeps the ORIGINAL anchor, so the window cannot renew itself
  UPDATE profiles SET
    username = v_new,
    username_changed_at = CASE
      WHEN v_old IS NULL OR v_auto THEN username_changed_at
      WHEN v_in_grace THEN username_changed_at
      ELSE now() END,
    username_auto_assigned = false,
    updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'username', v_new);
END;
$$;
REVOKE EXECUTE ON FUNCTION change_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION change_username(text) TO authenticated;

COMMENT ON FUNCTION change_username(text) IS
  'Self-service handle change. First claim free; post-auto-assign change free; corrections free for 30 days after a rename WITHOUT re-anchoring the clock; otherwise once per rolling 12 months from the first rename. Old handles redirect 90 days.';

DO $verify$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'change_username';

  -- the gate must still exist: this migration widens it, never removes it
  IF position('12 months' IN v_src) = 0 THEN
    RAISE EXCEPTION 'change_username lost its 12-month gate';
  END IF;

  -- both halves must be present; the window alone is an unlimited-churn hole
  IF position('NOT v_in_grace' IN v_src) = 0 THEN
    RAISE EXCEPTION 'change_username gate does not honour the correction window';
  END IF;
  IF position('WHEN v_in_grace THEN username_changed_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'change_username re-anchors the clock inside the window';
  END IF;

  -- No profiles row is asserted here on purpose. The gate lives in plpgsql
  -- behind auth.uid(), and a migration has no JWT, so it cannot call
  -- change_username -- and re-stating the gate as SQL here would assert a
  -- COPY of the rule rather than the rule. Behaviour is covered by
  -- src/lib/__tests__/usernameCorrectionWindow.test.ts; a dated row count
  -- ("1 user is unblocked today") would decay the moment that clock moves.
END
$verify$;
