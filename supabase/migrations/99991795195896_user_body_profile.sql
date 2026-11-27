-- Body & about: build, height, weight and clothing sizes, one row per user.
--
-- A separate table rather than profile columns because `profiles` is governed by
-- three column-grant allowlists (anon 21 / authenticated SELECT 38 / authenticated
-- INSERT/UPDATE 52) and every new column there is a decision in all three. Weight and
-- sizes are private health-adjacent data; they must never become readable by every
-- member just because a column was added to the allowlist.
--
-- Private by default. `visibility = 'members'` lets signed-in members read the row
-- (the profile overview shows it); nothing here is ever readable by anon.
-- Sizes are stored for shopping (marketplace filters); wiring them into the
-- marketplace is a separate change.

create table if not exists public.user_body_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  body_pictogram_key text,
  body_type text,
  height_cm smallint check (height_cm is null or height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 30 and 300),
  size_top text check (size_top is null or char_length(size_top) <= 12),
  size_bottom text check (size_bottom is null or char_length(size_bottom) <= 12),
  size_shoe text check (size_shoe is null or char_length(size_shoe) <= 12),
  size_underwear text check (size_underwear is null or char_length(size_underwear) <= 12),
  visibility text not null default 'private' check (visibility in ('private', 'members')),
  updated_at timestamptz not null default now()
);

alter table public.user_body_profile enable row level security;

drop policy if exists user_body_profile_owner on public.user_body_profile;
create policy user_body_profile_owner on public.user_body_profile
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_body_profile_members_read on public.user_body_profile;
create policy user_body_profile_members_read on public.user_body_profile
  for select to authenticated
  using (visibility = 'members');

revoke all on public.user_body_profile from anon, public;
grant select, insert, update, delete on public.user_body_profile to authenticated;
grant all on public.user_body_profile to service_role;

do $verify$
begin
  if has_table_privilege('anon', 'public.user_body_profile', 'select') then
    raise exception 'user_body_profile must not be readable by anon';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.user_body_profile'::regclass) then
    raise exception 'user_body_profile must have RLS enabled';
  end if;
end
$verify$;
