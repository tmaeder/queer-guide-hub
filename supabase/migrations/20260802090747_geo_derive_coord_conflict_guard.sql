-- RECOVERED from supabase_migrations.schema_migrations (applied 2026-08-02 09:07:47).
-- Transcribed verbatim from the recorded `statements`; no edits. It was applied
-- live via MCP apply_migration, which stamps its own timestamp, so no repo file
-- was ever created and `check-migration-drift` failed every PR in the repo.
--
-- Superseded ~6 minutes later by 20260802091345, which replaces the pure-distance
-- conflict test with a country-disagreement test. Kept anyway: the file must exist
-- for every APPLIED version, or replaying the history from scratch does not
-- reproduce production.

create or replace function public.derive_entity_geo_address()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_shape           text := coalesce(tg_argv[0], 'full');
  v_upd             boolean := (tg_op = 'UPDATE');
  v_fk_explicit     boolean := false;
  v_city_moved      boolean := false;
  v_country_retyped boolean := false;
  v_city_name       text;
  v_city_country_id uuid;
  v_city_region     text;
  v_city_lat        numeric;
  v_city_lng        numeric;
  v_country_id      uuid;
  v_conflict        boolean := false;
begin
  if v_upd then
    v_fk_explicit := new.country_id is distinct from old.country_id;
    v_city_moved  := new.city_id    is distinct from old.city_id;
    if v_shape = 'full' then
      v_country_retyped := new.country is distinct from old.country;
    end if;
  end if;

  if new.city_id is not null then
    select c.name, c.country_id, c.region_name, c.latitude, c.longitude
      into v_city_name, v_city_country_id, v_city_region, v_city_lat, v_city_lng
      from public.cities c
     where c.id = new.city_id;

    if v_city_country_id is not null
       and (new.country_id is null or (v_city_moved and not v_fk_explicit)) then
      new.country_id := v_city_country_id;
    end if;
  end if;

  -- Does the row's OWN position contradict the city it is linked to?
  -- Same 25km threshold venue_coord_guard uses. When they disagree we cannot
  -- tell which side is wrong, so we must not copy anything from the city.
  -- Filling state/city from a mis-linked city is how "Providencia, Chile" came
  -- to carry the region "Trentino-Alto Adige" and "Kailua-Kona" a Czech
  -- postcode. The 'minimal' shape (organizations) has no coordinate columns,
  -- so the whole test is nested under the shape check -- PL/pgSQL prepares a
  -- boolean expression as ONE statement and would resolve new.latitude anyway.
  if v_shape = 'full' and v_city_lat is not null and v_city_lng is not null then
    if new.latitude is not null and new.longitude is not null then
      if extensions.ST_Distance(
           extensions.ST_MakePoint(new.longitude::float8, new.latitude::float8)::extensions.geography,
           extensions.ST_MakePoint(v_city_lng::float8, v_city_lat::float8)::extensions.geography
         ) > 25000 then
        v_conflict := true;
      end if;
    end if;
  end if;

  if v_shape = 'full' then
    if coalesce(btrim(new.country), '') <> ''
       and (new.country_id is null
            or (v_country_retyped and not v_fk_explicit and not v_city_moved)) then
      v_country_id := public.resolve_country_from_text(new.country, new.city);
      if v_country_id is not null then
        new.country_id := v_country_id;
      end if;
    end if;
  end if;

  if v_city_region is not null and not v_conflict
     and (coalesce(btrim(new.state), '') = ''
          or (v_city_moved and new.state is not distinct from old.state)) then
    new.state := v_city_region;
  end if;

  if v_shape = 'full' then
    if v_city_name is not null and not v_conflict
       and (coalesce(btrim(new.city), '') = ''
            or (v_city_moved and new.city is not distinct from old.city)) then
      new.city := v_city_name;
    end if;
    if new.country_id is not null
       and (coalesce(btrim(new.country), '') = ''
            or (v_upd and not v_country_retyped
                and new.country_id is distinct from old.country_id)) then
      select co.code into new.country
        from public.countries co
       where co.id = new.country_id;
    end if;
  end if;

  new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);

  return new;
end;
$$;

comment on function public.derive_entity_geo_address() is
  'BEFORE trigger: fills country_id / state / city / country from the linked city and the ambiguity-guarded country text, then recomputes safety_gated. Copies NOTHING from a city whose position contradicts the row own coordinates by more than 25km - that conflict must be resolved by a human, not papered over. Explicit caller input always wins.';
