-- The last six comma-qualified birth-place city rows: drop the qualifier.
--
-- "Dearborn, Michigan", "Hudson, Wisconsin", "Norwalk, California",
-- "Sandusky, Ohio", "Hickory, North Carolina" and "Saint-Denis, Île-de-France"
-- are real, correctly located cities. They kept the qualifier because the bare
-- name is held in the same country by a different place (Dearborn, Missouri;
-- Hudson, New York; Norwalk, Connecticut; Sandusky, Michigan; a merged Hickory
-- row; a merged Saint-Denis row with Réunion coordinates).
--
-- That reason no longer holds: all three name-uniqueness indexes on cities
-- include COALESCE(region_code, '') -- idx_cities_name_country_unique,
-- uk_cities_country_name_active and cities_country_canonical_key_uniq -- and
-- every one of these six carries a region_code different from its namesake's
-- (US-MI vs US-MO, US-WI vs US-NY, US-CA vs US-CT, US-OH vs US-MI, US-NC vs
-- NULL, FR-IDF vs NULL). So the bare name is representable; only the rename is
-- missing. Slugs do not move; the qualified string is kept as a city_aliases
-- row and in field_provenance.
--
-- Each rename is guarded on the row still carrying the qualified name and its
-- region_code, and is skipped (not failed) if a unique index still objects, so
-- a concurrent change elsewhere cannot abort db push.

do $fix$
declare
  r record;
  v_id uuid;
begin
  perform set_config('app.actor', 'migration:99991791576204_city_region_qualified_bare_names', true);

  for r in
    select * from (values
      ('Dearborn, Michigan',          'Dearborn',    'US', 'US-MI'),
      ('Hudson, Wisconsin',           'Hudson',      'US', 'US-WI'),
      ('Norwalk, California',         'Norwalk',     'US', 'US-CA'),
      ('Sandusky, Ohio',              'Sandusky',    'US', 'US-OH'),
      ('Hickory, North Carolina',     'Hickory',     'US', 'US-NC'),
      ('Saint-Denis, Île-de-France',  'Saint-Denis', 'FR', 'FR-IDF')
    ) as t(old_name, new_name, cc, region_code)
  loop
    select c.id into v_id
      from public.cities c join public.countries co on co.id = c.country_id
     where c.name = r.old_name and co.code = r.cc
       and c.region_code = r.region_code
       and c.duplicate_of_id is null;
    if v_id is null then
      raise notice 'skip (row gone or changed): %', r.old_name;
      continue;
    end if;

    begin
      update public.cities set
        name = r.new_name,
        field_provenance = coalesce(field_provenance, '{}'::jsonb) || jsonb_build_object('name',
          jsonb_build_object('value', r.new_name, 'source', 'migration:99991791576204',
                             'original', r.old_name, 'method', 'region_code_disambiguates'))
      where id = v_id;
    exception when unique_violation then
      raise notice 'skip (name still collides): %', r.old_name;
      continue;
    end;

    insert into public.city_aliases (city_id, alias) values (v_id, r.old_name) on conflict do nothing;
  end loop;
end
$fix$;

do $verify$
declare
  v_bad int;
begin
  -- P1: a renamed row has no qualifier left and is still live.
  select count(*) into v_bad from public.cities c
   where c.field_provenance->'name'->>'source' = 'migration:99991791576204'
     and (c.name like '%,%' or c.duplicate_of_id is not null);
  if v_bad <> 0 then
    raise exception 'P1 failed: % renamed rows still carry a qualifier or were merged', v_bad;
  end if;

  -- P2: the namesakes the qualifier protected against were not touched.
  select count(*) into v_bad from public.cities c join public.countries co on co.id = c.country_id
   where co.code = 'US'
     and (c.name, c.region_code) in (('Dearborn','US-MO'), ('Hudson','US-NY'), ('Norwalk','US-CT'), ('Sandusky','US-MI'))
     and c.field_provenance->'name'->>'source' = 'migration:99991791576204';
  if v_bad <> 0 then
    raise exception 'P2 failed: % namesake rows were renamed by this migration', v_bad;
  end if;
end
$verify$;
