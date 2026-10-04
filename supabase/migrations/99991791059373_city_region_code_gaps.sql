-- cities.region_code — close the gaps 99991790994947 left, and repair what it
-- got wrong.
--
-- WHY
-- 99991790994947 derived region_code from the free-text region_name and said
-- so: "1,849 cities have no region_name at all; filling those needs a
-- geocoder or Wikidata P131 and is its own step." Measured 2026-10-03 the gap
-- is NOT random — it is exactly the cities that ARE a first-level unit:
-- Berlin (910 venues) has no region_code although DE-BE is in the
-- vocabulary, and so do Hamburg, Bangkok, Tokyo, Prague, Seoul, Taipei,
-- Stockholm, Oslo, Dublin, Lisbon, Kuala Lumpur, Hanoi, Kyiv, Zagreb …
-- Every source that fills region_name leaves it empty for a city-state,
-- because the "region" would just repeat the city.
--
-- Reading the vocabulary for that also found four defects in the reference
-- data itself (dr5hn states.json, as generated):
--
--   * SELF-PARENTS. ES-O Asturias, ES-S Cantabria and ES-LO La Rioja list
--     themselves as parent (dr5hn carries the province and the autonomous
--     community under one ISO code). geo_subdivision_root() then returns
--     NULL, so "Asturias" resolved to {ES-AS, NULL} — two hits — and NULL.
--     99991790994947 recorded these as "dr5hn's duplicate old/new codes";
--     they are a loop, and the parent is the community.
--   * WRONG PARENTS. Eight Tuscan provinces (Grosseto, Livorno, Lucca,
--     Massa-Carrara, Pisa, Prato, Pistoia, Siena) hang under IT-UD — Udine,
--     in Friuli — and so resolve to IT-36, 300-400 km away. Badajoz hangs
--     under Andalusia (ES-AN); it is Extremadura (ES-EX), as Cáceres already
--     is. 0 cities carried these wrong codes yet (measured), so this is a
--     latent fix, not a repair.
--   * "Mexico City" -> MX-MEX (the State of México, a different unit). The
--     core arm strips "city", leaving "mexico", which is MX-MEX's alias. 5
--     cities, including Mexico City itself, carried it. MX-CMX gains the
--     English name, so the name arm answers first; MX-MEX gains "State of
--     Mexico", because once "mexico" is a core key of BOTH units the core arm
--     correctly refuses and the 4 "State of Mexico" cities would go NULL.
--     Every other core-arm assignment on record (~110 distinct values,
--     "Aichi Prefecture", "Kyiv Oblast", "Department of Lima" …) was read by
--     hand and is correct.
--   * CZ-10 carries only "Praha, Hlavní město" / "Praga, …", so the English
--     "Prague" matches nothing.
--
-- And the numeric region_name: ~990 cities (BR, AR, AO, AE, AF, AU, AT, BG …
-- — every country A-B, an import that stopped there) still show GeoNames
-- admin1 numbers ("27", "09") as their region name. region_code resolved
-- them correctly; the human-readable column was never written back. Vienna
-- reads "Vienna, 09".
--
-- WHAT THIS DOES
-- 1. Repairs the reference data (parents + aliases). The generator carries
--    the same fixes so a regeneration cannot undo them.
-- 2. Re-resolves every city whose region_name now resolves to a different
--    code (the Mexico City five; the Asturias / Cantabria / La Rioja rows).
-- 3. Fills region_code for cities whose OWN NAME is a subdivision of their
--    country — corroborated: that subdivision's centroid must lie within
--    100 km of the city, and every matching subdivision must climb to ONE
--    first-level unit. Measured on the 300 candidates: every match within
--    100 km is the right place; past it are only wrong centroids (GB-BOL
--    262 km) or wrong CITY coordinates (Taoyuan sits on Kaohsiung, Kinshasa
--    716 km out — both left NULL, see below). The bound is what stops
--    "Washington" becoming US-WA and "Kansas City" US-KS. Ambiguous names
--    (Almaty, Maputo: city and province with different roots) stay NULL.
--    region_name is filled only where empty, and only with a value that
--    resolves back to the same code, so the trigger stays consistent.
-- 4. Replaces numeric region_name with the subdivision name, only where that
--    name resolves back to the code the row already carries.
-- 5. Sentinel city_region_signals() for check-pipeline-health.mjs.
--
-- NOT DONE, NAMED
-- * Cities with no region_name whose name is NOT a subdivision (~1,500, most
--   placeholders) still need a geocoder or Wikidata P131.
-- * Taoyuan (TW) and Kinshasa (CD) carry wrong coordinates; the distance
--   gate refuses them, correctly. Their coordinates are the defect.
-- * venues/events/hotels.state copied "27"-style values from
--   cities.region_name at write time; derive_entity_geo_address fills empty
--   state only, so those copies are not touched here.
-- * Bangladesh's GeoNames numbers (80 cities, "81"-"87") have no dr5hn FIPS
--   mapping and stay as they are.

set local lock_timeout = '30s';
-- ~1,300 city UPDATEs, each fanning out through trg_sync_geo_spine into
-- search_reindex_queue (7.4 ms/row measured by 99991790994947).
set local statement_timeout = '5min';
select set_config('app.actor', 'migration:99991791059373_city_region_code_gaps', true);

-- ---------------------------------------------------------------------------
-- 1. Reference data
-- ---------------------------------------------------------------------------
update public.geo_subdivisions s
   set parent_code = v.parent
  from (values
    ('ES-O',  'ES-AS'), ('ES-S',  'ES-CB'), ('ES-LO', 'ES-RI'), ('ES-BA', 'ES-EX'),
    ('IT-GR', 'IT-52'), ('IT-LI', 'IT-52'), ('IT-LU', 'IT-52'), ('IT-MS', 'IT-52'),
    ('IT-PI', 'IT-52'), ('IT-PO', 'IT-52'), ('IT-PT', 'IT-52'), ('IT-SI', 'IT-52')
  ) as v(code, parent)
 where s.code = v.code
   and s.parent_code is distinct from v.parent
   and exists (select 1 from public.geo_subdivisions p where p.code = v.parent);

-- Any other self-parent dr5hn may grow: a unit is never its own parent.
update public.geo_subdivisions set parent_code = null where parent_code = code;

update public.geo_subdivisions s
   set aliases = (select array_agg(distinct a) from unnest(s.aliases || v.extra) a)
  from (values
    ('CZ-10',  array['Prague', 'Prag', 'Praha']),
    ('MX-CMX', array['Mexico City', 'CDMX']),
    ('MX-MEX', array['State of Mexico'])
  ) as v(code, extra)
 where s.code = v.code
   and not (v.extra <@ s.aliases);

update public.geo_subdivisions s
   set name_keys = k.name_keys,
       core_keys = k.core_keys
  from (
    select code,
           array_remove(array_agg(distinct public.geo_subdivision_norm(n)), null) as name_keys,
           array_remove(array_agg(distinct public.geo_subdivision_core(n)), null) as core_keys
      from public.geo_subdivisions, unnest(array[name] || aliases) as n
     where code in ('CZ-10', 'MX-CMX', 'MX-MEX')
     group by code
  ) k
 where k.code = s.code;

-- ---------------------------------------------------------------------------
-- 2. Re-resolve rows whose region_name now answers differently.
--    Explicit region_code writes win in cities_sync_region_code, so setting
--    the column directly does not re-enter the resolver.
-- ---------------------------------------------------------------------------
do $reresolve$
declare
  v_n int;
  v_total int := 0;
begin
  loop
    with todo as (
      select c.id, public.resolve_region_code(co.code, c.region_name) as rc, c.region_code as old
        from public.cities c
        join public.countries co on co.id = c.country_id
       where c.duplicate_of_id is null
         and nullif(btrim(c.region_name), '') is not null
    ), pick as (
      select id, rc from todo where rc is not null and rc is distinct from old limit 500
    )
    update public.cities c set region_code = pick.rc from pick where c.id = pick.id;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n = 0;
  end loop;
  raise notice 're-resolved % cities from region_name', v_total;
end
$reresolve$;

-- ---------------------------------------------------------------------------
-- 3. Cities that ARE a subdivision of their country.
-- ---------------------------------------------------------------------------
do $selfname$
declare
  v_n int;
begin
  create temp table _city_self_region on commit drop as
  with c as (
    select c.id, co.code as cc, c.latitude, c.longitude,
           public.geo_subdivision_norm(c.name) as nk,
           public.geo_subdivision_core(c.name) as ck
      from public.cities c
      join public.countries co on co.id = c.country_id
     where c.duplicate_of_id is null
       and c.region_code is null
       and c.latitude is not null and c.longitude is not null
  ), m as (
    select c.id, public.geo_subdivision_root(s.code) as root
      from c
      join public.geo_subdivisions s
        on s.country_code = c.cc
       and coalesce(s.subdivision_type, '') <> 'geographical unit'
       and s.latitude is not null and s.longitude is not null
       and (c.nk = any (s.name_keys) or c.ck = any (s.core_keys))
     where public.haversine_m(s.latitude, s.longitude, c.latitude, c.longitude) <= 100000
  )
  select id, min(root) as root
    from m
   group by id
  having count(distinct root) = 1 and bool_and(root is not null);

  update public.cities c
     set region_code = r.root,
         region_name = case
           when nullif(btrim(c.region_name), '') is null
            and public.resolve_region_code(co.code, s.name) = r.root
           then s.name
           else c.region_name
         end
    from _city_self_region r
    join public.geo_subdivisions s on s.code = r.root
    join public.countries co on co.code = s.country_code
   where c.id = r.id
     and co.id = c.country_id
     and c.region_code is null;
  get diagnostics v_n = row_count;
  raise notice 'region_code filled from the city''s own name on % cities', v_n;
end
$selfname$;

-- ---------------------------------------------------------------------------
-- 4. Numeric region_name -> the subdivision's name.
-- ---------------------------------------------------------------------------
do $numeric$
declare
  v_n int;
  v_total int := 0;
begin
  loop
    with pick as (
      select c.id, s.name
        from public.cities c
        join public.countries co on co.id = c.country_id
        join public.geo_subdivisions s on s.code = c.region_code
       where c.duplicate_of_id is null
         and c.region_name ~ '^\s*[0-9]+\s*$'
         and public.resolve_region_code(co.code, s.name) = c.region_code
       limit 500
    )
    update public.cities c set region_name = pick.name from pick where c.id = pick.id;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n = 0;
  end loop;
  raise notice 'numeric region_name replaced on % cities', v_total;
end
$numeric$;

-- ---------------------------------------------------------------------------
-- 5. Sentinel
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
         and public.resolve_region_code(l.cc, s.name) = l.region_code)
    -- region_name vs region_code agreement is deliberately NOT here: it calls
    -- resolve_region_code once per city (~1 ms each, measured 3.9 s for the
    -- corpus) against PostgREST's 8 s ceiling. trg_cities_ab_region_code keeps
    -- them in step by construction; this file asserts it once, below.
  );
$$;

revoke all on function public.city_region_signals() from public, anon, authenticated;
grant execute on function public.city_region_signals() to service_role;

comment on function public.city_region_signals() is
  'Health probe for cities.region_code (99991791059373). Zero-invariants: subdivision_root_null, '
  'region_code_wrong_country, numeric_region_name_resolvable. '
  'real_without_region_code is advisory. Read by scripts/check-pipeline-health.mjs.';

-- ---------------------------------------------------------------------------
-- Postconditions — END STATE, not counts of this file's own writes.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_n   int;
  v_sig jsonb;
  r     record;
begin
  -- P1: the hierarchy has no loops and every unit climbs to a root.
  select count(*) into v_n from public.geo_subdivisions where parent_code = code;
  if v_n <> 0 then raise exception 'P1 failed: % self-parent subdivisions', v_n; end if;
  select count(*) into v_n from public.geo_subdivisions where public.geo_subdivision_root(code) is null;
  if v_n <> 0 then raise exception 'P1 failed: % subdivisions without a root', v_n; end if;

  -- P2: the repaired resolutions, plus regression controls from 99991790994947.
  for r in select * from (values
      ('ES', 'Asturias',        'ES-AS'), ('ES', 'Cantabria', 'ES-CB'), ('ES', 'La Rioja', 'ES-RI'),
      ('ES', 'Badajoz',         'ES-EX'), ('IT', 'Livorno',   'IT-52'), ('IT', 'Siena',    'IT-52'),
      ('MX', 'Mexico City',     'MX-CMX'), ('MX', 'State of Mexico', 'MX-MEX'), ('MX', 'Jalisco', 'MX-JAL'),
      ('CZ', 'Prague',          'CZ-10'),
      ('US', 'California',      'US-CA'), ('DE', 'Bayern', 'DE-BY'), ('AU', '02', 'AU-NSW'),
      ('BE', 'Antwerp',         'BE-VLG'), ('JP', 'Aichi Prefecture', 'JP-23')
    ) as t(cc, txt, want)
  loop
    if public.resolve_region_code(r.cc, r.txt) is distinct from r.want then
      raise exception 'P2 failed: resolve_region_code(%, %) = %, want %',
        r.cc, r.txt, public.resolve_region_code(r.cc, r.txt), r.want;
    end if;
  end loop;
  if public.resolve_region_code('GB', 'South Carolina') is not null then
    raise exception 'P2 failed: crossed a border';
  end if;

  -- P3: named cities — the reason this file exists, and two places the
  --     distance gate must keep out of the wrong unit.
  for r in select * from (values
      ('Berlin', 'DE', 'DE-BE'), ('Hamburg', 'DE', 'DE-HH'), ('Bangkok', 'TH', 'TH-10'),
      ('Tokyo',  'JP', 'JP-13'), ('Vienna',  'AT', 'AT-9'),  ('Mexico City', 'MX', 'MX-CMX'),
      ('Washington, D.C.', 'US', 'US-DC')
    ) as t(name, cc, want)
  loop
    select count(*) into v_n
      from public.cities c join public.countries co on co.id = c.country_id
     where c.duplicate_of_id is null and c.name = r.name and co.code = r.cc;
    if v_n = 0 then
      raise notice 'P3: % (%) not present — control skipped', r.name, r.cc;
      continue;
    end if;
    select count(*) into v_n
      from public.cities c join public.countries co on co.id = c.country_id
     where c.duplicate_of_id is null and c.name = r.name and co.code = r.cc
       and c.region_code is distinct from r.want;
    if v_n <> 0 then
      raise exception 'P3 failed: % (%) does not carry %', r.name, r.cc, r.want;
    end if;
  end loop;
  -- "Kansas City" strips to "kansas": it must never land in Kansas by name alone.
  select count(*) into v_n
    from public.cities c join public.countries co on co.id = c.country_id
   where c.duplicate_of_id is null and c.name = 'Kansas City' and co.code = 'US'
     and c.region_code = 'US-KS' and c.region_name is distinct from 'Kansas';
  if v_n <> 0 then raise exception 'P3 failed: Kansas City placed in Kansas by its name'; end if;
  select count(*) into v_n
    from public.cities c join public.countries co on co.id = c.country_id
   where c.duplicate_of_id is null and c.name = 'Vienna' and co.code = 'AT'
     and c.region_name ~ '^\s*[0-9]+\s*$';
  if v_n <> 0 then raise exception 'P3 failed: Vienna still shows a numeric region_name'; end if;

  -- P4: the sentinel's zero-invariants hold, and it measured something.
  v_sig := public.city_region_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true
     or (v_sig->>'cities_live')::int < 1000 then
    raise exception 'P4 failed: sentinel measured nothing: %', v_sig;
  end if;
  if (v_sig->>'subdivision_root_null')::int <> 0
     or (v_sig->>'region_code_wrong_country')::int <> 0
     or (v_sig->>'numeric_region_name_resolvable')::int <> 0 then
    raise exception 'P4 failed: zero-invariant broken: %', v_sig;
  end if;

  -- P5: every region_name that resolves agrees with the stored code.
  select count(*) into v_n
    from public.cities c
    join public.countries co on co.id = c.country_id
   cross join lateral (select public.resolve_region_code(co.code, c.region_name) as rc) x
   where c.duplicate_of_id is null
     and nullif(btrim(c.region_name), '') is not null
     and x.rc is not null
     and x.rc is distinct from c.region_code;
  if v_n <> 0 then
    raise exception 'P5 failed: % cities whose region_name resolves to a different code', v_n;
  end if;

  -- P6: anon cannot call the sentinel.
  if has_function_privilege('anon', 'public.city_region_signals()', 'EXECUTE') then
    raise exception 'P6 failed: anon can execute city_region_signals()';
  end if;
end
$verify$;
