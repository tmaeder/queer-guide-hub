-- Tags as a first-class discovery axis — Phase 5 (following + feed).
--
-- Let signed-in users follow tags and get a recency feed of content across all
-- types matching their followed tags. The feed reads search_documents (the only
-- place every content type coexists with facets->'tags' + a sortable
-- updated_at), so it's one indexed scan rather than a per-type UNION.

create table if not exists public.tag_follows (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tag_id     uuid not null references public.unified_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

create index if not exists tag_follows_tag_idx on public.tag_follows (tag_id);
create index if not exists tag_follows_user_created_idx on public.tag_follows (user_id, created_at desc);

alter table public.tag_follows enable row level security;

drop policy if exists tag_follows_select_own on public.tag_follows;
create policy tag_follows_select_own on public.tag_follows
  for select using (auth.uid() = user_id);

drop policy if exists tag_follows_insert_own on public.tag_follows;
create policy tag_follows_insert_own on public.tag_follows
  for insert with check (auth.uid() = user_id);

drop policy if exists tag_follows_delete_own on public.tag_follows;
create policy tag_follows_delete_own on public.tag_follows
  for delete using (auth.uid() = user_id);

-- ── Follow / unfollow (SECURITY INVOKER — RLS enforces ownership) ────────────
create or replace function public.follow_tag(p_tag_id uuid)
returns void language sql security invoker
set search_path to 'public','pg_temp'
as $$
  insert into public.tag_follows (user_id, tag_id)
  values (auth.uid(), p_tag_id)
  on conflict (user_id, tag_id) do nothing;
$$;

create or replace function public.unfollow_tag(p_tag_id uuid)
returns void language sql security invoker
set search_path to 'public','pg_temp'
as $$
  delete from public.tag_follows where user_id = auth.uid() and tag_id = p_tag_id;
$$;

-- ── The user's followed tags (id/name/slug for chip rendering) ──────────────
create or replace function public.get_followed_tags()
returns table (tag_id uuid, name text, slug text)
language sql stable security invoker
set search_path to 'public','pg_temp'
as $$
  select t.id, t.name, t.slug
  from public.tag_follows f
  join public.unified_tags t on t.id = f.tag_id
  where f.user_id = auth.uid()
  order by f.created_at desc;
$$;

-- ── Recency feed across all content types for followed tags ─────────────────
-- SECURITY DEFINER to read search_documents; scoped to auth.uid()'s follows.
-- Keyset pagination on updated_at (pass the last row's updated_at as p_cursor).
create or replace function public.get_followed_tags_feed(
  p_limit int default 24,
  p_cursor timestamptz default null
) returns jsonb
language sql stable security definer
set search_path to 'public','extensions','pg_temp'
as $$
  with followed as (
    select array(
      select t.slug
      from public.tag_follows f
      join public.unified_tags t on t.id = f.tag_id
      where f.user_id = auth.uid() and t.slug is not null
    ) as slugs
  )
  select coalesce(
    jsonb_agg(row order by updated_at desc),
    '[]'::jsonb)
  from (
    select jsonb_build_object(
             'type', sd.entity_type, 'id', sd.entity_id,
             'title', sd.title, 'slug', sd.slug,
             'city', sd.city, 'country', sd.country,
             'image_url', sd.image_url,
             'tags', sd.facets->'tags',
             'updated_at', sd.updated_at
           ) as row,
           sd.updated_at
    from public.search_documents sd
    cross join followed
    where array_length(followed.slugs, 1) > 0
      and jsonb_typeof(sd.facets->'tags') = 'array'
      and sd.facets->'tags' ?| followed.slugs
      and sd.closed_at is null
      and sd.liveness_status is distinct from 'dead'
      and (sd.entity_type <> 'event' or sd.start_date is null
           or coalesce(sd.end_date, sd.start_date) >= now() - interval '1 day')
      and (p_cursor is null or sd.updated_at < p_cursor)
    order by sd.updated_at desc
    limit greatest(1, least(p_limit, 48))
  ) feed;
$$;

grant execute on function public.follow_tag(uuid) to authenticated;
grant execute on function public.unfollow_tag(uuid) to authenticated;
grant execute on function public.get_followed_tags() to authenticated;
grant execute on function public.get_followed_tags_feed(int, timestamptz) to authenticated;
