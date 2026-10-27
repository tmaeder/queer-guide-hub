-- Search latency: the personalization lookup scanned every event, and the
-- query-city detector ran four times per search.
--
-- Symptom (prod 2026-10-27): /search {query:'london', types:['venue']} took
-- 4.5-9.7 s and often returned the "popular" fallback (Barcelona, Sydney...)
-- because both worker RPCs hit their 4 s timeout (wrangler tail:
-- get_bias_signal rpc-timeout, pgHybridSearch pg-rpc-timeout).
--
-- 1. get_bias_signal: user_events (327k rows) had no index on session_id, and
--    the body's `user = x OR session = y` could not use one anyway, so an
--    anonymous visitor with no events walked the whole created_at index looking
--    for a session that is not there: 3.3-9.8 s on EVERY search. The join to
--    content_embeddings compared content_id::text, defeating that index too.
--    Now: (session_id, created_at desc) and (user_id, created_at desc) partial
--    indexes, the OR split into two indexed branches, and a uuid join (guarded
--    by a uuid regex, since user_events.entity_id is text). Measured: <10 ms;
--    output byte-identical (md5) for an anonymous session, an old session and
--    a signed-in user.
--
-- 2. search_hybrid: the `params` CTE holds the query-city detection (a scan of
--    17.5k city docs) and is referenced three times from p2, so Postgres
--    inlined it and ran the detection 4x (~290 ms). Materialized: search_hybrid
--    is ~2x faster (london 378 -> 173 ms, gay bar berlin 950 -> 443 ms) with
--    identical hits.
--
-- The index builds take ~1 s on prod (plain CREATE INDEX: migrations run in a
-- transaction, so CONCURRENTLY is unavailable).

create index if not exists user_events_session_created_idx
  on public.user_events (session_id, created_at desc) where session_id is not null;
create index if not exists user_events_user_created_idx
  on public.user_events (user_id, created_at desc) where user_id is not null;

create or replace function public.get_bias_signal(
  p_user_id uuid default null::uuid,
  p_session_id text default null::text,
  p_window integer default 30)
returns table(entity_type text, entity_id text, event_type text, age_days real, embedding vector)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $fn$
  with ev as (
    (select ue.entity_type, ue.entity_id, ue.event_type, ue.created_at
       from user_events ue
      where p_user_id is not null and ue.user_id = p_user_id
      order by ue.created_at desc
      limit p_window)
    union all
    (select ue.entity_type, ue.entity_id, ue.event_type, ue.created_at
       from user_events ue
      where p_user_id is null and p_session_id is not null and ue.session_id = p_session_id
      order by ue.created_at desc
      limit p_window)
  )
  select ev.entity_type, ev.entity_id, ev.event_type,
         extract(epoch from (now() - ev.created_at))::real / 86400.0,
         ce.embedding
    from ev
    join content_embeddings ce
      on ce.content_type = ev.entity_type
     and ce.content_id = case
           when ev.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then ev.entity_id::uuid end
   where ce.embedding is not null;
$fn$;

do $patch$
declare
  v_fn  regprocedure := 'api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)';
  v_src text := pg_get_functiondef(v_fn);
  v_old text := 'params as (select nullif(btrim($1),'''') q0,';
  v_new text := 'params as materialized (select nullif(btrim($1),'''') q0,';
  v_n   int;
begin
  if position(v_new in v_src) > 0 then
    return; -- already applied
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'search_hybrid params CTE: expected exactly 1 occurrence, found %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$patch$;

do $verify$
declare
  v_def text;
begin
  if to_regclass('public.user_events_session_created_idx') is null
     or to_regclass('public.user_events_user_created_idx') is null then
    raise exception 'user_events session/user indexes missing';
  end if;
  v_def := regexp_replace(pg_get_functiondef('public.get_bias_signal(uuid,text,integer)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  if position('content_id::text' in v_def) > 0 or position('union all' in lower(v_def)) = 0 then
    raise exception 'get_bias_signal still has the text-cast join or the single OR branch';
  end if;
  v_def := regexp_replace(pg_get_functiondef('api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  if position('params as materialized' in v_def) = 0 then
    raise exception 'search_hybrid params CTE is not materialized';
  end if;
  -- Behaviour: an unknown session returns no rows (and does so via the index).
  if exists (select 1 from public.get_bias_signal(null, 'migration-verify-no-such-session', 30)) then
    raise exception 'get_bias_signal returned rows for a session with no events';
  end if;
end
$verify$;
