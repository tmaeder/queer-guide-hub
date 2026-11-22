-- Follow-up to 99991795377933_venue_source_position_restore: Hokuoukan, the
-- one row that migration's selection missed.
--
-- Its spartacus source names the city "Osaka, Osaka Kita" (Doyama-cho, Kita-ku)
-- with coordinates 1.5 km from Osaka's centre; the venue sat in Tokyo, 396 km
-- away. The selection matched the source city by exact name, so the
-- comma-qualified "Osaka, Osaka Kita" never joined a cities row. Matching on the
-- part before the first comma finds this row and no other (measured 2026-11-22).
--
-- Same repair, same postconditions: source coordinates and city, the venue's own
-- identity org moved first, postal cleared, timezone from the city.
-- safety_gated (a sauna in Japan) re-derives by trigger.

create temp table _vspr (
  venue_id uuid primary key,
  slug text not null,
  source_id uuid not null,
  city_id uuid not null,
  lat numeric not null,
  lng numeric not null
) on commit drop;

insert into _vspr (venue_id, slug, source_id, city_id, lat, lng) values
    ('36b4ddd1-3c7a-4848-9a66-ba19ca766f33'::uuid, 'hokuoukan', 'eb4200bd-5732-4c50-a7d6-1a0a6f4a1327'::uuid, '4b11a2c6-ce7f-4eaa-a6eb-42a8bb738935'::uuid, 34.7053617, 135.5100252);

do $pre$
begin
  if (select count(*) from _vspr) <> 1 then
    raise exception 'venue_source_position_restore_osaka: frozen list is not 1 row';
  end if;
  -- A typo in the file, not a corpus state: every target city must exist and be live.
  if exists (select 1 from _vspr f left join public.cities c on c.id = f.city_id
             where c.id is null or c.duplicate_of_id is not null or c.latitude is null) then
    raise exception 'venue_source_position_restore_osaka: a target city is missing, merged or has no coordinates';
  end if;
end $pre$;

select set_config('app.actor', 'migration:99991795378654_venue_source_position_restore_osaka', true);

-- The venue-identity organization above each venue (minted by the spine
-- backfill) mirrors the venue's wrong location. sync_entity_location_to_organization
-- only FILLS empty org fields, so it would keep the wrong coordinates beside the
-- corrected city and assert_entity_location_consistency rejects that. Move the
-- org first — only an org that belongs to this venue alone (the sync's own
-- eligibility) and still sits where the venue wrongly sat.
update public.organizations o set
  latitude = f.lat,
  longitude = f.lng,
  city_id = f.city_id,
  country_id = c.country_id,
  postal_code = null,
  timezone = null,
  updated_at = now()
from _vspr f
join public.venues v on v.id = f.venue_id
join public.cities c on c.id = f.city_id
where o.id = v.organization_id
  and o.duplicate_of_id is null
  and v.duplicate_of_id is null
  and (o.primary_venue_id = v.id
       or (o.primary_venue_id is null
           and not exists (select 1 from public.venues v2 where v2.organization_id = o.id
                           and v2.id <> v.id and v2.duplicate_of_id is null)
           and not exists (select 1 from public.hotels h where h.organization_id = o.id
                           and h.duplicate_of_id is null)))
  and (o.latitude is null or o.longitude is null or v.latitude is null or v.longitude is null
       or public.haversine_m(o.latitude::numeric, o.longitude::numeric, v.latitude, v.longitude) <= 1000)
  and (v.latitude is null or v.longitude is null
       or public.haversine_m(v.latitude, v.longitude, f.lat, f.lng) > 50000
       or v.city_id is distinct from f.city_id);

update public.venues v set
  latitude = f.lat,
  longitude = f.lng,
  city_id = c.id,
  city = c.name,
  state = case when c.region_name ~ '^[0-9]+$' then null else nullif(btrim(c.region_name), '') end,
  country_id = c.country_id,
  country = co.code,
  timezone = c.timezone,
  postal_code = null,
  address = coalesce(nullif(btrim(v.address), ''),
                     nullif(btrim(s.payload->'normalized'->'location'->>'address'), '')),
  queer_village_id = case
    when v.queer_village_id is null then null
    when exists (select 1 from public.queer_villages q where q.id = v.queer_village_id and q.city_id = c.id)
      then v.queer_village_id
    else null end,
  enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
    'source_position_restore', jsonb_build_object(
      'at', now(),
      'by', 'migration:99991795378654',
      'source_id', f.source_id,
      'previous', jsonb_build_object(
        'latitude', v.latitude, 'longitude', v.longitude, 'city_id', v.city_id,
        'city', v.city, 'state', v.state, 'country_id', v.country_id,
        'postal_code', v.postal_code, 'address', v.address,
        'queer_village_id', v.queer_village_id))),
  updated_at = now()
from _vspr f
join public.cities c on c.id = f.city_id
join public.countries co on co.id = c.country_id
join public.venue_sources s on s.id = f.source_id
where v.id = f.venue_id
  and v.duplicate_of_id is null
  and (v.latitude is null or v.longitude is null
       or public.haversine_m(v.latitude, v.longitude, f.lat, f.lng) > 50000
       or v.city_id is distinct from f.city_id);

do $verify$
declare v_bad int; v_done int;
begin
  -- P1: every frozen row is at its source point and on its target city, or merged away.
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  where v.duplicate_of_id is null
    and (v.latitude is null or v.longitude is null
         or public.haversine_m(v.latitude, v.longitude, f.lat, f.lng) > 50000
         or v.city_id is distinct from f.city_id);
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore_osaka P1: % frozen venues are still off their source point or city', v_bad;
  end if;

  -- P2: no frozen row keeps a queer_village of another city.
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  join public.queer_villages q on q.id = v.queer_village_id
  where q.city_id is distinct from v.city_id;
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore_osaka P2: % frozen venues keep a village of another city', v_bad;
  end if;

  -- P3: the country follows the city (safety_gated derives from it).
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  join public.cities c on c.id = v.city_id
  where v.duplicate_of_id is null and v.country_id is distinct from c.country_id;
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore_osaka P3: % frozen venues have a country other than their city''s', v_bad;
  end if;

  -- P5: the timezone follows the city where the city has one (a Tokyo bar
  -- kept Europe/Tallinn in the first dry run).
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  join public.cities c on c.id = v.city_id
  where v.duplicate_of_id is null and c.timezone is not null
    and v.enrichment_status->'source_position_restore'->>'by' = 'migration:99991795378654'
    and v.timezone is distinct from c.timezone;
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore_osaka P5: % frozen venues have a timezone other than their city''s', v_bad;
  end if;

  -- P4: not vacuous — the row carries this file's stamp.
  select count(*) into v_done
  from _vspr f join public.venues v on v.id = f.venue_id
  where v.enrichment_status->'source_position_restore'->>'by' = 'migration:99991795378654';
  if v_done < 1 then
    raise exception 'venue_source_position_restore_osaka P4: only % rows carry the restore stamp', v_done;
  end if;
end $verify$;

