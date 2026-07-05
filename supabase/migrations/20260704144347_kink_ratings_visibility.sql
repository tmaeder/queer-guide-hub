-- Kink checklist: per-user ratings, per-category visibility tiers, per-person
-- revocable grants (ddirt-style unlock + compare handshake halves).
--
-- RLS stance (load-bearing): ratings + visibility are STRICTLY self-only.
-- There is deliberately NO mutual-read policy — every cross-user read goes
-- through SECURITY DEFINER RPCs that enforce the tier ladder
-- (kink_access_rank). That is what makes per-category tiers enforceable.

create table if not exists public.kink_ratings (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  item_id uuid not null references public.kink_items(id) on delete cascade,
  side text not null default 'general'
    check (side in ('general','giving','receiving','self','partner','dominant','submissive')),
  rating text not null
    check (rating in ('favorite','like','curious','maybe','no','hard_limit')),
  needs_discussion boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id, side)
);

create table if not exists public.kink_category_visibility (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  category_id uuid not null references public.kink_categories(id) on delete cascade,
  tier text not null default 'private'
    check (tier in ('private','unlocked','matches','members')),
  include_in_share boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table if not exists public.kink_grants (
  id uuid primary key default gen_random_uuid(),
  grantor_id uuid not null references public.profiles(user_id) on delete cascade,
  grantee_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('view','compare')),
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (grantor_id <> grantee_id),
  unique (grantor_id, grantee_id, kind)
);

create index if not exists kink_grants_grantee_idx
  on public.kink_grants(grantee_id) where revoked_at is null;
create index if not exists kink_ratings_user_idx on public.kink_ratings(user_id);

alter table public.kink_ratings enable row level security;
alter table public.kink_ratings force row level security;
alter table public.kink_category_visibility enable row level security;
alter table public.kink_category_visibility force row level security;
alter table public.kink_grants enable row level security;
alter table public.kink_grants force row level security;

drop policy if exists kink_ratings_self_select on public.kink_ratings;
create policy kink_ratings_self_select on public.kink_ratings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists kink_ratings_self_insert on public.kink_ratings;
create policy kink_ratings_self_insert on public.kink_ratings
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists kink_ratings_self_update on public.kink_ratings;
create policy kink_ratings_self_update on public.kink_ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists kink_ratings_self_delete on public.kink_ratings;
create policy kink_ratings_self_delete on public.kink_ratings
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists kink_visibility_self_select on public.kink_category_visibility;
create policy kink_visibility_self_select on public.kink_category_visibility
  for select to authenticated using (user_id = auth.uid());

drop policy if exists kink_visibility_self_insert on public.kink_category_visibility;
create policy kink_visibility_self_insert on public.kink_category_visibility
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists kink_visibility_self_update on public.kink_category_visibility;
create policy kink_visibility_self_update on public.kink_category_visibility
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists kink_visibility_self_delete on public.kink_category_visibility;
create policy kink_visibility_self_delete on public.kink_category_visibility
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists kink_grants_party_select on public.kink_grants;
create policy kink_grants_party_select on public.kink_grants
  for select to authenticated
  using (grantor_id = auth.uid() or grantee_id = auth.uid());

drop policy if exists kink_grants_grantor_insert on public.kink_grants;
create policy kink_grants_grantor_insert on public.kink_grants
  for insert to authenticated
  with check (
    grantor_id = auth.uid()
    and public.is_intimate_eligible(auth.uid())
    and not public.intimate_is_blocked(grantor_id, grantee_id)
  );

drop policy if exists kink_grants_grantor_update on public.kink_grants;
create policy kink_grants_grantor_update on public.kink_grants
  for update to authenticated
  using (grantor_id = auth.uid())
  with check (grantor_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.kink_grants;
exception when duplicate_object then
  null;
end $$;

create or replace function public.kink_access_rank(p_viewer uuid, p_owner uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_viewer is null or p_owner is null then
    return 0;
  end if;
  if p_viewer = p_owner then
    return 4;
  end if;
  if public.intimate_is_blocked(p_viewer, p_owner) then
    return 0;
  end if;
  if not public.is_intimate_eligible(p_viewer)
     or not public.is_intimate_eligible(p_owner) then
    return 0;
  end if;

  if exists (
    select 1 from public.kink_grants g
    where g.grantor_id = p_owner and g.grantee_id = p_viewer
      and g.kind = 'view' and g.revoked_at is null
  ) then
    return 3;
  end if;

  if exists (
    select 1
    from public.intimate_likes l1
    join public.intimate_likes l2
      on l1.actor_id = l2.target_id and l1.target_id = l2.actor_id
    where l1.actor_id = p_viewer and l1.target_id = p_owner
  ) then
    return 2;
  end if;

  return 1;
end;
$$;

revoke all on function public.kink_access_rank(uuid, uuid) from public, anon;
grant execute on function public.kink_access_rank(uuid, uuid) to authenticated, service_role;

create or replace function public.kink_tier_rank(p_tier text)
returns int
language sql
immutable
as $$
  select case p_tier
    when 'members'  then 1
    when 'matches'  then 2
    when 'unlocked' then 3
    else 4
  end;
$$;

revoke all on function public.kink_tier_rank(text) from public, anon;
grant execute on function public.kink_tier_rank(text) to authenticated, service_role;
