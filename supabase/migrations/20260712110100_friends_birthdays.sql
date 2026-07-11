-- Friends' birthdays for the /hub/plans unified calendar — strictly opt-in.
--
-- Privacy contract (load-bearing):
--   * profiles.date_of_birth is never-public PII. A friend's birthday is only
--     exposed when the OWNER opted in via
--     privacy_settings->>'birthday_visibility' = 'friends' (absent = private).
--   * The return shape carries ONLY month+day anchored occurrence dates in the
--     requested window — never the birth year, never an age.
--   * Caller must be authenticated AND have an accepted friendship (either
--     direction) with the profile owner.
--
-- Column traps honored: user_relationships stores AUTH uids in
-- user_id/target_user_id with relationship_type/status; profiles keys its
-- own id but the auth uid lives in profiles.user_id.
create or replace function public.friends_birthdays(
  p_from date,
  p_to date
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  occurs_on date
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.user_id,
         p.display_name,
         p.avatar_url,
         dd.d
  from (
    select g::date as d
    from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') g
  ) dd
  cross join public.profiles p
  where auth.uid() is not null
    and p.user_id <> auth.uid()
    and p.date_of_birth is not null
    and p.privacy_settings->>'birthday_visibility' = 'friends'
    and extract(month from p.date_of_birth) = extract(month from dd.d)
    and extract(day   from p.date_of_birth) = extract(day   from dd.d)
    and exists (
      select 1 from public.user_relationships r
      where r.relationship_type = 'friend'
        and r.status = 'accepted'
        and ((r.user_id = auth.uid() and r.target_user_id = p.user_id)
          or (r.target_user_id = auth.uid() and r.user_id = p.user_id))
    )
  order by dd.d, p.display_name;
$$;

revoke all on function public.friends_birthdays(date, date) from public, anon;
grant execute on function public.friends_birthdays(date, date) to authenticated;
