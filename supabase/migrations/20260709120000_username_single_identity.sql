-- One constant visible username per profile.
--
-- The @username handle (Username v2) is the single visible identity. `display_name`
-- becomes a derived MIRROR of `username` so every surface that already renders
-- display_name (messages, posts, groups, people cards, community) shows the handle
-- with no code change — the same derived-mirror pattern used for `pronouns` /
-- `pronoun_tags`. The redundant free-text display name (often an email prefix such
-- as "tmaeder") is gone from public view.

-- 1. Backfill: give every account still missing a handle a generated one so that
--    *everybody* has one constant visible username. Mirrors auto_assign_usernames()
--    (slug of display_name + 4 digits, collision-resolved) but inline, so the
--    migration is self-contained and does not depend on the admin/internal guard.
--    Idempotent: only touches rows where username IS NULL.
DO $$
DECLARE
  r record;
  v_base text;
  v_candidate text;
  v_tries int;
BEGIN
  FOR r IN
    SELECT user_id, display_name FROM public.profiles
    WHERE username IS NULL
    ORDER BY created_at
  LOOP
    v_base := regexp_replace(lower(coalesce(r.display_name, 'member')), '[^a-z0-9]', '', 'g');
    IF v_base = '' OR v_base ~ '^[0-9]' THEN v_base := 'member'; END IF;
    v_base := left(v_base, 14);
    IF length(v_base) < 2 THEN v_base := 'member'; END IF;

    v_tries := 0;
    LOOP
      v_candidate := v_base || lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN public.username_available(v_candidate) OR v_tries > 25;
      v_tries := v_tries + 1;
    END LOOP;
    CONTINUE WHEN NOT public.username_available(v_candidate);

    UPDATE public.profiles SET
      username = v_candidate,
      username_auto_assigned = true,   -- first self-service change stays free
      updated_at = now()
    WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- 2. Mirror: keep display_name == username on every write. Fires only when
--    username / display_name is in the SET list, so ordinary profile edits do not
--    re-touch the column. A handle change (change_username, admin fast-track,
--    auto-assign) propagates to display_name automatically.
CREATE OR REPLACE FUNCTION public.mirror_username_to_display_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.username IS NOT NULL AND NEW.display_name IS DISTINCT FROM NEW.username THEN
    NEW.display_name := NEW.username;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_username_to_display_name ON public.profiles;
CREATE TRIGGER trg_mirror_username_to_display_name
  BEFORE INSERT OR UPDATE OF username, display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_username_to_display_name();

-- 3. One-time mirror backfill for existing rows (post step 1, so every non-null
--    handle is reflected).
UPDATE public.profiles
SET display_name = username
WHERE username IS NOT NULL AND display_name IS DISTINCT FROM username;

-- 4. Keep future blanks self-healing: enable the daily deadline auto-assign job
--    (registered DISABLED by 20260612160000). New signups that land without a
--    handle get one on the next run; the mirror then fills their display_name.
UPDATE public.admin_automations SET enabled = true WHERE slug = 'username_auto_assign';
