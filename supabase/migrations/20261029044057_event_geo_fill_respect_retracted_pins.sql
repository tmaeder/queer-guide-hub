CREATE OR REPLACE FUNCTION public.run_event_geo_fill(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
 RETURNS TABLE(processed integer, coords_set integer, tz_set integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r          record;
  v_proc     integer := 0;
  v_coords   integer := 0;
  v_tz       integer := 0;
  v_new_tz   text;
  v_tz_src   text;
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
      -- A reviewed event may intentionally have no map pin. Cleanup records use
      -- retracted_wrong_city_centroid or retracted_unverified_event_point; neither
      -- may be reopened by the city-coordinate gap arm below (or by p_force).
      and coalesce(e.field_provenance->'latitude'->>'source', '') not like 'retracted_%'
      and coalesce(e.field_provenance->'longitude'->>'source', '') not like 'retracted_%'
      and (e.latitude is null or e.longitude is null or e.timezone is null)
      and (
            p_force
            or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_geo_fill')
            -- Re-open a visited row ONLY for a gap this pass can actually close. The
            -- UPDATE below sets latitude/longitude from the city whenever they are
            -- null and the city has them, so this arm stops matching the moment it is
            -- satisfied -- which is what bounds it without an attempts counter.
            or ((e.latitude is null or e.longitude is null)
                 and c.latitude is not null and c.longitude is not null)
            -- Same rule for the timezone, narrowed to the branch that is
            -- UNCONDITIONAL: `v_new_tz` takes `c_tz` whenever the city has one, with no
            -- reference to `c_multizone`. So this predicate needs no copy of that list
            -- and still guarantees the body closes what it selects. The country
            -- fallback IS multizone-dependent and is deliberately left out -- a
            -- predicate that claims fillable while the body computes null is the
            -- nightly loop this whole design avoids.
            or (e.timezone is null and nullif(btrim(c.timezone), '') is not null)
          )
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

    -- WHICH source it came from, because the two rot differently. A zone taken from
    -- the linked CITY is wrong the moment that link is quarantined as a namesake
    -- mislink; a zone taken from a single-timezone COUNTRY survives an unlink intact.
    -- Until this stamp existed the two were indistinguishable on the row, which is
    -- why a repair could only ever prove ONE of 24 surviving timezones wrong -- the
    -- cross-continent one -- and had to leave the rest alone.
    v_tz_src := case
      when v_new_tz is null then null
      when nullif(btrim(r.c_tz), '') is not null and v_new_tz = r.c_tz then 'derived:city_timezone'
      else 'derived:country_timezone'
    end;

    if v_new_tz is not null then v_tz := v_tz + 1; end if;
    if (r.latitude is null or r.longitude is null) and r.c_lat is not null and r.c_lng is not null then
      v_coords := v_coords + 1;
    end if;

    update public.events e set
      latitude  = case when e.latitude  is null then r.c_lat else e.latitude  end,
      longitude = case when e.longitude is null then r.c_lng else e.longitude end,
      timezone  = coalesce(e.timezone, v_new_tz),
      field_provenance =
        -- Coordinates: unchanged, still stamped as a city centroid so they are never
        -- mistaken for a real venue location.
        (case
          when e.latitude is null and r.c_lat is not null then
            coalesce(e.field_provenance, '{}'::jsonb)
              || jsonb_build_object(
                   'latitude',  jsonb_build_object('value', r.c_lat, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()),
                   'longitude', jsonb_build_object('value', r.c_lng, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()))
          else coalesce(e.field_provenance, '{}'::jsonb)
        end)
        -- Timezone: NEW. Stamped only when this statement is the one that sets it
        -- (`e.timezone is null`), so an existing zone from the source feed keeps its
        -- own provenance and is never relabelled as derived.
        || (case
             when e.timezone is null and v_new_tz is not null then
               jsonb_build_object('timezone', jsonb_build_object(
                 'value', v_new_tz, 'source', v_tz_src, 'confidence', 0.3, 'at', now()))
             else '{}'::jsonb
           end),
      enrichment_status = jsonb_set(
        coalesce(e.enrichment_status, '{}'::jsonb), '{event_geo_fill}',
        jsonb_build_object('at', now()), true)
    where e.id = r.id;
  end loop;

  processed := v_proc; coords_set := v_coords; tz_set := v_tz; return next;
end;
$function$;
revoke all on function public.run_event_geo_fill(integer,boolean) from public,anon,authenticated;
grant execute on function public.run_event_geo_fill(integer,boolean) to service_role;
