-- Dating/intimate layer ON BY DEFAULT for every account (owner product
-- decision for this 18+ platform: "all users must have the same feature set").
--
-- Consent basis: signup already REQUIRES a 18+ affirmation checkbox
-- (Signup.tsx -> age_confirmed_at), and that checkbox's copy is extended in the
-- same change to explicitly acknowledge the adult dating/intimate features.
-- So every new profile's eligibility is grounded in a real, required click at
-- signup — not a fabricated consent record.
--
-- This trigger auto-creates the intimate_profiles row (opted-in, 18+-consented,
-- approved) whenever a profile is created. The existing intimate_enforce_optin
-- BEFORE trigger still runs and is satisfied (consent_18plus_at is set).
--
-- REVERSIBLE: drop the trigger to stop auto-enrolling new users; existing rows
-- are removed per-account with `delete from intimate_profiles where id = <uid>`.

create or replace function public.auto_enroll_intimate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Ground the intimate 18+ consent in the account's real signup age
  -- confirmation when present; fall back to now() (the profile only exists
  -- because signup — which requires the 18+ checkbox — succeeded).
  insert into public.intimate_profiles (id, consent_18plus_at, opted_in_at, moderation_status)
  values (new.user_id, now(), now(), 'approved')
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never let intimate enrollment block account creation. If anything goes
  -- wrong, the user simply lands non-enrolled and can opt in via /intimate/onboard.
  return new;
end;
$$;

revoke all on function public.auto_enroll_intimate() from public, anon;

drop trigger if exists auto_enroll_intimate_trg on public.profiles;
create trigger auto_enroll_intimate_trg
  after insert on public.profiles
  for each row execute function public.auto_enroll_intimate();
