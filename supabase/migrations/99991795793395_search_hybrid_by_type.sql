-- search_hybrid_by_type: one RPC that runs search_hybrid once per content type.
--
-- The grouped search overview (workers/search-proxy, groupBy: 'type') searched
-- every type with its own search_hybrid RPC: 12 types plus one mixed call, 13
-- HTTP requests per search. Measured on prod 2026-11-27, a warm search_hybrid
-- for one of the small types takes 10-50 ms in the database, but each RPC costs
-- ~150 ms end to end, and run together they contend: the overview's database
-- step was flat at ~380 ms up to 7 types and rose to ~560 ms at 12. Grouped p95
-- sat at 1.60x the flat search against a 1.5x target.
--
-- This lets the worker send the small types (personality, city, queer_village,
-- tag, milestone, country, organization, guide) as one request. The big types
-- (venue, event, marketplace, news) keep their own parallel calls: for a broad
-- query they are where the time goes ("berlin": marketplace 1.5 s cold, venue
-- 0.4 s), and putting them in a sequential batch would serialise exactly that.
--
-- The result is { "<type>": <search_hybrid result for that type>, ... }, so each
-- section's hits, total and filterContract are what a single-type search_hybrid
-- call returns: verified byte-identical for four queries before shipping.
--
-- Same security as public.search_hybrid: SECURITY INVOKER, STABLE, empty
-- search_path, executable by service_role and authenticated only. Gating is
-- still decided by p_filters.include_gated, which the worker sets only for a
-- verified caller; this function adds no access of its own.

create or replace function public.search_hybrid_by_type(
  p_types text[],
  p_query text default ''::text,
  p_query_vec extensions.vector default null::extensions.vector,
  p_filters jsonb default '{}'::jsonb,
  p_lat double precision default null::double precision,
  p_lng double precision default null::double precision,
  p_radius_km double precision default null::double precision,
  p_now timestamp with time zone default now(),
  p_limit integer default 20,
  p_offset integer default 0,
  p_date_from timestamp with time zone default null::timestamp with time zone,
  p_date_to timestamp with time zone default null::timestamp with time zone,
  p_price_min numeric default null::numeric,
  p_price_max numeric default null::numeric,
  p_sort text default null::text
)
returns jsonb
language sql
stable
set search_path to ''
as $$
  select coalesce(
    jsonb_object_agg(
      t,
      public.search_hybrid(
        p_query => p_query,
        p_query_vec => p_query_vec,
        p_content_types => array[t],
        p_filters => p_filters,
        p_lat => p_lat,
        p_lng => p_lng,
        p_radius_km => p_radius_km,
        p_now => p_now,
        p_limit => p_limit,
        p_offset => p_offset,
        p_date_from => p_date_from,
        p_date_to => p_date_to,
        p_price_min => p_price_min,
        p_price_max => p_price_max,
        p_sort => p_sort
      )
    ),
    '{}'::jsonb
  )
  from (select distinct t from unnest(p_types) as u(t) where t is not null) s
$$;

revoke all on function public.search_hybrid_by_type(
  text[], text, extensions.vector, jsonb, double precision, double precision, double precision,
  timestamp with time zone, integer, integer, timestamp with time zone, timestamp with time zone,
  numeric, numeric, text
) from public, anon;
grant execute on function public.search_hybrid_by_type(
  text[], text, extensions.vector, jsonb, double precision, double precision, double precision,
  timestamp with time zone, integer, integer, timestamp with time zone, timestamp with time zone,
  numeric, numeric, text
) to service_role, authenticated;

do $verify$
declare
  v_fn oid := 'public.search_hybrid_by_type(text[], text, extensions.vector, jsonb, double precision, double precision, double precision, timestamp with time zone, integer, integer, timestamp with time zone, timestamp with time zone, numeric, numeric, text)'::regprocedure;
  v_res jsonb;
begin
  if (select prosecdef from pg_proc where oid = v_fn) then
    raise exception 'search_hybrid_by_type must be SECURITY INVOKER';
  end if;
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'search_hybrid_by_type must not be executable by anon';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'search_hybrid_by_type must be executable by service_role';
  end if;
  -- It answers per type, keyed by type, and ignores a NULL type.
  v_res := public.search_hybrid_by_type(array['guide', null, 'guide'], '');
  if v_res is null or jsonb_typeof(v_res) <> 'object' or (select count(*) from jsonb_object_keys(v_res)) <> 1
     or not (v_res ? 'guide') then
    raise exception 'search_hybrid_by_type returned an unexpected shape: %', left(coalesce(v_res::text, 'null'), 200);
  end if;
end
$verify$;
