-- Intimate profile add-on (ddirt-style). Optional, off-by-default, mutual opt-in.
-- See /Users/tobiasmaeder/.claude/plans/analyse-this-site-https-ddirt-com-https-dapper-emerson.md

create extension if not exists pgcrypto;

-- =============================================================================
-- intimate_profiles: 1:1 with profiles.id
-- =============================================================================
create table if not exists public.intimate_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  opted_in_at timestamptz,
  consent_18plus_at timestamptz,

  genitalia text check (genitalia in ('penis','vagina','intersex','prefer_not_to_say')),
  genital_pictogram_key text,
  size_cm smallint check (size_cm is null or (size_cm between 1 and 60)),
  erection_angle_deg smallint check (erection_angle_deg is null or (erection_angle_deg between 0 and 180)),

  body_pictogram_key text,
  body_type text,
  height_cm smallint check (height_cm is null or (height_cm between 100 and 250)),
  age_band text check (age_band in ('18','19-20','21-24','25-29','30-34','35-39','40-49','50-59','60-69','70+')),

  role text[] default '{}'::text[],
  into_tags text[] default '{}'::text[],
  limits text[] default '{}'::text[],
  safer_sex_prefs text[] default '{}'::text[],

  -- pgcrypto-encrypted free text (key from vault); stored as bytea
  about_intimate_enc bytea,
  looking_for_enc bytea,

  discovery_city_id uuid references public.cities(id) on delete set null,
  discovery_active_until timestamptz,

  moderation_status text default 'approved' not null,
  last_active_at timestamptz default now() not null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists intimate_profiles_opted_in_idx
  on public.intimate_profiles(opted_in_at) where opted_in_at is not null;
create index if not exists intimate_profiles_city_idx
  on public.intimate_profiles(discovery_city_id) where opted_in_at is not null;
create index if not exists intimate_profiles_role_idx
  on public.intimate_profiles using gin (role);
create index if not exists intimate_profiles_into_idx
  on public.intimate_profiles using gin (into_tags);

alter table public.intimate_profiles enable row level security;
alter table public.intimate_profiles force row level security;

-- =============================================================================
-- intimate_reports: feeds into existing moderation_flags via trigger
-- =============================================================================
create table if not exists public.intimate_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text default 'open' not null check (status in ('open','in_review','resolved','dismissed')),
  created_at timestamptz default now() not null,
  check (reporter_id <> target_id)
);

create index if not exists intimate_reports_target_idx on public.intimate_reports(target_id);
create index if not exists intimate_reports_status_idx on public.intimate_reports(status);

alter table public.intimate_reports enable row level security;
alter table public.intimate_reports force row level security;

-- =============================================================================
-- Helpers
-- =============================================================================

-- True iff the user has a complete, opted-in, age-confirmed intimate profile.
-- SECURITY DEFINER + EXECUTE grant per RLS-helper memory.
create or replace function public.is_intimate_eligible(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select opted_in_at is not null
        and consent_18plus_at is not null
        and moderation_status = 'approved'
     from public.intimate_profiles
     where id = p_uid),
    false
  );
$$;

grant execute on function public.is_intimate_eligible(uuid) to authenticated;

-- Mutual-block helper, reusing user_relationships.
create or replace function public.intimate_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_relationships
    where relationship_type = 'block'
      and ((user_id = p_a and target_user_id = p_b)
        or (user_id = p_b and target_user_id = p_a))
  );
$$;

grant execute on function public.intimate_is_blocked(uuid, uuid) to authenticated;

-- =============================================================================
-- RLS: mutual opt-in for SELECT; owner-only for write.
-- =============================================================================
drop policy if exists intimate_profiles_self_read on public.intimate_profiles;
create policy intimate_profiles_self_read on public.intimate_profiles
  for select using (id = auth.uid());

drop policy if exists intimate_profiles_mutual_read on public.intimate_profiles;
create policy intimate_profiles_mutual_read on public.intimate_profiles
  for select using (
    id <> auth.uid()
    and opted_in_at is not null
    and moderation_status = 'approved'
    and public.is_intimate_eligible(auth.uid())
    and not public.intimate_is_blocked(id, auth.uid())
  );

drop policy if exists intimate_profiles_self_write on public.intimate_profiles;
create policy intimate_profiles_self_write on public.intimate_profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists intimate_reports_insert on public.intimate_reports;
create policy intimate_reports_insert on public.intimate_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists intimate_reports_self_read on public.intimate_reports;
create policy intimate_reports_self_read on public.intimate_reports
  for select using (reporter_id = auth.uid());

-- =============================================================================
-- Discovery view: NO anatomical fields. Inherits RLS via security_invoker.
-- =============================================================================
drop view if exists public.intimate_discovery_v;
create view public.intimate_discovery_v
with (security_invoker = on)
as
  select
    ip.id as user_id,
    p.display_name,
    p.avatar_url,
    ip.discovery_city_id,
    ip.role,
    ip.into_tags,
    ip.body_type,
    ip.age_band,
    ip.height_cm,
    ip.last_active_at
  from public.intimate_profiles ip
  join public.profiles p on p.id = ip.id
  where ip.opted_in_at is not null
    and ip.moderation_status = 'approved';

grant select on public.intimate_discovery_v to authenticated;

-- =============================================================================
-- Opt-in eligibility trigger: require verified_email and consent_18plus_at.
-- =============================================================================
create or replace function public.intimate_enforce_optin()
returns trigger
language plpgsql
as $$
declare
  v_verified boolean;
begin
  if new.opted_in_at is not null and (old.opted_in_at is null or old.opted_in_at <> new.opted_in_at) then
    if new.consent_18plus_at is null then
      raise exception 'intimate: 18+ consent required to opt in'
        using errcode = '22023';
    end if;
    select coalesce(verified_email, false) into v_verified
      from public.profiles where id = new.id;
    if not coalesce(v_verified, false) then
      raise exception 'intimate: verified email required to opt in'
        using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists intimate_enforce_optin_trg on public.intimate_profiles;
create trigger intimate_enforce_optin_trg
  before insert or update on public.intimate_profiles
  for each row execute function public.intimate_enforce_optin();

-- Clear opt-in if email verification is revoked.
create or replace function public.intimate_clear_optin_on_email_unverify()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.verified_email, false) = true
     and coalesce(new.verified_email, false) = false then
    update public.intimate_profiles
      set opted_in_at = null, updated_at = now()
      where id = new.id and opted_in_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists intimate_clear_optin_on_email_unverify_trg on public.profiles;
create trigger intimate_clear_optin_on_email_unverify_trg
  after update of verified_email on public.profiles
  for each row execute function public.intimate_clear_optin_on_email_unverify();

-- =============================================================================
-- Expire traveller city pin.
-- =============================================================================
create or replace function public.intimate_expire_travel_pins()
returns void
language sql
as $$
  update public.intimate_profiles
    set discovery_city_id = null,
        discovery_active_until = null,
        updated_at = now()
    where discovery_active_until is not null
      and discovery_active_until < now();
$$;

grant execute on function public.intimate_expire_travel_pins() to service_role;

-- =============================================================================
-- Mirror reports into moderation_flags so admin queue sees them.
-- =============================================================================
create or replace function public.intimate_report_to_moderation_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.moderation_flags (flag_type, status, content_type, content_id, reason, reporter_user_id, source)
  values ('REVIEW', 'OPEN', 'intimate_profile', new.target_id, new.reason, new.reporter_id, 'user');
  return new;
exception when undefined_table or undefined_column then
  return new;
end;
$$;

drop trigger if exists intimate_report_to_moderation_flag_trg on public.intimate_reports;
create trigger intimate_report_to_moderation_flag_trg
  after insert on public.intimate_reports
  for each row execute function public.intimate_report_to_moderation_flag();
