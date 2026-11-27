-- Tag automated traffic in search_queries and keep it out of the search analytics.
--
-- search_queries feeds the admin search analytics (search_analytics_summary,
-- search_analytics_top_queries, search_analytics_zero_results). Measured on
-- prod 2026-11-27, most of it was automated:
--
--   * "harris todd" 99 rows in 61 seconds, 99 distinct sessions, 0 results
--     each; "abba" 90 rows the next day; "mdma" 57 rows in 26 seconds. Before
--     2026-11-05 the session id came from localStorage, so one new session per
--     row means one new browser context per row: a loop of automated runs.
--   * "gay bars in lisbon", 182 rows, all from e2e/assistant-chat.spec.ts.
--   * "popular", 5,964 rows: the fixed query RecommendedForYou.tsx sends, not
--     something a reader typed.
--   * Named test sessions: "smoke-test" (scripts/smoke.sh), "cowork-search-test"
--     (scripts/search-eval/search-test.mjs), "test", "x".
--   * The two probe queries of e2e/search-vector-coverage.spec.ts.
--   * "berlin" 2,393 rows, "heldenbar" 158, "eagle": before the gate every e2e
--     run against prod was logged, and these are the suite's /search queries.
--
-- Since 2026-11-05 (#5061) the worker logs only a search the page opts in
-- (X-Search-Analytics), and the page does not opt in under automation
-- (analyticsAllowed() checks navigator.webdriver). Measured 2026-11-27: 13
-- search-heavy specs run against prod added 0 rows. What can still get through
-- is a client that sends the opt-in header itself: a script, or a browser
-- driven by an agent without navigator.webdriver. The worker now tags those
-- from the user agent (workers/search-proxy/src/syntheticTraffic.ts), and the
-- Playwright suite carries a "QueerGuideE2E/1" token in case it ever opts in.
--
-- Rows are TAGGED, never deleted. Every rule here writes a "backfill:" reason,
-- so undoing one rule is one UPDATE:
--   update search_queries set synthetic_reason = null
--    where synthetic_reason = 'backfill:burst';
--
-- What this cannot do, stated rather than implied: before 2026-11-05 the
-- marketplace, news and "your lines" hooks searched without a session id, so a
-- NULL session does not prove a script. Null-session rows are only tagged when
-- a named rule matches them. Some scripted traffic from before the gate is
-- therefore still counted.

-- 1. The tag ------------------------------------------------------------------

alter table public.search_queries
  add column if not exists synthetic_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'search_queries_synthetic_reason_len'
                    and conrelid = 'public.search_queries'::regclass) then
    alter table public.search_queries
      add constraint search_queries_synthetic_reason_len
      check (synthetic_reason is null or length(synthetic_reason) between 1 and 64);
  end if;
end $$;

comment on column public.search_queries.synthetic_reason is
  'Why this row is automated traffic (NULL = reader). Written by the search worker '
  'from the user agent, or by a "backfill:" rule in 99991795800773. Excluded from '
  'search_queries_reader and so from the search analytics.';

-- 2. The writer ----------------------------------------------------------------
-- PostgREST resolves functions by argument NAME. A second overload would make a
-- named call ambiguous, so the 7-argument version is dropped. The new argument
-- has a default, so the worker currently deployed (7 named arguments) keeps
-- resolving to this function.

drop function if exists public.log_search(text, text, text, jsonb, integer, integer, boolean);

create or replace function public.log_search(
  p_session_id text,
  p_query text,
  p_lang text,
  p_filters jsonb,
  p_n_results integer,
  p_took_ms integer,
  p_had_rewrite boolean,
  p_synthetic_reason text default null
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if length(p_query) > 500 then return; end if;
  insert into search_queries(user_id, session_id, query, lang, filters, n_results, took_ms, had_rewrite, synthetic_reason)
  values (auth.uid(), p_session_id, p_query, p_lang, p_filters, p_n_results, p_took_ms, p_had_rewrite,
          nullif(left(btrim(p_synthetic_reason), 64), ''));
end $$;

revoke all on function public.log_search(text, text, text, jsonb, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.log_search(text, text, text, jsonb, integer, integer, boolean, text) to service_role;

-- 3. What the analytics read -----------------------------------------------------
-- Reader rows only: untagged, and not a repeat of the same search by the same
-- session within 60 seconds. The repeat rule is for a client that re-sends a
-- search on its own: on 2026-11-06 one browser session logged "mdma" with the
-- same filters 26 times in 16 seconds. A reader who searches again later still
-- counts again.

create or replace view public.search_queries_reader
  with (security_invoker = true) as
select id, user_id, session_id, query, query_normalized, lang, filters, n_results,
       took_ms, had_rewrite, clicked_entity_type, clicked_entity_id, created_at
  from (
    select sq.*,
           lag(sq.created_at) over (
             partition by sq.session_id, sq.query_normalized, sq.filters
             order by sq.created_at
           ) as prev_at
      from public.search_queries sq
     where sq.synthetic_reason is null
  ) s
 where s.session_id is null
    or s.prev_at is null
    or s.created_at - s.prev_at > interval '60 seconds';

comment on view public.search_queries_reader is
  'search_queries minus automated traffic (synthetic_reason) and same-session repeats '
  'within 60s. The search analytics RPCs read this, never the table.';

revoke all on public.search_queries_reader from public, anon, authenticated;
grant select on public.search_queries_reader to service_role;

-- 4. The analytics, reading the view ------------------------------------------------

create or replace function public.search_analytics_summary(p_since timestamp with time zone, p_until timestamp with time zone default now())
  returns json
  language sql
  stable security definer
  set search_path to 'public'
as $$
  select json_build_object(
    'total',        count(*),
    'distinct_q',   count(distinct query_normalized),
    'zero_result',  count(*) filter (where n_results = 0),
    'zero_pct',     case when count(*) = 0 then 0
                         else round(100.0 * count(*) filter (where n_results = 0) / count(*), 1) end,
    'clicked',      count(*) filter (where clicked_entity_id is not null),
    'ctr_pct',      case when count(*) = 0 then 0
                         else round(100.0 * count(*) filter (where clicked_entity_id is not null) / count(*), 1) end,
    'rewritten',    count(*) filter (where had_rewrite),
    'rewrite_pct',  case when count(*) = 0 then 0
                         else round(100.0 * count(*) filter (where had_rewrite) / count(*), 1) end,
    'p50_ms',       percentile_disc(0.5) within group (order by took_ms),
    'p95_ms',       percentile_disc(0.95) within group (order by took_ms),
    -- Everything logged in the window, so the exclusion is visible.
    'raw_total',    (select count(*) from search_queries
                      where created_at >= p_since and created_at < p_until),
    'synthetic',    (select count(*) from search_queries
                      where created_at >= p_since and created_at < p_until
                        and synthetic_reason is not null),
    'langs',        coalesce((
                      select json_agg(l) from (
                        select coalesce(lang, 'unknown') as lang, count(*) as n
                        from search_queries_reader
                        where created_at >= p_since and created_at < p_until
                        group by 1 order by 2 desc limit 12
                      ) l), '[]'::json)
  )
  from search_queries_reader
  where created_at >= p_since and created_at < p_until;
$$;

create or replace function public.search_analytics_top_queries(p_since timestamp with time zone, p_limit integer default 50, p_until timestamp with time zone default now())
  returns table(query_normalized text, n bigint, avg_results numeric, avg_ms numeric, zero_n bigint, ctr_pct numeric, lang text)
  language sql
  stable security definer
  set search_path to 'public'
as $$
  select
    query_normalized,
    count(*) as n,
    round(avg(n_results), 1) as avg_results,
    round(avg(took_ms), 0) as avg_ms,
    count(*) filter (where n_results = 0) as zero_n,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where clicked_entity_id is not null) / count(*), 1) end as ctr_pct,
    (array_agg(lang order by created_at desc))[1] as lang
  from search_queries_reader
  where created_at >= p_since and created_at < p_until
    and query_normalized is not null and query_normalized <> ''
  group by query_normalized
  order by n desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.search_analytics_zero_results(p_since timestamp with time zone, p_limit integer default 50, p_until timestamp with time zone default now())
  returns table(query_normalized text, n bigint, lang text, last_seen timestamp with time zone)
  language sql
  stable security definer
  set search_path to 'public'
as $$
  select
    query_normalized,
    count(*) as n,
    (array_agg(lang order by created_at desc))[1] as lang,
    max(created_at) as last_seen
  from search_queries_reader
  where created_at >= p_since and created_at < p_until
    and n_results = 0
    and query_normalized is not null and query_normalized <> ''
  group by query_normalized
  order by n desc, last_seen desc
  limit greatest(p_limit, 1);
$$;

-- CREATE OR REPLACE keeps the existing grants and the column lists.
create or replace view public.v_top_queries with (security_invoker = true) as
select query_normalized,
       count(*) as n,
       (avg(n_results))::integer as avg_results,
       (avg(took_ms))::integer as avg_ms,
       max(created_at) as last_seen
  from public.search_queries_reader
 where created_at > (now() - '7 days'::interval)
 group by query_normalized
 order by (count(*)) desc;

create or replace view public.v_zero_hit_queries with (security_invoker = true) as
select query_normalized,
       count(*) as n,
       max(created_at) as last_seen
  from public.search_queries_reader
 where n_results = 0 and created_at > (now() - '30 days'::interval)
 group by query_normalized
having count(*) >= 2
 order by (count(*)) desc;

-- 5. Backfill ----------------------------------------------------------------------
-- One reason per row, first matching rule wins. Only untagged rows are touched,
-- so re-running this file changes nothing.

select set_config('app.actor', 'migration:99991795800773_search_queries_synthetic_traffic', true);

with burst as (
  select id,
         count(*) over (
           partition by query_normalized order by created_at
           range between interval '5 minutes' preceding and interval '5 minutes' following
         ) as same_query_10min
    from public.search_queries
), rule as (
  select sq.id,
         case
           -- Named test sessions. Browsers send a UUID (localStorage before
           -- 2026-11-05, the signed cookie after), never a word.
           when sq.session_id is not null
                and sq.session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then 'backfill:named_test_session'
           when sq.query_normalized = 'gay bars in lisbon'
             then 'backfill:e2e_assistant_chat'
           when sq.query_normalized in ('nonprofit advocacy group supporting trans rights',
                                        'zxqvwk plorbnat frumious')
             then 'backfill:e2e_search_vector_coverage'
           when sq.query_normalized = 'popular'
             then 'backfill:app_recommended_for_you'
           -- Ten or more identical queries within five minutes either side. At
           -- this site's volume no reader query has done that; every match on
           -- 2026-11-27 was a loop (fresh browser contexts, the fentanyl-test-
           -- strips investigation of 2026-08-23, probes).
           when b.same_query_10min >= 10
             then 'backfill:burst'
           -- Before the 2026-11-05 gate every e2e search was logged, one fresh
           -- browser context (so one new session) per run. These are the
           -- queries the suite sends to /search: "berlin" from 13 specs (the
           -- city filter is auto-detected, which is why 2,393 "berlin" rows
           -- carry {city: berlin} and no other city has that shape),
           -- swiss-events-import ("Heldenbar"), tag-discovery ("eagle"),
           -- search-ux ("berlnn"). Readers who searched these words before the
           -- gate are tagged too; the reason names the rule so it can be undone.
           when sq.created_at < timestamptz '2026-11-05 05:30:00+00'
                and sq.query_normalized in ('berlin', 'heldenbar', 'eagle', 'berlnn')
             then 'backfill:e2e_spec_query_before_gate'
         end as reason
    from public.search_queries sq
    join burst b on b.id = sq.id
   where sq.synthetic_reason is null
)
update public.search_queries sq
   set synthetic_reason = r.reason
  from rule r
 where r.id = sq.id
   and r.reason is not null;

-- 6. Postconditions ----------------------------------------------------------------
-- They assert end state, so a concurrent change that already did part of this
-- still passes.

do $verify$
declare
  v_n int;
begin
  -- P1: exactly one log_search, the 8-argument one, callable by service_role only.
  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'log_search';
  if v_n <> 1 then
    raise exception 'P1 failed: expected one log_search, found %', v_n;
  end if;
  if has_function_privilege('anon', 'public.log_search(text,text,text,jsonb,integer,integer,boolean,text)', 'execute')
     or has_function_privilege('authenticated', 'public.log_search(text,text,text,jsonb,integer,integer,boolean,text)', 'execute')
     or not has_function_privilege('service_role', 'public.log_search(text,text,text,jsonb,integer,integer,boolean,text)', 'execute') then
    raise exception 'P1 failed: log_search grants are wrong';
  end if;

  -- P2: the view is service-only and shows no tagged row.
  if has_table_privilege('anon', 'public.search_queries_reader', 'select')
     or has_table_privilege('authenticated', 'public.search_queries_reader', 'select') then
    raise exception 'P2 failed: search_queries_reader is readable by anon or authenticated';
  end if;
  select count(*) into v_n
    from public.search_queries_reader r
    join public.search_queries sq using (id)
   where sq.synthetic_reason is not null;
  if v_n <> 0 then
    raise exception 'P2 failed: % tagged rows visible in search_queries_reader', v_n;
  end if;

  -- P3: the measured offenders are gone from the 90-day top queries.
  -- Not "abba": two isolated rows from one session, hours apart from the
  -- burst, survive. Nothing in them tells a reader from a script, so they stay.
  select count(*) into v_n
    from public.search_analytics_top_queries(now() - interval '90 days', 200)
   where query_normalized in ('gay bars in lisbon', 'harris todd', 'popular',
                              'zxqvwk plorbnat frumious', 'heldenbar', 'eagle');
  if v_n <> 0 then
    raise exception 'P3 failed: % measured synthetic queries still in the top queries', v_n;
  end if;

  -- P3b: no burst left in what the analytics read.
  select count(*) into v_n
    from (select count(*) over (
                   partition by query_normalized order by created_at
                   range between interval '5 minutes' preceding and interval '5 minutes' following
                 ) as c
            from public.search_queries_reader) r
   where r.c >= 10;
  if v_n <> 0 then
    raise exception 'P3b failed: % reader rows sit in a burst of 10+', v_n;
  end if;

  -- P4: positive control. Excluding everything would also pass P3. Only
  -- meaningful where rows exist: on a fresh database (CI replays every
  -- migration into an empty schema) there is nothing to keep.
  if exists (select 1 from public.search_queries
              where created_at > now() - interval '90 days') then
    select count(*) into v_n
      from public.search_queries_reader
     where created_at > now() - interval '90 days';
    if v_n = 0 then
      raise exception 'P4 failed: no reader rows left in 90 days; a rule is too broad';
    end if;
  end if;

  -- P5: every backfill tag is one of the named rules, so each can be undone.
  select count(*) into v_n from public.search_queries
   where synthetic_reason like 'backfill:%'
     and synthetic_reason not in ('backfill:named_test_session', 'backfill:e2e_assistant_chat',
                                  'backfill:e2e_search_vector_coverage',
                                  'backfill:app_recommended_for_you', 'backfill:burst',
                                  'backfill:e2e_spec_query_before_gate');
  if v_n <> 0 then
    raise exception 'P5 failed: % rows carry an unknown backfill reason', v_n;
  end if;
end
$verify$;
