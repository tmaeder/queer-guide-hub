-- Part THREE: narrow `authenticated`'s INSERT/UPDATE on profiles to the 52
-- columns the client actually writes. 20510101100000 did SELECT and explicitly
-- deferred this, because the write set comes from `updateProfile(updates)` with
-- a caller-supplied object and I would not change a grant on a guess.
--
-- IT IS NOT TIDINESS — IT IS A PRIVILEGE ESCALATION, measured on prod as
-- `authenticated` in a rolled-back transaction BEFORE writing this:
--
--   update profiles set verified_identity = true  -> ALLOWED
--   update profiles set moderation_status = 'approved' -> ALLOWED
--   update profiles set verified_email = true     -> ALLOWED
--
-- RLS confines each to the caller's OWN row, which is exactly what makes it
-- exploitable rather than harmless: any signed-in user could self-verify and
-- self-approve with one PostgREST call. The 122 columns withdrawn here include
-- verified_identity, moderation_status, verified_email, verified_phone,
-- is_business, profile_completion_percentage, id, created_at,
-- welcome_email_sent_at and every *_encrypted twin.
--
-- HOW THE 52 WERE ENUMERATED, and why the earlier pass refused to.
-- The first attempt used grep over guessed line ranges and MISSED FIELDS —
-- Settings.tsx's editor object spans lines 384-413 and carries 26 keys, of
-- which that method found six. This list is brace-matched: each write site is
-- parsed from its opening { to the matching }, so a long object cannot be
-- truncated silently. Sources: the 13 updateProfile call sites (incl. the two
-- that forward a child's patch — useStatus's seven status keys and
-- PreferencesMirrorCard's interests/travel_preferences), useProfile's own
-- upsert + two avatar updates, and the six direct .update() hooks
-- (preferences, mailbox_address, travel_preferences, interests). Every one of
-- the 52 was verified to exist as a column before this shipped.
--
-- VERIFIED ON PROD, BOTH DIRECTIONS — "nothing broke" alone is indistinguishable
-- from a revoke that never took:
--   verified_identity/moderation_status/verified_email -> blocked (42501)
--   Settings' 26-field write, the direct .update() paths, and
--   status/vibe/intent/push                            -> still allowed
--
-- user_id is granted because the editor's upsert supplies it as the conflict
-- key. It is not a hole: RLS still decides which row may be touched.
revoke update, insert on public.profiles from authenticated;

grant update (first_name, last_name, bio, location, pronouns, pronoun_tags, identity_flags,
  phone, website, date_of_birth, age_range, gender_identity, sexual_orientation,
  occupation, education, chosen_name, name_pronunciation, coming_out_status,
  chosen_family_status, disability_status, neurodivergent_status, romantic_orientation,
  relationship_style, current_relationship_status, privacy_settings, user_mode,
  avatar_url, avatar_config, avatar_type, avatar_auto_assigned, username,
  vibe_emoji, vibe_text, vibe_set_at, vibe_expires_at,
  status_emoji, status_text, status_expires_at, availability_tags, dnd_until,
  travel_mode, presence_visibility, onboarding_completed_at, interests, languages,
  looking_for, dm_push_enabled, preferences, mailbox_address, travel_preferences,
  updated_at, user_id) on public.profiles to authenticated;
grant insert (first_name, last_name, bio, location, pronouns, pronoun_tags, identity_flags,
  phone, website, date_of_birth, age_range, gender_identity, sexual_orientation,
  occupation, education, chosen_name, name_pronunciation, coming_out_status,
  chosen_family_status, disability_status, neurodivergent_status, romantic_orientation,
  relationship_style, current_relationship_status, privacy_settings, user_mode,
  avatar_url, avatar_config, avatar_type, avatar_auto_assigned, username,
  vibe_emoji, vibe_text, vibe_set_at, vibe_expires_at,
  status_emoji, status_text, status_expires_at, availability_tags, dnd_until,
  travel_mode, presence_visibility, onboarding_completed_at, interests, languages,
  looking_for, dm_push_enabled, preferences, mailbox_address, travel_preferences,
  updated_at, user_id) on public.profiles to authenticated;

do $$
declare v_u int; v_i int; v_bad text;
begin
  select count(*) into v_u from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and grantee='authenticated' and privilege_type='UPDATE';
  select count(*) into v_i from information_schema.column_privileges
   where table_schema='public' and table_name='profiles'
     and grantee='authenticated' and privilege_type='INSERT';
  if v_u <> 52 or v_i <> 52 then
    raise exception 'expected 52 writable columns, found update=% insert=%', v_u, v_i;
  end if;

  select string_agg(column_name, ', ') into v_bad
  from information_schema.column_privileges
  where table_schema='public' and table_name='profiles'
    and grantee='authenticated' and privilege_type in ('UPDATE','INSERT')
    and column_name in ('verified_identity','moderation_status','verified_email',
                        'verified_phone','is_business','profile_completion_percentage',
                        'welcome_email_sent_at','id','created_at');
  if v_bad is not null then
    raise exception 'self-escalation columns still writable by authenticated: %', v_bad;
  end if;
end $$;

notify pgrst, 'reload schema';
