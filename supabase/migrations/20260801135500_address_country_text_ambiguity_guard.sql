-- Recovered from supabase_migrations.schema_migrations.statements.
-- Applied to production via MCP apply_migration, which stamps the version from its
-- own call timestamp — so it landed at 20260801135500 (2026-08-01), sorting BELOW the
-- 20260807* files this work intended, and left a remote-only version. db push then
-- skipped ENTIRELY and no merged migration applied. This file restores the pairing.

create or replace function public.country_code_is_ambiguous(p_code text)
returns boolean
language sql
immutable
parallel safe
as $$
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

  select co.id into v_id
    from public.countries co
   where upper(co.code) = upper(v_txt)
     and co.duplicate_of_id is null
   limit 1;

  if v_id is not null and public.country_code_is_ambiguous(v_txt) then
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

  if v_city_region is not null
     and (coalesce(btrim(new.state), '') = ''
          or (v_city_moved and new.state is not distinct from old.state)) then
    new.state := v_city_region;
  end if;

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

  new.safety_gated := public.location_is_high_risk(new.country_id, new.city_id);

  return new;
end;
$$;

comment on function public.derive_entity_geo_address() is
  'BEFORE trigger: fills country_id / state / city / country from the linked city and the country text (via the ambiguity-guarded resolve_country_from_text), re-deriving them when the row is relocated, then recomputes safety_gated. Explicit caller input always wins; an unresolvable country string never NULLs an existing FK.';
