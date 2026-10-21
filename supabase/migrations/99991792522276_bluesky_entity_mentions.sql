-- "On Bluesky" rail (Phase 6c of the AT Protocol plan).
--
-- Public Bluesky posts that mention a venue or event, shown as embedded cards
-- on its page. The edge function bluesky-mentions fills the table from two
-- sources only:
--   1. posts that LINK to the page (Bluesky search `domain:queer.guide`, then
--      the link's path resolved to the entity by bluesky_mention_resolve), and
--   2. for featured upcoming events, posts quoting the exact event title.
-- Never by venue name: a bare name ("The Eagle") is a namesake in a dozen cities.
--
-- Filtering, in this order:
--   ingest   posts carrying any Bluesky adult/graphic or !hide/!warn label are
--            never stored;
--   read     nothing is returned for a safety-gated, deindexed or merged entity,
--            for anyone — the rail is a public amplifier and must not exist on
--            a page that is gated;
--   client   the viewer's muted words and label preferences (atprotoModeration);
--   admin    hide_bluesky_mention() hides a post everywhere.

create table if not exists public.entity_bluesky_mentions (
  at_uri        text primary key,
  entity_type   text not null check (entity_type in ('event', 'venue')),
  entity_id     uuid not null,
  cid           text,
  author_did    text not null,
  author_handle text not null,
  author_name   text,
  author_avatar text,
  text          text not null,
  post_created_at timestamptz,
  indexed_at    timestamptz not null default now(),
  match_kind    text not null check (match_kind in ('link', 'title')),
  hidden_at     timestamptz,
  hidden_by     uuid
);

create index if not exists entity_bluesky_mentions_entity_idx
  on public.entity_bluesky_mentions (entity_type, entity_id, post_created_at desc)
  where hidden_at is null;

alter table public.entity_bluesky_mentions enable row level security;
revoke all on public.entity_bluesky_mentions from anon, authenticated;
grant select, insert, update on public.entity_bluesky_mentions to service_role;

-- Maps queer.guide paths (from links inside posts) to entities. service_role only.
create or replace function public.bluesky_mention_resolve(p_paths text[])
returns table (path text, entity_type text, entity_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p, 'event', e.id
  from unnest(p_paths) p
  join public.events e on e.slug = substring(p from '^/(?:[a-z]{2}(?:-[a-z]+)?/)?events/([^/?#]+)')
  where e.duplicate_of_id is null and not e.safety_gated and e.seo_indexable
  union all
  select p, 'venue', v.id
  from unnest(p_paths) p
  join public.venues v on v.slug = substring(p from '^/(?:[a-z]{2}(?:-[a-z]+)?/)?venues/([^/?#]+)')
  where v.duplicate_of_id is null and not v.safety_gated and v.seo_indexable;
$$;

revoke all on function public.bluesky_mention_resolve(text[]) from public, anon, authenticated;
grant execute on function public.bluesky_mention_resolve(text[]) to service_role;

-- Featured upcoming events searched by exact title. service_role only.
create or replace function public.bluesky_mention_title_targets(p_limit int default 10)
returns table (entity_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title
  from public.events e
  where e.is_featured and not e.safety_gated and e.seo_indexable
    and e.duplicate_of_id is null and e.status = 'active'
    and e.start_date > now() - interval '7 days'
    and e.start_date < now() + interval '60 days'
    and length(e.title) >= 10
  order by e.start_date
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

revoke all on function public.bluesky_mention_title_targets(int) from public, anon, authenticated;
grant execute on function public.bluesky_mention_title_targets(int) to service_role;

-- Public read for the rail.
create or replace function public.bluesky_mentions_for(p_entity_type text, p_entity_id uuid, p_limit int default 6)
returns table (
  at_uri text,
  author_did text,
  author_handle text,
  author_name text,
  author_avatar text,
  text text,
  post_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.at_uri, m.author_did, m.author_handle, m.author_name, m.author_avatar, m.text, m.post_created_at
  from public.entity_bluesky_mentions m
  where m.entity_type = p_entity_type
    and m.entity_id = p_entity_id
    and m.hidden_at is null
    and case p_entity_type
      when 'event' then exists (select 1 from public.events e where e.id = p_entity_id
                                and not e.safety_gated and e.seo_indexable and e.duplicate_of_id is null)
      when 'venue' then exists (select 1 from public.venues v where v.id = p_entity_id
                                and not v.safety_gated and v.seo_indexable and v.duplicate_of_id is null)
      else false
    end
  order by m.post_created_at desc nulls last
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

revoke all on function public.bluesky_mentions_for(text, uuid, int) from public;
grant execute on function public.bluesky_mentions_for(text, uuid, int) to anon, authenticated, service_role;

create or replace function public.hide_bluesky_mention(p_at_uri text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.has_role_jwt('admin') or public.has_role_jwt('moderator')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.entity_bluesky_mentions
     set hidden_at = now(), hidden_by = auth.uid()
   where at_uri = p_at_uri and hidden_at is null;
end;
$$;

revoke all on function public.hide_bluesky_mention(text) from public, anon;
grant execute on function public.hide_bluesky_mention(text) to authenticated, service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'bluesky_mentions',
  'bluesky_mentions',
  'Collects public Bluesky posts that link to a queer.guide venue/event page, or quote a featured upcoming event''s exact title, for the "On Bluesky" rail. Adult/graphic-labelled posts are never stored; gated entities never get a rail.',
  'system',
  true,
  jsonb_build_object('type', 'schedule'),
  '41 */3 * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'bluesky_mentions',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/bluesky-mentions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
    ),
    body := jsonb_build_object('title_limit', 10),
    timeout_milliseconds := 55000
  );
  $cmd$
  )
)
on conflict (slug) do nothing;

select cron.schedule(
  'bluesky_mentions',
  '41 */3 * * *',
  public.admin_automation_effective_command(
    'bluesky_mentions',
    (select action ->> 'command' from public.admin_automations where slug = 'bluesky_mentions')))
where not exists (select 1 from cron.job where jobname = 'bluesky_mentions');

do $verify$
declare
  v_cmd text;
begin
  if has_table_privilege('anon', 'public.entity_bluesky_mentions', 'SELECT')
     or has_table_privilege('authenticated', 'public.entity_bluesky_mentions', 'SELECT') then
    raise exception 'bluesky mentions: table readable beyond service_role';
  end if;
  if has_function_privilege('anon', 'public.bluesky_mention_resolve(text[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.bluesky_mention_title_targets(int)', 'EXECUTE')
     or has_function_privilege('anon', 'public.hide_bluesky_mention(text)', 'EXECUTE') then
    raise exception 'bluesky mentions: ingest/admin functions exposed to anon';
  end if;
  if position('not e.safety_gated' in regexp_replace(pg_get_functiondef('public.bluesky_mentions_for(text,uuid,int)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0
     or position('not v.safety_gated' in regexp_replace(pg_get_functiondef('public.bluesky_mentions_for(text,uuid,int)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'bluesky mentions: public read no longer excludes gated entities';
  end if;
  select command into v_cmd from cron.job where jobname = 'bluesky_mentions' and active;
  if v_cmd is null or position('admin_automation_run_begin' in v_cmd) = 0 then
    raise exception 'bluesky mentions: cron missing or not the tracked command';
  end if;
end
$verify$;
