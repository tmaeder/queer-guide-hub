-- The 18+ affirmation could not be saved to, or read from, the profile.
--
-- `useAgeAffirmation` wrote `profiles.age_confirmed_at` directly and read it back,
-- but `authenticated` holds no column privilege on it (the profiles column
-- allowlists, 20510101100000 / 20540101100000). Every write and read raised 42501,
-- so only the auth-metadata copy survived and the profile record never changed.
-- Reads now go through get_my_profile(); this is the write.
--
-- Own row only (auth.uid()), and the only value a caller chooses is on/off:
-- the timestamp is the server's, so a client cannot backdate consent.

create or replace function public.set_my_age_confirmation(p_confirmed boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.profiles
     set age_confirmed_at = case when p_confirmed then coalesce(age_confirmed_at, now()) end
   where user_id = v_uid
  returning age_confirmed_at into v_at;
  return v_at;
end
$$;

revoke all on function public.set_my_age_confirmation(boolean) from public, anon;
grant execute on function public.set_my_age_confirmation(boolean) to authenticated;

do $verify$
begin
  if has_function_privilege('anon', 'public.set_my_age_confirmation(boolean)', 'execute') then
    raise exception 'set_my_age_confirmation must not be callable by anon';
  end if;
end
$verify$;
