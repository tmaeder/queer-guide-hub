-- handle_new_user: restore the columns two prior rewrites silently dropped,
-- and generate a username + avatar inline.
--
-- WHAT WENT WRONG
-- ---------------
-- The signup form has been collecting consent and profile data that the
-- database then threw away:
--
--   * 20260411120001_signup_safe_defaults.sql added signup_provider,
--     terms_accepted_at, privacy_accepted_at, age_confirmed_at.
--   * 20260523330001_handle_new_user_persists_avatar.sql rewrote the function
--     to add avatar_config/avatar_type and, in doing so, dropped all four of
--     the above from the INSERT column list.
--   * 20260612160000_username_v2.sql rewrote it again for the v2 username
--     rules and dropped avatar_config/avatar_type too.
--
-- Net effect measured on prod 2026-08-21: of the 11 profiles created since
-- 2026-05-23, 9 have no terms_accepted_at; 15 of 17 profiles overall have no
-- signup_provider; 8 have no avatar_config. The client was sending all of it
-- the whole time.
--
-- NO CONSENT BACKFILL. GDPR Art. 7(1) requires the controller to be able to
-- DEMONSTRATE consent. A timestamp invented by this migration demonstrates
-- nothing while being indistinguishable from a record that does — strictly
-- worse than the honest gap. The affected accounts are documented in
-- docs/audits/2026-08-21-signup-consent-gap.md and remediated forward.
-- signup_provider and avatar_config ARE backfilled below: those are derivable
-- facts, not assertions about what a human agreed to.
--
-- USERNAME + AVATAR ARE NOW GENERATED HERE, which is new behaviour rather than
-- a restoration. The one-screen signup no longer collects them, and neither
-- existing fallback covers a fresh row:
--   * 20260612160200's avatar backfill is a one-time UPDATE, not a trigger or
--     a default — nothing assigns an avatar to a user created after it ran.
--   * auto_assign_usernames is a DAILY cron (0 5 * * *), so a new user would
--     be handle-less for up to 24h.
-- That gap is not cosmetic: trg_mirror_username_to_display_name only fires
-- when username IS NOT NULL, so a null handle leaves display_name as the
-- EMAIL LOCAL PART — the exact outing vector 20260612180000 exists to close.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_app_meta jsonb := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
  v_display_name text := COALESCE(
    v_meta->>'display_name',
    v_meta->>'full_name',
    v_meta->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_username text := lower(NULLIF(trim(v_meta->>'username'), ''));
  v_auto_username boolean := false;
  v_base text;
  v_candidate text;
  v_tries int;
  v_provider text := COALESCE(v_app_meta->>'provider', 'email');
  v_avatar jsonb := NULL;
  v_auto_avatar boolean := false;
BEGIN
  -- ── Username ──────────────────────────────────────────────────────────
  IF v_username IS NOT NULL AND NOT public.username_available(v_username) THEN
    v_username := NULL;
  END IF;

  -- Same algorithm as auto_assign_usernames (20260612160000) so a handle minted
  -- here is indistinguishable from one the nightly job would have produced.
  IF v_username IS NULL THEN
    v_base := regexp_replace(lower(COALESCE(v_display_name, 'member')), '[^a-z0-9]', '', 'g');
    IF v_base = '' OR v_base ~ '^[0-9]' THEN v_base := 'member'; END IF;
    v_base := left(v_base, 14);
    IF length(v_base) < 2 THEN v_base := 'member'; END IF;

    v_tries := 0;
    LOOP
      v_candidate := v_base || lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN public.username_available(v_candidate) OR v_tries > 25;
      v_tries := v_tries + 1;
    END LOOP;

    IF public.username_available(v_candidate) THEN
      v_username := v_candidate;
      -- Marks the handle as not-chosen: change_username grants a free change
      -- to auto-assigned handles, and the settings nudge keys off this.
      v_auto_username := true;
    END IF;
    -- If 25 tries all collided we fall through with NULL rather than raise:
    -- a missing handle is recoverable by the nightly job, a failed signup is
    -- not. Never let bookkeeping abort account creation.
  END IF;

  -- ── Avatar ────────────────────────────────────────────────────────────
  IF jsonb_typeof(v_meta->'avatar_config') = 'object' THEN
    v_avatar := v_meta->'avatar_config';
  ELSE
    -- Deterministic neutral config seeded on the user id — byte-identical to
    -- what 20260612160200's backfill produces for the same id.
    v_avatar := jsonb_build_object(
      'accessory',     (ARRAY['none','roundGlasses'])[1 + abs(hashtext(NEW.id::text || 'acc')) % 2],
      'body',          'chest',
      'clothing',      (ARRAY['shirt','vneck','tankTop','dressShirt'])[1 + abs(hashtext(NEW.id::text || 'clo')) % 4],
      'clothingColor', (ARRAY['white','blue','black','green','red'])[1 + abs(hashtext(NEW.id::text || 'clc')) % 5],
      'eyebrows',      (ARRAY['raised','serious'])[1 + abs(hashtext(NEW.id::text || 'brw')) % 2],
      'eyes',          (ARRAY['content','normal','happy'])[1 + abs(hashtext(NEW.id::text || 'eye')) % 3],
      'facialHair',    'none',
      'graphic',       'none',
      'hair',          (ARRAY['long','bun','short','pixie','buzz','afro','bob'])[1 + abs(hashtext(NEW.id::text || 'hai')) % 7],
      'hairColor',     (ARRAY['white','blue','black','blonde','orange','brown','pink'])[1 + abs(hashtext(NEW.id::text || 'hac')) % 7],
      'hat',           'none',
      'hatColor',      'white',
      'lashes',        false,
      'lipColor',      (ARRAY['red','pink','purple'])[1 + abs(hashtext(NEW.id::text || 'lip')) % 3],
      'mask',          false,
      'mouth',         (ARRAY['grin','openSmile','serious'])[1 + abs(hashtext(NEW.id::text || 'mou')) % 3],
      'skinTone',      (ARRAY['black','red','brown','light','yellow','dark'])[1 + abs(hashtext(NEW.id::text || 'ski')) % 6],
      'circleColor',   'blue'
    );
    v_auto_avatar := true;
  END IF;

  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    username,
    username_auto_assigned,
    avatar_config,
    avatar_type,
    avatar_auto_assigned,
    signup_provider,
    terms_accepted_at,
    privacy_accepted_at,
    age_confirmed_at,
    privacy_settings
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    v_username,
    v_auto_username,
    v_avatar,
    'builder',
    v_auto_avatar,
    -- From raw_app_meta_data, which GoTrue sets. raw_user_meta_data is
    -- client-supplied and therefore forgeable — never source provenance there.
    CASE
      WHEN v_provider IN ('google', 'apple', 'email') THEN v_provider
      ELSE 'unknown'
    END,
    NULLIF(v_meta->>'terms_accepted_at', '')::timestamptz,
    NULLIF(v_meta->>'privacy_accepted_at', '')::timestamptz,
    NULLIF(v_meta->>'age_confirmed_at', '')::timestamptz,
    jsonb_build_object('profile_visibility', false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    -- COALESCE on the existing value throughout: this trigger must never
    -- clobber something the user has since set.
    email = EXCLUDED.email,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    avatar_config = COALESCE(public.profiles.avatar_config, EXCLUDED.avatar_config),
    avatar_type = COALESCE(public.profiles.avatar_type, EXCLUDED.avatar_type),
    signup_provider = COALESCE(public.profiles.signup_provider, EXCLUDED.signup_provider),
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    privacy_accepted_at = COALESCE(public.profiles.privacy_accepted_at, EXCLUDED.privacy_accepted_at),
    age_confirmed_at = COALESCE(public.profiles.age_confirmed_at, EXCLUDED.age_confirmed_at);
  RETURN NEW;
END;
$$;

-- ── Backfill: derivable facts only ─────────────────────────────────────────

-- signup_provider from the identity that actually created the account.
UPDATE public.profiles p
SET signup_provider = CASE
      WHEN i.provider IN ('google', 'apple', 'email') THEN i.provider
      ELSE 'unknown'
    END
FROM (
  SELECT user_id, min(provider) AS provider
  FROM auth.identities
  GROUP BY user_id
) i
WHERE p.user_id = i.user_id
  AND p.signup_provider IS NULL;

-- Avatars for the rows created between the regression and this fix.
-- Same predicate as 20260612160200 so an explicit 'initials' choice is kept.
WITH pools AS (
  SELECT
    ARRAY['black','red','brown','light','yellow','dark']             AS skin,
    ARRAY['white','blue','black','blonde','orange','brown','pink']   AS haircolor,
    ARRAY['long','bun','short','pixie','buzz','afro','bob']          AS hair,
    ARRAY['shirt','vneck','tankTop','dressShirt']                    AS clothing,
    ARRAY['white','blue','black','green','red']                      AS clothingcolor,
    ARRAY['content','normal','happy']                                AS eyes,
    ARRAY['raised','serious']                                        AS eyebrows,
    ARRAY['grin','openSmile','serious']                              AS mouth,
    ARRAY['none','roundGlasses']                                     AS accessory,
    ARRAY['red','pink','purple']                                     AS lipcolor
)
UPDATE public.profiles p
SET
  avatar_config = jsonb_build_object(
    'accessory',     pools.accessory[1 + abs(hashtext(p.user_id::text || 'acc')) % 2],
    'body',          'chest',
    'clothing',      pools.clothing[1 + abs(hashtext(p.user_id::text || 'clo')) % 4],
    'clothingColor', pools.clothingcolor[1 + abs(hashtext(p.user_id::text || 'clc')) % 5],
    'eyebrows',      pools.eyebrows[1 + abs(hashtext(p.user_id::text || 'brw')) % 2],
    'eyes',          pools.eyes[1 + abs(hashtext(p.user_id::text || 'eye')) % 3],
    'facialHair',    'none',
    'graphic',       'none',
    'hair',          pools.hair[1 + abs(hashtext(p.user_id::text || 'hai')) % 7],
    'hairColor',     pools.haircolor[1 + abs(hashtext(p.user_id::text || 'hac')) % 7],
    'hat',           'none',
    'hatColor',      'white',
    'lashes',        false,
    'lipColor',      pools.lipcolor[1 + abs(hashtext(p.user_id::text || 'lip')) % 3],
    'mask',          false,
    'mouth',         pools.mouth[1 + abs(hashtext(p.user_id::text || 'mou')) % 3],
    'skinTone',      pools.skin[1 + abs(hashtext(p.user_id::text || 'ski')) % 6],
    'circleColor',   'blue'
  ),
  avatar_type = 'builder',
  avatar_auto_assigned = true,
  updated_at = now()
FROM pools
WHERE p.avatar_url IS NULL
  AND p.avatar_config IS NULL
  AND (p.avatar_type IS NULL OR p.avatar_type <> 'initials');

-- ── Funnel vocabulary ──────────────────────────────────────────────────────
-- signup_funnel_events.event is an enumerated CHECK (20260411120001) and the
-- TypeScript FunnelEvent union drifted away from it.
--
-- 'signup_validation_error' IS IN THE CLIENT UNION AND WAS NEVER IN THE CHECK.
-- Signup.tsx emits it on every failed validation, the constraint rejects the
-- INSERT, and useSignupFunnel swallows the rejection in a catch that only
-- console.debug's. Verified against prod 2026-08-21: the value is not in the
-- live constraint's array.
--
-- This matters beyond the missing rows. The signup funnel showed 3,675 landing
-- views, 4 completions and ZERO validation errors, and that zero was read as
-- evidence about users ("they leave without ever submitting"). It is not
-- evidence of anything — the row could not be written no matter what anyone
-- did. Any conclusion drawn from the absence of this event is unfounded.
--
-- A fire-and-forget analytics writer that silently drops rejected rows will
-- always produce this failure mode: the vocabulary and the constraint drift,
-- and the resulting zeros read as measurements.
--
-- signup_submit_attempt is added for the same investigation: the form relies
-- on native HTML validation (required / type=email / minLength), which blocks
-- submit BEFORE the React handler runs, so emitting before validation is the
-- only way to distinguish "nobody tried" from "tried and was blocked".
ALTER TABLE public.signup_funnel_events
  DROP CONSTRAINT IF EXISTS signup_funnel_events_event_check;

ALTER TABLE public.signup_funnel_events
  ADD CONSTRAINT signup_funnel_events_event_check CHECK (event IN (
    'signup_landing_view',
    'signup_submit_attempt',
    'oauth_start',
    'oauth_complete',
    'signup_validation_error',
    'signup_completed',
    'email_verified',
    'onboarding_skipped',
    'onboarding_completed',
    'password_reset_requested',
    'password_reset_completed',
    'step_started',
    'step_completed',
    'step_validation_error'
  ));
