-- venues / events / hotels / organizations .state — replace GeoNames numbers
-- ("27", "09") with the region's name.
--
-- WHY
-- derive_entity_geo_address() fills an empty `state` from the linked city's
-- region_name. Until 99991791059373 about 1,000 cities carried a GeoNames
-- admin1 NUMBER there (every country A-B: São Paulo "27", Vienna "09",
-- Dubai "03"), so every venue, event, hotel and organization written in those
-- cities copied the number. 99991791059373 fixed the cities; the copies stay,
-- because the derive trigger only fills EMPTY columns.
--
-- Measured 2026-10-04: venues 2,318, events 1,346, organizations 277,
-- hotels 8 carry a digits-only state. For 3,924 of the 3,947 that have a city
-- the number resolves (resolve_region_code, FIPS arm) to EXACTLY the
-- region_code the linked city carries — two independent signals, and ZERO
-- disagree. The other 23 do not resolve at all (Bangladesh: dr5hn carries no
-- FIPS mapping for its GeoNames numbers) and are left as they are.
--
-- WHAT THIS DOES
-- Writes the city's region_name into `state` where
--   (a) state is digits only,
--   (b) state resolves to the city's region_code, and
--   (c) the city's region_name resolves back to that same code
-- — so the value written is the one the derive trigger would write today,
-- and a row is only touched when the number and the city agree. Batched at
-- 300: every venues/events UPDATE fans out through the search-document sync.
--
-- city_region_signals() gains `entity_numeric_state_resolvable` (zero-
-- invariant): a numeric state that a city could name means a writer copied a
-- number again.

set local statement_timeout = '10min';
select set_config('app.actor', 'migration:99991791148433_entity_numeric_state', true);

do $fix$
declare
  v_table text;
  v_n     int;
  v_total int;
begin
  foreach v_table in array array['venues', 'events', 'hotels', 'organizations'] loop
    v_total := 0;
    loop
      execute format($q$
        with pick as (
          select e.id, c.region_name
            from public.%1$I e
            join public.cities c on c.id = e.city_id
            join public.countries co on co.id = coalesce(e.country_id, c.country_id)
           where e.state ~ '^\s*[0-9]+\s*$'
             and c.region_code is not null
             and nullif(btrim(c.region_name), '') is not null
             and public.resolve_region_code(co.code, btrim(e.state)) = c.region_code
             and public.resolve_region_code(co.code, c.region_name) = c.region_code
           limit 300
        )
        update public.%1$I e set state = pick.region_name from pick where e.id = pick.id
      $q$, v_table);
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
      exit when v_n = 0;
    end loop;
    raise notice '%: numeric state replaced on % rows', v_table, v_total;
  end loop;
end
$fix$;

-- ---------------------------------------------------------------------------
-- Sentinel: restated from 99991791059373 with one added key.
-- ---------------------------------------------------------------------------
create or replace function public.city_region_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with live as (
    select c.id, c.region_name, c.region_code, c.shell_status, co.code as cc
      from public.cities c
      join public.countries co on co.id = c.country_id
     where c.duplicate_of_id is null
       and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
  ), numeric_state as (
    select e.state, e.city_id, e.country_id from public.venues e where e.state ~ '^\s*[0-9]+\s*$'
    union all select e.state, e.city_id, e.country_id from public.events e where e.state ~ '^\s*[0-9]+\s*$'
    union all select e.state, e.city_id, e.country_id from public.hotels e where e.state ~ '^\s*[0-9]+\s*$'
    union all select e.state, e.city_id, e.country_id from public.organizations e where e.state ~ '^\s*[0-9]+\s*$'
  )
  select jsonb_build_object(
    'probe_ok', true,
    'subdivisions', (select count(*) from public.geo_subdivisions),
    'cities_live', (select count(*) from live),
    'real_cities', (select count(*) from live where shell_status = 'real'),
    -- advisory: needs a geocoder / P131 to close
    'real_without_region_code', (select count(*) from live where shell_status = 'real' and region_code is null),
    -- zero-invariants
    'subdivision_root_null', (select count(*) from public.geo_subdivisions where public.geo_subdivision_root(code) is null),
    'region_code_wrong_country', (
      select count(*) from live l join public.geo_subdivisions s on s.code = l.region_code
       where s.country_code <> l.cc),
    'numeric_region_name_resolvable', (
      select count(*) from live l join public.geo_subdivisions s on s.code = l.region_code
       where l.region_name ~ '^\s*[0-9]+\s*$'
         and public.resolve_region_code(l.cc, s.name) = l.region_code),
    'entity_numeric_state_resolvable', (
      select count(*) from numeric_state n
        join public.cities c on c.id = n.city_id
        join public.countries co on co.id = coalesce(n.country_id, c.country_id)
       where c.region_code is not null
         and public.resolve_region_code(co.code, btrim(n.state)) = c.region_code)
    -- region_name vs region_code agreement is deliberately NOT here: it calls
    -- resolve_region_code once per city (~1 ms each, measured 3.9 s for the
    -- corpus) against PostgREST's 8 s ceiling. trg_cities_ab_region_code keeps
    -- them in step by construction; 99991791059373 asserted it once.
  );
$$;

revoke all on function public.city_region_signals() from public, anon, authenticated;
grant execute on function public.city_region_signals() to service_role;

comment on function public.city_region_signals() is
  'Health probe for cities.region_code (99991791059373, 99991791148433). Zero-invariants: subdivision_root_null, '
  'region_code_wrong_country, numeric_region_name_resolvable, entity_numeric_state_resolvable. '
  'real_without_region_code is advisory. Read by scripts/check-pipeline-health.mjs.';

-- ---------------------------------------------------------------------------
-- Postconditions — END STATE.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_sig jsonb;
  v_n   int;
begin
  v_sig := public.city_region_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true
     or (v_sig->>'cities_live')::int < 1000 then
    raise exception 'P1 failed: sentinel measured nothing: %', v_sig;
  end if;
  if (v_sig->>'entity_numeric_state_resolvable') is null
     or (v_sig->>'entity_numeric_state_resolvable')::int <> 0 then
    raise exception 'P1 failed: numeric state still resolvable: %', v_sig;
  end if;
  if (v_sig->>'subdivision_root_null')::int <> 0
     or (v_sig->>'region_code_wrong_country')::int <> 0
     or (v_sig->>'numeric_region_name_resolvable')::int <> 0 then
    raise exception 'P1 failed: an earlier zero-invariant broke: %', v_sig;
  end if;

  -- (No "no empty state" check here: one pre-existing row already carries an
  -- empty string, unrelated to this file. The fix cannot write one — it
  -- requires a non-blank region_name that resolves to the city's code.)

  if has_function_privilege('anon', 'public.city_region_signals()', 'EXECUTE') then
    raise exception 'P2 failed: anon can execute city_region_signals()';
  end if;
end
$verify$;
