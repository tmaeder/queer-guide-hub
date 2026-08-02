-- Named, per-user views for the admin content lists (/admin/content/:type).
--
-- Until now a list remembered exactly ONE implicit state per content type, in
-- sessionStorage: per browser tab, lost on close, and with no way to keep
-- "Unreviewed Berlin venues" alongside "Recently updated".
--
-- Shape and policy follow public.news_saved_searches (20260623163734), which is
-- this project's precedent for a per-user named thing.

create table public.admin_content_views (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- The registry id (venues, events, …), not a table name.
  content_type text not null check (char_length(trim(content_type)) between 1 and 64),
  name         text not null check (char_length(trim(name)) between 1 and 60),
  spec         jsonb not null default '{}'::jsonb,
  is_default   boolean not null default false,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One name per user per type, insensitive to case and padding so "Berlin" and
-- " berlin " cannot both exist and confuse the tab strip.
create unique index admin_content_views_name_idx
  on public.admin_content_views (user_id, content_type, lower(trim(name)));

-- At most one default per user per type. A partial unique index enforces this
-- in the database rather than trusting every write path to clear the flag.
create unique index admin_content_views_default_idx
  on public.admin_content_views (user_id, content_type)
  where is_default;

create index admin_content_views_list_idx
  on public.admin_content_views (user_id, content_type, position, created_at);

alter table public.admin_content_views enable row level security;

-- Per-user only, deliberately without an is_admin() term. The route is already
-- admin-gated, the rows are the user's own, and a view spec is not sensitive.
-- Gating on admin would also orphan a demoted user's saved views.
-- `(select auth.uid())` — the wrapped form, so the planner evaluates it once.
create policy "own_select" on public.admin_content_views
  for select using ((select auth.uid()) = user_id);
create policy "own_insert" on public.admin_content_views
  for insert with check ((select auth.uid()) = user_id);
create policy "own_update" on public.admin_content_views
  for update using ((select auth.uid()) = user_id);
create policy "own_delete" on public.admin_content_views
  for delete using ((select auth.uid()) = user_id);

-- Load-bearing in this project: a new table with RLS but no GRANT is
-- unreachable, because the API roles get no privileges by default.
grant select, insert, update, delete on public.admin_content_views to authenticated;

comment on table public.admin_content_views is
  'Saved, named list views for /admin/content/:type. Private to the creating user. `spec` holds {kind, columns[], filters[], sorts[], groupBy, dateField}; field names inside it are validated CLIENT-side against the content-type registry (normalizeSpec) because SQL cannot know the registry.';

-- Clearing the previous default before setting a new one is what makes the
-- partial unique index above satisfiable in a single statement pair.
create or replace function public.set_default_content_view(p_view_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid;
  v_type text;
begin
  -- RLS applies (security invoker), so this can only ever see the caller's own
  -- rows; a missing row means "not yours" and is indistinguishable by design.
  select user_id, content_type into v_user, v_type
  from public.admin_content_views
  where id = p_view_id;

  if v_user is null then
    raise exception 'View not found';
  end if;

  update public.admin_content_views
     set is_default = false, updated_at = now()
   where user_id = v_user and content_type = v_type and is_default;

  update public.admin_content_views
     set is_default = true, updated_at = now()
   where id = p_view_id;
end;
$$;

grant execute on function public.set_default_content_view(uuid) to authenticated;
