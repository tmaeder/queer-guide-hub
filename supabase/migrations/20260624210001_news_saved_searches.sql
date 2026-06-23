-- Saved news searches with optional keyword-alert emails.
create table public.news_saved_searches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 100),
  query           text,
  filters         jsonb not null default '{}',
  alert_enabled   boolean not null default false,
  alert_frequency text not null default 'daily'
                    check (alert_frequency in ('daily', 'weekly')),
  last_alerted_at timestamptz,
  created_at      timestamptz not null default now()
);

create index news_saved_searches_user_idx
  on public.news_saved_searches(user_id, created_at desc);

create index news_saved_searches_alert_idx
  on public.news_saved_searches(alert_enabled, alert_frequency, last_alerted_at)
  where alert_enabled = true;

alter table public.news_saved_searches enable row level security;

create policy "own_select" on public.news_saved_searches
  for select using ((select auth.uid()) = user_id);
create policy "own_insert" on public.news_saved_searches
  for insert with check ((select auth.uid()) = user_id);
create policy "own_update" on public.news_saved_searches
  for update using ((select auth.uid()) = user_id);
create policy "own_delete" on public.news_saved_searches
  for delete using ((select auth.uid()) = user_id);

-- ── RPCs ────────────────────────────────────────────────────────────────────

create or replace function public.list_news_saved_searches()
returns setof public.news_saved_searches
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select * from public.news_saved_searches
  where user_id = auth.uid()
  order by created_at desc
  limit 50;
$$;

create or replace function public.save_news_search(
  p_name            text,
  p_query           text default null,
  p_filters         jsonb default '{}',
  p_alert_enabled   boolean default false,
  p_alert_frequency text default 'daily'
)
returns uuid
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  insert into public.news_saved_searches
    (user_id, name, query, filters, alert_enabled, alert_frequency)
  values
    (auth.uid(), trim(p_name), p_query, coalesce(p_filters, '{}'), p_alert_enabled, p_alert_frequency)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_news_search(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.news_saved_searches
  where id = p_id and user_id = auth.uid();
end;
$$;

create or replace function public.toggle_news_search_alert(p_id uuid, p_enabled boolean)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.news_saved_searches
  set alert_enabled = p_enabled
  where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function public.list_news_saved_searches() to authenticated;
grant execute on function public.save_news_search(text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.delete_news_search(uuid) to authenticated;
grant execute on function public.toggle_news_search_alert(uuid, boolean) to authenticated;
