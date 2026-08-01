-- Events geo backfill: city_id keystone + coordinate/timezone fill.
--
-- `events` already carries the derivation logic as triggers:
--   trg_events_geo_derive   (BEFORE INSERT OR UPDATE OF city_id, country_id, country, city, state)
--                           -> derive_entity_geo_address('full'): city_id -> country_id,
--                              cities.region_name -> state, and normalizes city/country
--   trg_events_set_currency (BEFORE INSERT OR UPDATE OF country_id, country)
--                           -> set_event_currency_from_country(): countries.currency -> currency
-- Rows imported before those triggers existed never got the treatment. The one derivation
-- with no trigger is city *text* -> city_id, so writing city_id is the keystone: it cascades
-- into country_id, state and currency for free.
--
-- Both runners are batched. Every events UPDATE fires trg_search_documents_event (~55ms/row),
-- so an unbatched 27k-row pass is ~25 minutes of DB time on this disk-constrained instance.
-- Both stamp enrichment_status so unmatched rows are not retried forever and the sweep
-- terminates instead of spinning on the same residue every night.

-- ---------------------------------------------------------------------------
-- 1. city_id from (country, city text)
-- ---------------------------------------------------------------------------
create or replace function public.run_event_city_link(
  p_batch integer default 300,
  p_force boolean default false
)
returns table(processed integer, linked integer)
language plpgsql
set search_path to 'public'
as $$
declare
  r        record;
  v_city   uuid;
  v_proc   integer := 0;
  v_linked integer := 0;
begin
  for r in
    select e.id, e.city, e.country, e.country_id
    from public.events e
    where e.duplicate_of_id is null
      and e.city_id is null
      and coalesce(btrim(e.city), '') <> ''
      and (p_force or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link'))
    order by (e.start_date >= now()) desc nulls last, e.start_date desc nulls last, e.id
    limit greatest(p_batch, 1)
  loop
    v_proc := v_proc + 1;

    -- Resolve within the claimed country only. Requiring the city to exist in that
    -- country is what keeps the rule self-validating: a bogus country code cannot
    -- silently adopt a city that does not belong to it.
    select c.id into v_city
    from public.cities c
    where c.duplicate_of_id is null
      and c.country_id = coalesce(
            r.country_id,
            (select co.id from public.countries co where upper(co.code) = upper(btrim(r.country)) limit 1)
          )
      and lower(btrim(c.name)) = lower(btrim(r.city))
    limit 1;

    if v_city is not null then
      v_linked := v_linked + 1;
    end if;

    -- Single write per row. Setting city_id lets the geo-derive and currency triggers
    -- fill country_id / state / city / country / currency on the same statement.
    update public.events set
      city_id = coalesce(v_city, city_id),
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{event_city_link}',
        jsonb_build_object('at', now(), 'linked', v_city is not null), true)
    where id = r.id;

    v_city := null;
  end loop;

  processed := v_proc; linked := v_linked; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. coordinates + timezone from the linked city
-- ---------------------------------------------------------------------------
-- derive_entity_geo_address() deliberately does not touch coordinates or timezone,
-- so they need their own pass once city_id is populated.
--
-- Timezone falls back to countries.timezone ONLY for single-timezone countries.
-- This exclusion is load-bearing: countries.timezone for US is 'America/New_York',
-- so a blanket country fallback would silently mislabel every Los Angeles event.
-- Multi-zone countries keep a null timezone, which reads correctly downstream --
-- effective_event_timezone() already coalesces to 'UTC'. There is no
-- timezone-from-coordinates lookup in this project and adding one is out of scope.
create or replace function public.run_event_geo_fill(
  p_batch integer default 300,
  p_force boolean default false
)
returns table(processed integer, coords_set integer, tz_set integer)
language plpgsql
set search_path to 'public'
as $$
declare
  r          record;
  v_proc     integer := 0;
  v_coords   integer := 0;
  v_tz       integer := 0;
  v_new_tz   text;
  -- ISO2 of countries spanning more than one IANA zone (incl. overseas territories
  -- administered under the same code). Over-inclusive on purpose: a null timezone
  -- is strictly better than a confidently wrong one.
  c_multizone constant text[] := array[
    'US','CA','AU','BR','RU','MX','ID','KZ','CD','CL','EC','ES','PT','FR','NZ',
    'MN','CN','GL','KI','PF','UM','AQ','PG','MH','FM','GB','NL','DK','PS'
  ];
begin
  for r in
    select e.id,
           e.latitude, e.longitude, e.timezone,
           c.latitude  as c_lat,
           c.longitude as c_lng,
           c.timezone  as c_tz,
           co.timezone as co_tz,
           co.code     as co_code
    from public.events e
    join public.cities c on c.id = e.city_id and c.duplicate_of_id is null
    left join public.countries co on co.id = e.country_id
    where e.duplicate_of_id is null
      and (e.latitude is null or e.longitude is null or e.timezone is null)
      and (p_force or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_geo_fill'))
    order by (e.start_date >= now()) desc nulls last, e.start_date desc nulls last, e.id
    limit greatest(p_batch, 1)
  loop
    v_proc := v_proc + 1;

    v_new_tz := case
      when r.timezone is not null then null
      when nullif(btrim(r.c_tz), '') is not null then r.c_tz
      when nullif(btrim(r.co_tz), '') is not null and not (r.co_code = any (c_multizone)) then r.co_tz
      else null
    end;

    if v_new_tz is not null then v_tz := v_tz + 1; end if;
    if (r.latitude is null or r.longitude is null) and r.c_lat is not null and r.c_lng is not null then
      v_coords := v_coords + 1;
    end if;

    update public.events e set
      latitude  = case when e.latitude  is null then r.c_lat else e.latitude  end,
      longitude = case when e.longitude is null then r.c_lng else e.longitude end,
      timezone  = coalesce(e.timezone, v_new_tz),
      -- Stamp the coordinates as a city centroid so they are never mistaken for a
      -- real venue location, and so any better source overwrites them.
      field_provenance = case
        when e.latitude is null and r.c_lat is not null then
          coalesce(e.field_provenance, '{}'::jsonb)
            || jsonb_build_object(
                 'latitude',  jsonb_build_object('value', r.c_lat, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()),
                 'longitude', jsonb_build_object('value', r.c_lng, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()))
        else coalesce(e.field_provenance, '{}'::jsonb)
      end,
      enrichment_status = jsonb_set(
        coalesce(e.enrichment_status, '{}'::jsonb), '{event_geo_fill}',
        jsonb_build_object('at', now()), true)
    where e.id = r.id;
  end loop;

  processed := v_proc; coords_set := v_coords; tz_set := v_tz; return next;
end;
$$;

revoke all on function public.run_event_city_link(integer, boolean) from public, anon, authenticated;
revoke all on function public.run_event_geo_fill(integer, boolean)  from public, anon, authenticated;
grant execute on function public.run_event_city_link(integer, boolean) to service_role;
grant execute on function public.run_event_geo_fill(integer, boolean)  to service_role;

comment on function public.run_event_city_link(integer, boolean) is
  'Batched: resolves events.city_id from (country, city text). Writing city_id cascades to country_id/state/city/country via trg_events_geo_derive and to currency via trg_events_set_currency.';
comment on function public.run_event_geo_fill(integer, boolean) is
  'Batched: fills events latitude/longitude from the linked city centroid (stamped in field_provenance) and timezone from cities.timezone, falling back to countries.timezone only for single-timezone countries.';
