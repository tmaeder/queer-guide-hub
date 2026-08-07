-- `profiles.privacy_settings` defaulted to a BOOLEAN where every reader expects
-- a string, so every new signup landed outside the vocabulary entirely.
--
-- The default was `jsonb_build_object('profile_visibility', false)`. That stores
-- a json boolean, so `privacy_settings ->> 'profile_visibility'` yields the TEXT
-- `'false'` -- which matches neither `'public'`/`'community'` (the discoverable
-- set, checked by RLS policy `profiles_read_access` and by every branch of
-- `people_discovery`) nor `'private'`. No UI writes `'false'`; nothing reads it.
--
-- It fails closed, so this was never a leak -- but it is why a brand-new member
-- is invisible in the friends/locals pools the moment they sign up, with no
-- setting they can find that explains it. 4 of 17 existing rows sit in this
-- state, which on a corpus of 17 is most of the accounts that are not
-- explicitly private.
--
-- Fix: default to the string 'private', and migrate the stranded rows to
-- 'private' as well. 'private', not 'public': the stranded rows currently behave
-- as non-discoverable, and a data repair must never silently widen who can see
-- someone on an LGBTQ+ platform. Members opt in from settings; they do not get
-- opted in by a migration.

alter table public.profiles
  alter column privacy_settings
  set default jsonb_build_object('profile_visibility', 'private');

-- Only the boolean-typed values. Written as a jsonb type check rather than
-- `->> = 'false'` so a member who somehow holds the literal *string* 'false'
-- is treated identically, while genuine 'public'/'community'/'private' rows are
-- untouched.
update public.profiles
set privacy_settings = jsonb_set(
      coalesce(privacy_settings, '{}'::jsonb),
      '{profile_visibility}',
      '"private"'::jsonb,
      true
    )
where coalesce(privacy_settings ->> 'profile_visibility', '')
      not in ('public', 'community', 'private');
