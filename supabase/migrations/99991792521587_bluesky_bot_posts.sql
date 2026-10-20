-- Official @queer.guide Bluesky account (Phase 6d of the AT Protocol plan).
--
-- The edge function bluesky-bot-post logs in with an app password (Supabase
-- secrets BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD) and posts newly
-- published news and featured upcoming events, each with a link card back to
-- queer.guide. This file holds the two things that must live in the database:
--
--   bluesky_bot_posts            what was posted — the idempotency key, so a
--                                re-run or an overlapping cron never posts twice
--   bluesky_bot_candidates(n)    the ONLY selector of what may be posted
--
-- Never posted: safety-gated or deindexed rows, merged duplicates, cancelled or
-- past events, and anything carrying an adult tag. A post on Bluesky cannot be
-- unpublished from other people's timelines, so the selector errs on leaving out.
--
-- The registry row ships DISABLED and no cron is scheduled here: the function
-- has nothing to log in with until the owner sets the two secrets. Enabling the
-- row lets the nightly automation_cron_sync create the cron from it.

create table if not exists public.bluesky_bot_posts (
  entity_type text not null check (entity_type in ('news', 'event')),
  entity_id   uuid not null,
  at_uri      text not null,
  posted_at   timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

alter table public.bluesky_bot_posts enable row level security;
revoke all on public.bluesky_bot_posts from anon, authenticated;
grant select, insert on public.bluesky_bot_posts to service_role;

create or replace function public.bluesky_bot_candidates(p_limit int default 3)
returns table (
  entity_type text,
  entity_id uuid,
  title text,
  summary text,
  path text,
  tags text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with adult as (
    select lower(name) as t from public.unified_tags where is_adult
    union
    select lower(slug) from public.unified_tags where is_adult
  ),
  c as (
    (select 'event'::text as et, e.id, e.title, left(e.description, 300) as summary,
            '/events/' || e.slug as path, e.tags, 0 as rk, extract(epoch from e.start_date) as ord
     from public.events e
     where e.is_featured
       and not e.safety_gated
       and e.seo_indexable
       and e.duplicate_of_id is null
       and e.status = 'active'
       and e.start_date > now()
       and e.slug is not null
       and not exists (select 1 from unnest(coalesce(e.tags, '{}')) x where lower(x) in (select t from adult))
       and not exists (select 1 from public.bluesky_bot_posts p where p.entity_type = 'event' and p.entity_id = e.id)
     order by e.start_date
     limit 10)
    union all
    (select 'news', n.id, n.title, n.excerpt, '/news/' || n.slug, n.tags, 1, -extract(epoch from n.published_at)
     from public.news_articles n
     where n.published_at > now() - interval '24 hours'
       and n.published_at <= now()
       and n.seo_indexable
       and n.duplicate_of_id is null
       and n.slug is not null
       and not exists (select 1 from unnest(coalesce(n.tags, '{}')) x where lower(x) in (select t from adult))
       and not exists (select 1 from public.bluesky_bot_posts p where p.entity_type = 'news' and p.entity_id = n.id)
     order by n.published_at desc
     limit 10)
  )
  select et, id, title, summary, path, tags
  from c
  order by rk, ord
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

revoke all on function public.bluesky_bot_candidates(int) from public, anon, authenticated;
grant execute on function public.bluesky_bot_candidates(int) to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'bluesky_bot_post',
  'bluesky_bot_post',
  'Posts newly published news and featured upcoming events from the official @queer.guide Bluesky account, with a link card. Idempotent via bluesky_bot_posts. Needs Supabase secrets BLUESKY_BOT_HANDLE and BLUESKY_BOT_APP_PASSWORD; ships disabled.',
  'system',
  false,
  jsonb_build_object('type', 'schedule'),
  '17 * * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'bluesky_bot_post',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/bluesky-bot-post',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
    ),
    body := jsonb_build_object('limit', 3),
    timeout_milliseconds := 55000
  );
  $cmd$
  )
)
on conflict (slug) do nothing;

do $verify$
begin
  if has_function_privilege('anon', 'public.bluesky_bot_candidates(int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bluesky_bot_candidates(int)', 'EXECUTE') then
    raise exception 'bluesky bot: candidate selector is exposed beyond service_role';
  end if;
  if has_table_privilege('anon', 'public.bluesky_bot_posts', 'SELECT')
     or has_table_privilege('authenticated', 'public.bluesky_bot_posts', 'SELECT') then
    raise exception 'bluesky bot: bluesky_bot_posts is readable beyond service_role';
  end if;
  -- The selector must never offer a gated or adult item: check both guards exist.
  if position('not e.safety_gated' in regexp_replace(pg_get_functiondef('public.bluesky_bot_candidates(int)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'bluesky bot: selector no longer excludes safety-gated events';
  end if;
  if exists (
    select 1 from public.bluesky_bot_candidates(10) c
    join public.events e on c.entity_type = 'event' and e.id = c.entity_id
    where e.safety_gated
  ) then
    raise exception 'bluesky bot: selector offered a safety-gated event';
  end if;
end
$verify$;
