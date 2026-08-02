-- RECOVERED from supabase_migrations.schema_migrations (applied 2026-08-02 09:13:45).
-- Transcribed verbatim from the recorded `statements`; no edits. Applied live via
-- MCP apply_migration, which stamps its own timestamp, so no repo file was ever
-- created and `check-migration-drift` failed every PR in the repo.
--
-- This is the CURRENT production definition of derive_entity_geo_address(); it
-- supersedes 20260802090747 (pure-distance conflict test) with a
-- country-disagreement test plus a 500km distance backstop.

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
  v_city_cc         text;
  v_country_id      uuid;
  v_conflict        boolean := false;
  v_km              double precision;
begin
  if v_upd then
    v_fk_explicit := new.country_id is distinct from old.country_id;
    v_city_moved  := new.city_id    is distinct from old.city_id;
    if v_shape = 'full' then
      v_country_retyped := new.country is distinct from old.country;
    end if;
  end if;

  if new.city_id is not null then
    select c.name, c.country_id, c.region_name, c.latitude, c.longitude, co.code
      into v_city_name, v_city_country_id, v_city_region, v_city_lat, v_city_lng, v_city_cc
      from public.cities c
      left join public.countries co on co.id = c.country_id
     where c.id = new.city_id;

    if v_city_country_id is not null
       and (new.country_id is null or (v_city_moved and not v_fk_explicit)) then
      new.country_id := v_city_country_id;
    end if;
  end if;

  -- Self-contradiction test.
  --
  -- Distance ALONE is the wrong signal: measured on production, venues 25-900km
  -- from their linked city almost never disagree on country (0 of 289) -- they
  -- are sprawling metros and rural areas legitimately attached to a city.
  -- Past ~900km the picture flips: 75 of 109 disagree on country. So the primary
  -- test is country disagreement, with a large distance as the backstop for a
  -- wrong city WITHIN one country.
  --
  -- The 'minimal' shape (organizations) has no coordinate or country-text
  -- columns, so everything is nested under the shape check -- PL/pgSQL prepares
  -- a boolean expression as ONE statement and would resolve new.latitude even
  -- when the left side is false.
  if v_shape = 'full' then
    if v_city_cc is not null and coalesce(btrim(new.country), '') <> ''
       and upper(btrim(new.country)) <> upper(v_city_cc) then
      v_conflict := true;
    end if;

    if not v_conflict and v_city_lat is not null and v_city_lng is not null
       and new.latitude is not null and new.longitude is not null then
      v_km := extensions.ST_Distance(
                extensions.ST_MakePoint(new.longitude::float8, new.latitude::float8)::extensions.geography,
                extensions.ST_MakePoint(v_city_lng::float8, v_city_lat::float8)::extensions.geography
              ) / 1000.0;
      if v_km > 500 then
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
  'BEFORE trigger: fills country_id / state / city / country from the linked city and the ambiguity-guarded country text, then recomputes safety_gated. Copies NOTHING from a city that disagrees with the row own ISO-2 country, or sits >500km from its coordinates. Distance alone is not the test - 25-900km disagreements are almost always legitimate metro sprawl.';
