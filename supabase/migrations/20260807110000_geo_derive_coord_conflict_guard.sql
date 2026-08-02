-- ============================================================================
-- Address completeness: never copy from a city the coordinates disagree with
-- ----------------------------------------------------------------------------
-- Reported after the backfill: "some locations show up in the wrong city".
--
-- The wrong city LINKS are pre-existing (their updated_at predates this work by
-- months) and come from name matching: "San Lorenzo", "Wellington", "Victoria",
-- "Santa Rosa" and "Nelson" all exist in several countries, and the importers
-- picked the wrong one. Venues — whose city_id this work never wrote — have a
-- HIGHER mis-link rate (398/20,975 = 1.9%) than events (56/39,077 = 0.14%),
-- which is what rules this work out as the cause of the links themselves.
--
-- What this work DID do was make those bad links load-bearing. The state
-- propagation copied region_name from the mis-linked city, and the postal drain
-- reverse-geocoded coordinates that were sometimes equally wrong. Rows that were
-- merely INCOMPLETE before came out confidently WRONG:
--
--   Providencia, Chile      -> state "Trentino-Alto Adige/Sudtirol", postal 38123 (Italy)
--   Kailua-Kona, Hawaii     -> postal "491 00" (Czech format)
--   San Lorenzo, US         -> state "Oyam" (a district of Uganda)
--   Santa Rosa, California  -> linked to Santa Rosa BRAZIL, state "23"
--
-- The rule: copy nothing from a city that disagrees with the row's own ISO-2
-- country, or that sits more than 500km from its coordinates.
--
-- Distance alone is NOT the test, and a first cut using venue_coord_guard's
-- 25km threshold was wrong. Measured on production: of 289 venues 25-900km from
-- their linked city, 0 disagree on country — they are sprawling metros and rural
-- areas legitimately attached to a city (a bar 31km from central Houston is
-- still in Houston). Past ~900km it inverts: 75 of 109 disagree on country.
-- The 25km rule flagged 398 venues where only 202 are genuinely broken, and
-- stripped good state/postal from 274 legitimate ones.
--
-- Remediation applied alongside this migration: state/postal_code cleared and
-- needs_attention set on the 202 venues + 56 events that genuinely contradict
-- themselves; the 274 the first 25km cut over-flagged were restored and
-- re-queued for postal.
--
-- Note the first cleanup attempt silently reverted — nulling `state` fires this
-- very trigger, which re-derived it from the wrong city and refilled 316 of 383
-- rows inside the same statement. The guard has to land BEFORE the data fix.
-- ============================================================================

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

    -- country_id still follows the link: a mis-linked city is usually still in
    -- a plausible country, and country_id has a corroborating source (the ISO-2
    -- text) that state and city name do not.
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
