-- Hanky codes become visible to other opted-in members, so dating discovery can
-- match on them (Settings › Identity & dating: "who you're looking for").
--
-- Until now user_hanky_signals had one policy, owner-only, and the client saved
-- every signal as 'private'. Rows already carry a visibility column with
-- 'members_adult' in its vocabulary; that is the value the client now writes.
-- At the time of this change no active signal existed, so no member's existing
-- choice is widened by it.
--
-- Read access needs BOTH sides to be opted-in members of the intimate profile:
-- the viewer (so the 18+ consent gate holds) and the owner (approved and opted
-- in, the same condition intimate_discovery_v uses). The check runs in a
-- definer helper so the policy does not depend on intimate_profiles' own RLS.

create or replace function public.intimate_member_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.intimate_profiles ip
    where ip.id = p_user
      and ip.opted_in_at is not null
      and ip.consent_18plus_at is not null
      and ip.moderation_status = 'approved'
  );
$$;

revoke all on function public.intimate_member_active(uuid) from public, anon;
grant execute on function public.intimate_member_active(uuid) to authenticated;

drop policy if exists user_hanky_signals_members_read on public.user_hanky_signals;
create policy user_hanky_signals_members_read on public.user_hanky_signals
  for select to authenticated
  using (
    revoked_at is null
    and visibility in ('members_adult', 'public_adult')
    and public.intimate_member_active(user_id)
    and exists (
      select 1 from public.intimate_profiles v
      where v.id = (select auth.uid())
        and v.opted_in_at is not null
        and v.consent_18plus_at is not null
    )
  );

do $verify$
begin
  if has_function_privilege('anon', 'public.intimate_member_active(uuid)', 'execute') then
    raise exception 'intimate_member_active must not be callable by anon';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.user_hanky_signals'::regclass
                   and polname = 'user_hanky_signals_members_read') then
    raise exception 'members read policy missing';
  end if;
end
$verify$;
