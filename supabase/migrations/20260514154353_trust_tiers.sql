-- Trust Tiers: multi-stage reputation system.
-- Visitor → Local → Scout → Steward → Guardian.

create table if not exists public.user_trust_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'submission_accepted',
    'safety_validated',
    'endorsement_received'
  )),
  ref_table text,
  ref_id uuid,
  weight int not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_table, ref_id)
);
create index if not exists user_trust_events_user_kind_idx
  on public.user_trust_events(user_id, kind);

create table if not exists public.user_trust_tiers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'visitor' check (tier in (
    'visitor','local','scout','steward','guardian'
  )),
  submissions_accepted int not null default 0,
  safety_validated int not null default 0,
  endorsements_received int not null default 0,
  last_promoted_at timestamptz,
  manually_granted boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_endorsements (
  endorser_id uuid not null references auth.users(id) on delete cascade,
  endorsee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (endorser_id, endorsee_id),
  check (endorser_id <> endorsee_id)
);

create table if not exists public.venue_personal_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

-- Public view: tier label only, no counts.
create or replace view public.user_public_tiers
  with (security_invoker = true) as
  select user_id, tier from public.user_trust_tiers;

-- Recompute function: aggregate events, decide tier, update.
create or replace function public.recompute_user_tier(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub int;
  v_safe int;
  v_end int;
  v_tier text;
  v_existing record;
begin
  select
    coalesce(sum(weight) filter (where kind='submission_accepted'),0),
    coalesce(sum(weight) filter (where kind='safety_validated'),0),
    coalesce(sum(weight) filter (where kind='endorsement_received'),0)
    into v_sub, v_safe, v_end
  from public.user_trust_events
  where user_id = p_user;

  select * into v_existing from public.user_trust_tiers where user_id = p_user;

  -- Guardian is manual; never auto-promote into or out of it.
  if v_existing.tier = 'guardian' then
    v_tier := 'guardian';
  elsif v_sub >= 15 and v_safe >= 3 and v_end >= 3 then
    v_tier := 'steward';
  elsif v_sub >= 5 and v_safe >= 1 then
    v_tier := 'scout';
  elsif v_sub >= 1 or v_safe >= 1 then
    v_tier := 'local';
  else
    v_tier := 'visitor';
  end if;

  insert into public.user_trust_tiers as t (
    user_id, tier, submissions_accepted, safety_validated,
    endorsements_received, last_promoted_at
  ) values (
    p_user, v_tier, v_sub, v_safe, v_end,
    case when v_tier <> 'visitor' then now() else null end
  )
  on conflict (user_id) do update set
    submissions_accepted = excluded.submissions_accepted,
    safety_validated = excluded.safety_validated,
    endorsements_received = excluded.endorsements_received,
    tier = excluded.tier,
    last_promoted_at = case
      when t.tier is distinct from excluded.tier and excluded.tier <> 'visitor'
      then now() else t.last_promoted_at end,
    updated_at = now();
end;
$$;

revoke all on function public.recompute_user_tier(uuid) from public;
grant execute on function public.recompute_user_tier(uuid) to authenticated, service_role;

-- Helper: check if user meets a minimum tier.
create or replace function public.has_tier(p_user uuid, p_min text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with ranks(tier, ord) as (values
    ('visitor',0),('local',1),('scout',2),('steward',3),('guardian',4))
  select coalesce(
    (select t.ord from public.user_trust_tiers ut
       join ranks t on t.tier = ut.tier
      where ut.user_id = p_user), 0)
    >= (select ord from ranks where tier = p_min);
$$;
grant execute on function public.has_tier(uuid, text) to authenticated, anon, service_role;

-- Trigger: community_submissions accepted → log event + recompute.
create or replace function public.tg_trust_on_submission_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('accepted','approved')
     and (old.status is distinct from new.status)
     and new.submitted_by is not null then
    insert into public.user_trust_events(user_id, kind, ref_table, ref_id)
      values (new.submitted_by, 'submission_accepted',
              'community_submissions', new.id)
      on conflict do nothing;
    perform public.recompute_user_tier(new.submitted_by);
  end if;
  return new;
end;
$$;

drop trigger if exists trust_submission_accepted on public.community_submissions;
create trigger trust_submission_accepted
  after update of status on public.community_submissions
  for each row execute function public.tg_trust_on_submission_accepted();

-- Trigger: endorsement → log event for endorsee.
create or replace function public.tg_trust_on_endorsement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_trust_events(user_id, kind, ref_table, ref_id)
    values (new.endorsee_id, 'endorsement_received',
            'user_endorsements', null)
    on conflict do nothing;
  perform public.recompute_user_tier(new.endorsee_id);
  return new;
end;
$$;

drop trigger if exists trust_endorsement_inserted on public.user_endorsements;
create trigger trust_endorsement_inserted
  after insert on public.user_endorsements
  for each row execute function public.tg_trust_on_endorsement();

-- Helper for ops / future safety_reports table.
create or replace function public.record_safety_validation(
  p_user uuid, p_ref_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_trust_events(user_id, kind, ref_table, ref_id)
    values (p_user, 'safety_validated', 'safety_reports', p_ref_id)
    on conflict do nothing;
  perform public.recompute_user_tier(p_user);
end;
$$;
revoke all on function public.record_safety_validation(uuid, uuid) from public;
grant execute on function public.record_safety_validation(uuid, uuid) to service_role;

-- RLS
alter table public.user_trust_events  enable row level security;
alter table public.user_trust_tiers   enable row level security;
alter table public.user_endorsements  enable row level security;
alter table public.venue_personal_visits enable row level security;

-- events: owner or admin can read; no client writes.
create policy "trust_events_owner_read" on public.user_trust_events
  for select using (auth.uid() = user_id or has_role_jwt('admin'::app_role));

-- tiers: owner reads full row; everyone reads tier-only via view.
create policy "trust_tiers_owner_read" on public.user_trust_tiers
  for select using (auth.uid() = user_id or has_role_jwt('admin'::app_role));

-- endorsements: anyone authed can insert their own; read own or about-me.
create policy "endorsements_insert_self" on public.user_endorsements
  for insert with check (auth.uid() = endorser_id);
create policy "endorsements_read_involved" on public.user_endorsements
  for select using (auth.uid() in (endorser_id, endorsee_id)
                    or has_role_jwt('admin'::app_role));

-- personal visits: scout+ can write own; owner reads own.
create policy "visits_scout_write" on public.venue_personal_visits
  for insert with check (
    auth.uid() = user_id and public.has_tier(auth.uid(),'scout')
  );
create policy "visits_owner_delete" on public.venue_personal_visits
  for delete using (auth.uid() = user_id);
create policy "visits_owner_read" on public.venue_personal_visits
  for select using (auth.uid() = user_id);

grant select on public.user_public_tiers to anon, authenticated;
grant select on public.user_trust_tiers to authenticated;
grant select on public.user_trust_events to authenticated;
grant select, insert on public.user_endorsements to authenticated;
grant select, insert, delete on public.venue_personal_visits to authenticated;

comment on table public.user_trust_tiers is
  'Trust-tier state per user. Public view user_public_tiers exposes only (user_id, tier).';
