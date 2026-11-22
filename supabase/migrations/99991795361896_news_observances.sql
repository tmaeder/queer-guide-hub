-- Observances phase 2.5: news articles join observances by the SAME two-signal rule as events.
--
-- Measured first (2026-11-22): 288 published, non-duplicate articles name a published
-- observance in title or excerpt; 99 have the name in the TITLE and were published inside the
-- day's window. All 99 were hand-read and every one is about the day, so this linker starts
-- in mode 'full'. The rest (excerpt-only, or a title outside the window) land in 'review'
-- and join the observance-review inbox queue alongside events.
--
-- A separate table rather than a generic link table: one more consumer does not justify a
-- polymorphic key, and a real FK to news_articles cascades on delete.
--
-- Date signal: articles carry no reliable country for this, so the window is ANY of the
-- observance's rules for the article's year (LGBT History Month has only country rules —
-- GB February, US/CA/AU October — and would otherwise never match).

-- ===== 1. table =====
create table if not exists public.news_observances (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  observance_id uuid not null references public.observances(id) on delete cascade,
  method text not null check (method in ('auto', 'human')),
  status text not null check (status in ('linked', 'review', 'rejected')),
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, observance_id)
);
create index if not exists news_observances_by_observance on public.news_observances (observance_id, status);

alter table public.news_observances enable row level security;
drop policy if exists news_observances_public_read on public.news_observances;
-- news_articles RLS applies inside the subquery: an archived article's link disappears with it
create policy news_observances_public_read on public.news_observances
  for select using (status = 'linked'
                    and exists (select 1 from public.news_articles n where n.id = article_id and n.duplicate_of_id is null)
                    and exists (select 1 from public.observances o where o.id = observance_id and o.status = 'published'));
revoke all on table public.news_observances from anon, authenticated;
grant select on table public.news_observances to anon, authenticated;

-- ===== 2. linker =====
create or replace function public.run_observance_news_link(p_mode text default null,
                                                           p_since timestamptz default now() - interval '400 days')
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_mode text;
begin
  select coalesce(p_mode, a.conditions->>'mode', 'dry_run') into v_mode
  from public.admin_automations a where a.slug = 'observance_news_link';
  v_mode := coalesce(v_mode, p_mode, 'dry_run');
  if v_mode not in ('dry_run', 'full') then
    raise exception 'observance_news_link: unknown mode %', v_mode;
  end if;

  drop table if exists pg_temp._obs_n;
  create temp table pg_temp._obs_n on commit drop as
  with o as (
    select ob.id, ob.window_days_before as wb, ob.window_days_after as wa,
           '\m(' || array_to_string(ob.match_terms, '|') || ')\M' as rx
    from public.observances ob where ob.status = 'published'
  ),
  cand as (
    select n.id as article_id, o.id as observance_id, o.wb, o.wa,
           substring(n.title from ('(?i)' || o.rx)) as title_term,
           substring(coalesce(n.excerpt, '') from ('(?i)' || o.rx)) as excerpt_term,
           n.published_at::date as d
    from public.news_articles n
    join o on (n.title ~* o.rx or coalesce(n.excerpt, '') ~* o.rx)
    where n.duplicate_of_id is null
      and n.published_at is not null
      and (p_since is null or n.published_at >= p_since)
  )
  select c.*,
         exists (select 1 from public.observance_dates r
                 cross join lateral (select public.observance_rule_range(
                   r.rule_type, extract(year from c.d)::int, r.month, r.day, r.nth, r.weekday) as g) z
                 where r.observance_id = c.observance_id
                   and c.d >= lower(z.g) - c.wb and c.d <= (upper(z.g) - 1) + c.wa) as date_sig
  from cand c;

  insert into public.news_observances (article_id, observance_id, method, status, evidence)
  select s.article_id, s.observance_id, 'auto',
         case when v_mode = 'full' and s.title_term is not null and s.date_sig then 'linked' else 'review' end,
         jsonb_build_object('title_term', s.title_term, 'desc_term', s.excerpt_term,
                            'date_signal', s.date_sig, 'mode', v_mode)
  from pg_temp._obs_n s
  on conflict (article_id, observance_id) do update
    set status = excluded.status, evidence = excluded.evidence, updated_at = now()
    where public.news_observances.status = 'review'
      and public.news_observances.method = 'auto'
      and excluded.status = 'linked';

  if v_mode = 'full' then
    update public.news_observances nx
       set status = 'review', evidence = nx.evidence || '{"demoted": true}'::jsonb, updated_at = now()
      from public.news_articles n
     where n.id = nx.article_id
       and nx.method = 'auto' and nx.status = 'linked'
       and (p_since is null or n.published_at >= p_since)
       and not exists (select 1 from pg_temp._obs_n s
                       where s.article_id = nx.article_id and s.observance_id = nx.observance_id
                         and s.title_term is not null and s.date_sig);
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'by_status', (select jsonb_object_agg(status, n)
                  from (select status, count(*) n from public.news_observances group by status) x));
end
$fn$;
revoke all on function public.run_observance_news_link(text, timestamptz) from public, anon, authenticated;
grant execute on function public.run_observance_news_link(text, timestamptz) to service_role;

insert into public.admin_automations
  (name, slug, action, enabled, trigger, schedule, conditions, managed_by, description, auto_pause_threshold)
values (
  'Link news to observances', 'observance_news_link',
  jsonb_build_object('type', 'cron', 'command', 'SELECT public.run_observance_news_link()', 'jobname', 'observance_news_link'),
  true, '{"type":"schedule"}'::jsonb, '35 3 * * *', '{"mode":"full"}'::jsonb, 'system',
  'Nightly: links news articles to observances when the TITLE names the day AND it was published inside the day''s window (any of its regional rules). Excerpt-only or out-of-window -> review (observance-review inbox). conditions.mode: dry_run | full. Links already made stay public when disabled; reject them to unpublish.',
  3
)
on conflict (slug) do nothing;

select cron.schedule('observance_news_link', '35 3 * * *', 'SELECT public.run_observance_news_link()');

-- backfill once over the whole corpus
select public.run_observance_news_link('full', null);

-- ===== 3. one inbox queue for both link kinds =====
create or replace view public.triage_src_observance_review as
select eo.id,
       'observance-review'::text as queue_type,
       'event'::text as content_type,
       e.title::text as title,
       (o.name || ' · ' || to_char(e.start_date, 'YYYY-MM-DD')
          || coalesce(' · ' || e.city, ''))::text as subtitle,
       eo.status::text as status,
       (case
          when eo.evidence->>'title_term' is not null then 0.60
          when coalesce((eo.evidence->>'date_signal')::boolean, false) then 0.50
          else 0.20
        end)::numeric(3,2) as confidence_score,
       eo.created_at,
       'observance-linker'::text as source,
       eo.event_id as entity_id,
       'events'::text as entity_table,
       false as has_diff,
       null::uuid as reporter_id,
       jsonb_build_object(
         'observance_id', o.id, 'observance_slug', o.slug, 'observance_name', o.name,
         'event_start', e.start_date, 'event_city', e.city,
         'title_term', eo.evidence->'title_term', 'desc_term', eo.evidence->'desc_term',
         'date_signal', eo.evidence->'date_signal', 'offset_days', eo.evidence->'offset_days',
         'demoted', eo.evidence->'demoted') as meta,
       null::text as flag_type,
       '{}'::jsonb as risk_flags
from public.event_observances eo
join public.events e on e.id = eo.event_id and e.duplicate_of_id is null
join public.observances o on o.id = eo.observance_id
where eo.status = 'review'
union all
select nx.id,
       'observance-review'::text,
       'news'::text,
       n.title::text,
       (o.name || ' · ' || to_char(n.published_at, 'YYYY-MM-DD'))::text,
       nx.status::text,
       (case
          when nx.evidence->>'title_term' is not null then 0.60
          when coalesce((nx.evidence->>'date_signal')::boolean, false) then 0.50
          else 0.20
        end)::numeric(3,2),
       nx.created_at,
       'observance-linker'::text,
       nx.article_id,
       'news_articles'::text,
       false,
       null::uuid,
       jsonb_build_object(
         'observance_id', o.id, 'observance_slug', o.slug, 'observance_name', o.name,
         'published_at', n.published_at,
         'title_term', nx.evidence->'title_term', 'desc_term', nx.evidence->'desc_term',
         'date_signal', nx.evidence->'date_signal', 'demoted', nx.evidence->'demoted'),
       null::text,
       '{}'::jsonb
from public.news_observances nx
join public.news_articles n on n.id = nx.article_id and n.duplicate_of_id is null
join public.observances o on o.id = nx.observance_id
where nx.status = 'review';
revoke all on public.triage_src_observance_review from anon, authenticated;

create or replace function api_private.observance_review_decide(p_item_id uuid, p_action text, p_user_id uuid)
returns void language plpgsql set search_path to 'public' as $fn$
declare v_n int;
begin
  if p_action not in ('approve', 'reject', 'reopen') then
    return;  -- flag/skip: triage_action refuses those after the CASE
  end if;
  update public.event_observances
     set status = case p_action when 'approve' then 'linked' when 'reject' then 'rejected' else 'review' end,
         method = 'human',
         reviewed_by = case when p_action = 'reopen' then null else p_user_id end,
         reviewed_at = case when p_action = 'reopen' then null else now() end,
         updated_at = now()
   where id = p_item_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    update public.news_observances
       set status = case p_action when 'approve' then 'linked' when 'reject' then 'rejected' else 'review' end,
           method = 'human',
           reviewed_by = case when p_action = 'reopen' then null else p_user_id end,
           reviewed_at = case when p_action = 'reopen' then null else now() end,
           updated_at = now()
     where id = p_item_id;
    get diagnostics v_n = row_count;
  end if;
  if v_n = 0 then
    raise exception 'observance-review: no link with id %', p_item_id using errcode = 'P0002';
  end if;
end
$fn$;
revoke all on function api_private.observance_review_decide(uuid, text, uuid) from public, anon, authenticated;

-- ===== 4. postconditions =====
do $verify$
declare v_bad int;
begin
  -- P1 the backfill linked something. On prod it linked 99 (hand-read). The
  -- floor is 1, not a prod-sized number: Critical paths replays this file on a
  -- CAPPED anonymised snapshot, where the same rule links 4, and a floor of 50
  -- aborted the scratch-database build for every PR. A zero still fails —
  -- that is the silently-empty sweep this check exists to catch.
  select count(*) into v_bad from public.news_observances where status = 'linked';
  if v_bad < 1 then
    raise exception 'P1 failed: only % news links after backfill', v_bad;
  end if;
  -- P2 no auto link without a title match and a date signal
  select count(*) into v_bad from public.news_observances
   where status = 'linked' and method = 'auto'
     and (evidence->>'title_term' is null or not coalesce((evidence->>'date_signal')::boolean, false));
  if v_bad <> 0 then
    raise exception 'P2 failed: % auto news links lack a title or date signal', v_bad;
  end if;
  -- P3 the inbox union still executes with the widened view
  if not coalesce((public.triage_queue_signals()->>'probe_ok')::boolean, false) then
    raise exception 'P3 failed: triage_queue_signals probe is not ok: %', public.triage_queue_signals();
  end if;
  -- P4 anon can read links but not write them
  if has_table_privilege('anon', 'public.news_observances', 'insert')
     or not has_table_privilege('anon', 'public.news_observances', 'select') then
    raise exception 'P4 failed: news_observances grants are wrong for anon';
  end if;
end
$verify$;
