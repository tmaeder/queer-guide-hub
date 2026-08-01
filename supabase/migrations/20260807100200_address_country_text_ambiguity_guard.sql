-- ============================================================================
-- Address completeness (2b/3): refuse to guess when a "country" is really a
-- US/Canadian state code
-- ----------------------------------------------------------------------------
-- Resolving country_id from the free-text country column is what fixed ~26,800
-- events. But `events.country` is dirty: some sources put a STATE code there.
-- Two dozen US/CA state abbreviations are also valid ISO-3166 country codes, so
-- a naive `upper(code) = upper(country)` produced confidently wrong answers.
-- Observed on production after the first backfill pass:
--
--   Agawam,        country='MA' -> Morocco        (Massachusetts)
--   Sturgis,       country='SD' -> Sudan          (South Dakota)
--   Blacksburg,    country='VA' -> Vatican City   (Virginia)
--   Tuscaloosa,    country='AL' -> Albania        (Alabama)
--   Gettysburg,    country='PA' -> Panama         (Pennsylvania)
--   Winston-Salem, country='NC' -> New Caledonia  (North Carolina)
--   Petaluma,      country='CA' -> Canada         (California)
--
-- Four of those (MA/SD -> Morocco/Sudan) are criminalizing countries, so the
-- safety layer gated real US events — wrong data AND wrong visibility.
--
-- The fix is corroboration, not a bigger alias table: an ambiguous two-letter
-- code is only accepted when the row's own city text is a known city of that
-- country. 'DE' + Berlin still resolves to Germany (558 events). 'MA' + Agawam
-- resolves to nothing and stays NULL.
--
-- NULL is the correct answer here. A wrong country is worse than an unknown
-- one: it drives safety_gated, currency, and every geo rollup.
-- ============================================================================

create or replace function public.country_code_is_ambiguous(p_code text)
returns boolean
language sql
immutable
parallel safe
as $$
  -- ISO-3166 alpha-2 codes that are ALSO US state / Canadian province
  -- abbreviations. Membership here does not reject a code; it only demands
  -- corroboration before it is believed.
  select upper(btrim(coalesce(p_code,''))) in (
    'AL','AR','CA','CO','DE','GA','IA','ID','IN','LA','MA','MD','ME','MI','MN',
    'MO','MS','MT','NC','ND','NE','NV','OH','OK','OR','PA','SC','SD','TN','VA',
    'VI','WA','WI','WY','AB','BC','NL','NS','PE','ON','QC','SK','NB','NT','NU','YT'
  );
$$;

comment on function public.country_code_is_ambiguous(text) is
  'True when a 2-letter code is both a valid ISO country code and a US state / Canadian province abbreviation. Such codes need city corroboration before being trusted as a country.';

create or replace function public.resolve_country_from_text(p_country text, p_city text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_txt  text := nullif(btrim(coalesce(p_country,'')), '');
  v_city text := nullif(btrim(coalesce(p_city,'')), '');
  v_id   uuid;
begin
  if v_txt is null then return null; end if;

  -- Exact ISO-2 code
  select co.id into v_id
    from public.countries co
   where upper(co.code) = upper(v_txt)
     and co.duplicate_of_id is null
   limit 1;

  if v_id is not null and public.country_code_is_ambiguous(v_txt) then
    -- Believe it only if this row's city is actually a city of that country.
    -- No city text at all => no corroboration possible => refuse.
    if v_city is null
       or not exists (
         select 1 from public.cities c
          where lower(c.name) = lower(v_city)
            and c.country_id = v_id
            and c.duplicate_of_id is null
       )
    then
      return null;
    end if;
  end if;

  if v_id is not null then return v_id; end if;

  -- Full country name. Only sensible for strings longer than a code, which
  -- also sidesteps the 2-letter ambiguity entirely.
  if length(v_txt) > 2 then
    select co.id into v_id
      from public.countries co
     where lower(co.name) = lower(v_txt)
       and co.duplicate_of_id is null
     limit 1;
  end if;

  return v_id;
end;
$$;

comment on function public.resolve_country_from_text(text, text) is
  'Resolve a free-text country (ISO-2 code or full name) to countries.id, refusing ambiguous US-state-vs-country codes unless the accompanying city corroborates them. Returns NULL rather than guessing.';

revoke all on function public.resolve_country_from_text(text, text) from public, anon;
grant execute on function public.resolve_country_from_text(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Route the derive trigger through the guarded resolver
-- ---------------------------------------------------------------------------
create or replace function public.derive_entity_geo_address()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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
  v_country_id      uuid;
begin
  if v_upd then
    v_fk_explicit := new.country_id is distinct from old.country_id;
    v_city_moved  := new.city_id    is distinct from old.city_id;
    if v_shape = 'full' then
      v_country_retyped := new.country is distinct from old.country;
    end if;
  end if;

  -- (a) country_id from the linked city — most specific wins.
  if new.city_id is not null then
    select c.name, c.country_id, c.region_name
      into v_city_name, v_city_country_id, v_city_region
      from public.cities c
     where c.id = new.city_id;

    if v_city_country_id is not null
       and (new.country_id is null or (v_city_moved and not v_fk_explicit)) then
      new.country_id := v_city_country_id;
    end if;
  end if;

  -- (b) country_id from the country text, via the corroborating resolver.
  --     The v_shape test MUST be its own outer IF — PL/pgSQL prepares a whole
  --     boolean expression as ONE SQL statement, so `v_shape = 'full' and ...
  --     new.country ...` still resolves new.country for the 'minimal' shape and
  --     dies with 'record "new" has no field "country"' on organizations.
  if v_shape = 'full' then
    if coalesce(btrim(new.country), '') <> ''
       and (new.country_id is null
            or (v_country_retyped and not v_fk_explicit and not v_city_moved)) then
      v_country_id := public.resolve_country_from_text(new.country, new.city);
      -- Only adopt a successful resolution; an unrecognised or ambiguous
      -- string must not NULL out an existing good FK.
      if v_country_id is not null then
        new.country_id := v_country_id;
      end if;
    end if;
  end if;

  -- (c) state from the city's region.
  if v_city_region is not null
     and (coalesce(btrim(new.state), '') = ''
          or (v_city_moved and new.state is not distinct from old.state)) then
    new.state := v_city_region;
  end if;

  -- (d) text mirrors, only where the columns exist
  if v_shape = 'full' then
    if v_city_name is not null
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

  -- (e) keep the safety gate honest — trg_*_safety_gated is scoped to
  --     country_id/city_id and cannot see a country-text-only update.
  new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);

  return new;
end;
$$;

comment on function public.derive_entity_geo_address() is
  'BEFORE trigger: fills country_id / state / city / country from the linked city and the country text (via the ambiguity-guarded resolve_country_from_text), re-deriving them when the row is relocated, then recomputes safety_gated. Explicit caller input always wins; an unresolvable country string never NULLs an existing FK.';
