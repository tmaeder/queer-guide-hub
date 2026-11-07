-- Reuse the audited venue merge when a backfilled business profile matches
-- the same numbered street address and map pin, or the same domain, phone and pin.
do $patch$
declare
  definition text:=pg_get_functiondef('public.reconcile_merged_venue_business_spines(integer,boolean)'::regprocedure);
  anchor text:=$anchor$     or (
       o.field_provenance#>>'{location_inheritance,source_table}'='venues'$anchor$;
  additional_match text:=$match$     or (
       o.field_provenance#>>'{location_inheritance,source_table}'='venues'
       and o.field_provenance#>>'{location_inheritance,source_id}'=d.id::text
       and o.field_provenance#>>'{name,source}'='venues_backfill'
       and not exists(select from jsonb_object_keys(o.field_provenance) key
         where key not in('location_inheritance','name','email','phone'))
       and (not o.field_provenance?'email' or (
         o.field_provenance#>>'{email,source}'='primary_venue' and o.field_provenance#>>'{email,source_id}'=d.id::text))
       and (not o.field_provenance?'phone' or (
         o.field_provenance#>>'{phone,source}'='primary_venue' and o.field_provenance#>>'{phone,source_id}'=d.id::text))
       and public.city_canonical_key(o.name)=public.city_canonical_key(d.name)
       and public.city_canonical_key(ko.name)=public.city_canonical_key(k.name)
       and o.safety_gated is not distinct from ko.safety_gated
       and k.safety_gated is not distinct from ko.safety_gated
       and public.haversine_m(d.latitude,d.longitude,k.latitude,k.longitude)<=50
       and not coalesce(
         public.normalize_phone(d.phone) ~ '^[+]?[0-9]{8,15}$'
         and public.normalize_phone(k.phone) ~ '^[+]?[0-9]{8,15}$'
         and public.normalize_phone(d.phone)<>public.normalize_phone(k.phone),false)
       and (
         (
           split_part(split_part(split_part(d.address,chr(10),1),',',1),'(',1) ~ '(^|[^[:alnum:]])[0-9]'
           and length(btrim(split_part(split_part(split_part(d.address,chr(10),1),',',1),'(',1)))>=8
           and btrim(regexp_replace(public.city_canonical_key(split_part(split_part(split_part(d.address,chr(10),1),',',1),'(',1)),'[^[:alnum:]]+',' ','g'))
             =btrim(regexp_replace(public.city_canonical_key(split_part(split_part(split_part(k.address,chr(10),1),',',1),'(',1)),'[^[:alnum:]]+',' ','g'))
         )
         or (
           public.org_normalize_domain(d.website)=public.org_normalize_domain(k.website)
           and public.org_normalize_domain(d.website) not in('facebook.com','instagram.com','linktr.ee','tinyurl.com','x.com','twitter.com')
           and public.normalize_phone(d.phone) ~ '^[+]?[0-9]{8,15}$'
           and public.normalize_phone(d.phone)=public.normalize_phone(k.phone)
         )
       )
       and not exists(select from public.content_revisions h where h.source_table='organizations'
         and h.source_id=o.id and h.actor_kind='human')
     )
$match$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Venue business spine selector changed';
  end if;
  execute replace(definition,anchor,additional_match||anchor);
end $patch$;

-- A former venue can carry a bad city label. Two captured sources must agree
-- with the surviving street address, pin and city before merging across cities.
do $locality$
declare
  definition text:=pg_get_functiondef('public.reconcile_merged_venue_business_spines(integer,boolean)'::regprocedure);
  anchor text:=$anchor$   and o.city_id=ko.city_id and o.country_id=ko.country_id and d.city_id=k.city_id and d.country_id=k.country_id
   and o.city_id=d.city_id and o.country_id=d.country_id$anchor$;
  corroborated_locality text:=$location$   and o.country_id=ko.country_id and d.country_id=k.country_id
   and o.city_id=d.city_id and o.country_id=d.country_id
   and (
     (o.city_id=ko.city_id and d.city_id=k.city_id)
     or (
       ko.city_id=k.city_id and o.city_id<>ko.city_id
       and o.field_provenance#>>'{identity,source}'='unified_location'
       and o.field_provenance#>>'{identity,venue_id}'=d.id::text
       and o.field_provenance#>>'{location_inheritance,source_id}'=d.id::text
       and o.field_provenance#>>'{location_inheritance,source_table}'='venues'
       and ko.primary_venue_id=k.id
       and o.safety_gated is not distinct from ko.safety_gated
       and k.safety_gated is not distinct from ko.safety_gated
       and public.haversine_m(d.latitude,d.longitude,k.latitude,k.longitude)<=30
       and not coalesce(
         public.normalize_phone(d.phone) ~ '^[+]?[0-9]{8,15}$'
         and public.normalize_phone(k.phone) ~ '^[+]?[0-9]{8,15}$'
         and public.normalize_phone(d.phone)<>public.normalize_phone(k.phone),false)
       and exists(select from public.cities previous_city
         join public.cities current_city on current_city.id=k.city_id
           and current_city.country_id=k.country_id and current_city.duplicate_of_id is null and current_city.shell_status='real'
         join public.countries country on country.id=k.country_id
         where previous_city.id=d.city_id and previous_city.country_id=d.country_id
           and public.haversine_m(k.latitude,k.longitude,current_city.latitude,current_city.longitude)<=2500
           and public.haversine_m(k.latitude,k.longitude,previous_city.latitude,previous_city.longitude)>=10000
           and exists(select from public.geo_country_at(k.latitude,k.longitude) boundary where boundary.iso_a2=country.code)
           and (
             select count(distinct source.source_slug)
             from public.venue_sources source
             cross join lateral (select source.payload#>'{normalized,location}' location) captured
             cross join lateral (select
               btrim(regexp_replace(public.city_canonical_key(split_part(split_part(captured.location->>'address',chr(10),1),',',1)),'[^[:alnum:]]+',' ','g')) source_street,
               btrim(regexp_replace(public.city_canonical_key(split_part(split_part(k.address,chr(10),1),',',1)),'[^[:alnum:]]+',' ','g')) keep_street
             ) street
             where source.venue_id=k.id and source.payload_hash~'^[0-9a-f]{64}$'
               and source.source_slug not in ('google','unknown')
               and (source.source_url~'^https://' or source.source_slug='foursquare_os')
               and public.city_canonical_key(captured.location->>'city') in
                 (public.city_canonical_key(current_city.name),public.city_canonical_key(current_city.name_local))
               and upper(coalesce(captured.location->>'country_code',captured.location->>'countryCode',captured.location->>'country'))=country.code
               and street.source_street=street.keep_street
               and case when pg_input_is_valid(captured.location->>'lat','numeric')
                   and pg_input_is_valid(captured.location->>'lng','numeric')
                 then case when (captured.location->>'lat')::numeric between -90 and 90
                     and (captured.location->>'lng')::numeric between -180 and 180
                   then public.haversine_m(k.latitude,k.longitude,(captured.location->>'lat')::numeric,(captured.location->>'lng')::numeric)<=60
                   else false end
                 else false end
           )>=2)
       and exists(select from (select
         btrim(regexp_replace(public.city_canonical_key(split_part(split_part(d.address,chr(10),1),',',1)),'[^[:alnum:]]+',' ','g')) drop_street,
         btrim(regexp_replace(public.city_canonical_key(split_part(split_part(k.address,chr(10),1),',',1)),'[^[:alnum:]]+',' ','g')) keep_street
       ) address where length(drop_street)>=8 and length(keep_street)>=8
         and drop_street ~ '[0-9]' and keep_street ~ '[0-9]'
         and (starts_with(drop_street||' ',keep_street||' ') or starts_with(keep_street||' ',drop_street||' ')))
       and not exists(select from public.content_revisions h where h.source_table='organizations'
         and h.source_id=o.id and h.actor_kind='human')
     )
   )$location$;
begin
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Venue business geography selector changed';
  end if;
  execute replace(definition,anchor,corroborated_locality);
end $locality$;
