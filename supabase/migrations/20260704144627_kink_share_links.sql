-- Kink share links: revocable, optionally expiring capability codes.
-- Viewers must be authenticated AND intimate-eligible; the page shows only
-- categories the owner explicitly flagged include_in_share.

create table if not exists public.kink_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  code text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists kink_share_links_owner_idx
  on public.kink_share_links(owner_id);

alter table public.kink_share_links enable row level security;
alter table public.kink_share_links force row level security;

drop policy if exists kink_share_links_owner_select on public.kink_share_links;
create policy kink_share_links_owner_select on public.kink_share_links
  for select to authenticated using (owner_id = auth.uid());

create or replace function public.kink_share_create(p_ttl interval default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_intimate_eligible(v_uid) then
    raise exception 'not eligible' using errcode = '42501';
  end if;

  v_code := lower(
    translate(encode(gen_random_bytes(8), 'base64'), '+/=OIl01', 'abcdefgh')
  );
  v_code := substr(regexp_replace(v_code, '[^a-z0-9]', '', 'g') || 'aaaaaaaaaaaa', 1, 12);

  insert into public.kink_share_links (owner_id, code, expires_at)
  values (v_uid, v_code, case when p_ttl is null then null else now() + p_ttl end);

  return v_code;
end;
$$;

revoke all on function public.kink_share_create(interval) from public, anon;
grant execute on function public.kink_share_create(interval) to authenticated;

create or replace function public.kink_share_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.kink_share_links
     set revoked_at = now()
   where id = p_id and owner_id = auth.uid() and revoked_at is null;
end;
$$;

revoke all on function public.kink_share_revoke(uuid) from public, anon;
grant execute on function public.kink_share_revoke(uuid) to authenticated;

create or replace function public.kink_share_view(p_code text)
returns table(
  owner_display_name text,
  owner_avatar_url text,
  category_slug text,
  item_slug text,
  side text,
  rating text,
  needs_discussion boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_link_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_intimate_eligible(v_uid) then
    raise exception 'not eligible' using errcode = '42501';
  end if;

  select l.id, l.owner_id into v_link_id, v_owner
  from public.kink_share_links l
  where l.code = p_code
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());

  if v_owner is null then
    return;
  end if;
  if v_uid <> v_owner and public.intimate_is_blocked(v_uid, v_owner) then
    return;
  end if;

  update public.kink_share_links
     set view_count = view_count + 1
   where id = v_link_id;

  return query
  select
    p.display_name,
    p.avatar_url,
    kc.slug,
    ki.slug,
    kr.side,
    kr.rating,
    kr.needs_discussion
  from public.kink_ratings kr
  join public.kink_items ki on ki.id = kr.item_id and ki.is_active
  join public.kink_categories kc on kc.id = ki.category_id and kc.is_active
  join public.kink_category_visibility kv
    on kv.user_id = kr.user_id and kv.category_id = kc.id and kv.include_in_share
  join public.profiles p on p.user_id = kr.user_id
  where kr.user_id = v_owner
    and kr.rating in ('favorite','like','curious','maybe')
  order by kc.sort_order, ki.sort_order, kr.side;
end;
$$;

revoke all on function public.kink_share_view(text) from public, anon;
grant execute on function public.kink_share_view(text) to authenticated;
