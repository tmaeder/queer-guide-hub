-- Self-hosted Photon (NAS) support for _shared/photon-client.ts.
--
-- 1. Breaker row `photon.self`. checkCircuit() allows by default when no row
--    exists and recordFailure() then has nothing to increment, so an unseeded
--    breaker can never trip (see 20270601100200). 5 failures / 60 s: the
--    client also keeps a per-isolate breaker (3 failures / 60 s), this row is
--    what makes a dead NAS visible across isolates and on the health page.
--
-- 2. photon_metrics_hourly: aggregates only, never query text or coordinates.
--    One row per (hour, caller, endpoint, mode, upstream); the client buffers
--    in-isolate and flushes in batches through photon_metrics_add().
--    lat_buckets are counts per latency bucket, upper bounds in ms
--    {50,100,200,300,500,750,1000,1500,2500,5000,+inf} (LATENCY_BUCKETS_MS).

insert into public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
values ('photon.self', 'closed', 5, 60)
on conflict (api_name) do nothing;

create table if not exists public.photon_metrics_hourly (
  hour                timestamptz not null,
  caller              text        not null,
  endpoint            text        not null check (endpoint in ('api', 'reverse')),
  mode                text        not null check (mode in ('komoot', 'shadow', 'primary')),
  upstream            text        not null check (upstream in ('self', 'komoot')),
  requests            integer     not null default 0,
  failures            integer     not null default 0,
  fallbacks           integer     not null default 0,
  lat_buckets         integer[]   not null default array_fill(0, array[11]),
  shadow_compared     integer     not null default 0,
  shadow_top1_250m    integer     not null default 0,
  shadow_same_country integer     not null default 0,
  shadow_same_city    integer     not null default 0,
  shadow_both_empty   integer     not null default 0,
  primary key (hour, caller, endpoint, mode, upstream)
);

alter table public.photon_metrics_hourly enable row level security;
revoke all on public.photon_metrics_hourly from public, anon, authenticated;
grant select, insert, update on public.photon_metrics_hourly to service_role;

create or replace function public.photon_metrics_add(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  b integer[];
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'photon_metrics_add: expected an array of at most 500 rows';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    b := array(select coalesce(x::int, 0) from jsonb_array_elements_text(r->'lat_buckets') x);
    if coalesce(array_length(b, 1), 0) <> 11 then
      b := array_fill(0, array[11]);
    end if;
    insert into public.photon_metrics_hourly as t (
      hour, caller, endpoint, mode, upstream, requests, failures, fallbacks, lat_buckets,
      shadow_compared, shadow_top1_250m, shadow_same_country, shadow_same_city, shadow_both_empty)
    values (
      date_trunc('hour', (r->>'hour')::timestamptz),
      left(r->>'caller', 64), r->>'endpoint', r->>'mode', r->>'upstream',
      coalesce((r->>'requests')::int, 0), coalesce((r->>'failures')::int, 0),
      coalesce((r->>'fallbacks')::int, 0), b,
      coalesce((r->>'shadow_compared')::int, 0), coalesce((r->>'shadow_top1_250m')::int, 0),
      coalesce((r->>'shadow_same_country')::int, 0), coalesce((r->>'shadow_same_city')::int, 0),
      coalesce((r->>'shadow_both_empty')::int, 0))
    on conflict (hour, caller, endpoint, mode, upstream) do update set
      requests            = t.requests + excluded.requests,
      failures            = t.failures + excluded.failures,
      fallbacks           = t.fallbacks + excluded.fallbacks,
      lat_buckets         = array(select a + c from unnest(t.lat_buckets, excluded.lat_buckets) u(a, c)),
      shadow_compared     = t.shadow_compared + excluded.shadow_compared,
      shadow_top1_250m    = t.shadow_top1_250m + excluded.shadow_top1_250m,
      shadow_same_country = t.shadow_same_country + excluded.shadow_same_country,
      shadow_same_city    = t.shadow_same_city + excluded.shadow_same_city,
      shadow_both_empty   = t.shadow_both_empty + excluded.shadow_both_empty;
  end loop;
end;
$$;

revoke execute on function public.photon_metrics_add(jsonb) from public, anon, authenticated;
grant execute on function public.photon_metrics_add(jsonb) to service_role;

-- Rollout report: per mode/upstream over the last p_hours. p50/p95 are the
-- upper bound of the bucket holding that percentile (null = over 5 s).
create or replace function public.photon_metrics_summary(p_hours integer default 48)
returns table (
  mode text, upstream text, requests bigint, failure_rate numeric, fallback_rate numeric,
  p50_ms integer, p95_ms integer, shadow_compared bigint,
  agree_top1_250m numeric, agree_country numeric, agree_city numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select m.mode, m.upstream,
           sum(m.requests) req, sum(m.failures) fail, sum(m.fallbacks) fb,
           sum(m.shadow_compared) sc, sum(m.shadow_top1_250m) s1,
           sum(m.shadow_same_country) scc, sum(m.shadow_same_city) scity
    from public.photon_metrics_hourly m
    where m.hour >= now() - make_interval(hours => p_hours)
    group by m.mode, m.upstream
  ), buckets as (
    select m.mode, m.upstream, u.i, sum(u.n) n
    from public.photon_metrics_hourly m,
         unnest(m.lat_buckets) with ordinality u(n, i)
    where m.hour >= now() - make_interval(hours => p_hours)
    group by m.mode, m.upstream, u.i
  ), cum as (
    select b.*, sum(b.n) over (partition by b.mode, b.upstream order by b.i) c,
           sum(b.n) over (partition by b.mode, b.upstream) tot
    from buckets b
  ), bounds as (select array[50,100,200,300,500,750,1000,1500,2500,5000] ub)
  select a.mode, a.upstream, a.req,
         round(a.fail::numeric / nullif(a.req, 0), 4),
         round(a.fb::numeric / nullif(a.req, 0), 4),
         (select (select ub from bounds)[min(c.i)] from cum c where c.mode = a.mode and c.upstream = a.upstream and c.c >= 0.50 * c.tot),
         (select (select ub from bounds)[min(c.i)] from cum c where c.mode = a.mode and c.upstream = a.upstream and c.c >= 0.95 * c.tot),
         a.sc,
         round(a.s1::numeric / nullif(a.sc, 0), 4),
         round(a.scc::numeric / nullif(a.sc, 0), 4),
         round(a.scity::numeric / nullif(a.sc, 0), 4)
  from agg a
  order by a.mode, a.upstream;
$$;

revoke execute on function public.photon_metrics_summary(integer) from public, anon, authenticated;
grant execute on function public.photon_metrics_summary(integer) to service_role;
