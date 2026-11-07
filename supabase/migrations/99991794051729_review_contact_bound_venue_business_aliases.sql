-- Repair additional machine-created venue organizations after an audited
-- venue merge when both venue records agree on the public site and phone.
do $patch$
declare
  definition text:=pg_get_functiondef('public.reconcile_merged_venue_business_spines(integer,boolean)'::regprocedure);
  original text:=$original$   and o.field_provenance#>>'{identity,source}'='unified_location'
   and o.field_provenance#>>'{identity,venue_id}'=d.id::text
   and coalesce(o.field_provenance#>>'{identity,human_reviewed}','false')='false'
   and not exists(select 1 from jsonb_object_keys(o.field_provenance) key where key not in('identity','location_inheritance'))
$original$;
  expanded text:=$expanded$   and (
     (
       o.field_provenance#>>'{identity,source}'='unified_location'
       and o.field_provenance#>>'{identity,venue_id}'=d.id::text
       and coalesce(o.field_provenance#>>'{identity,human_reviewed}','false')='false'
       and not exists(select 1 from jsonb_object_keys(o.field_provenance) key where key not in('identity','location_inheritance'))
     )
     or (
       o.field_provenance#>>'{location_inheritance,source_table}'='venues'
       and o.field_provenance#>>'{location_inheritance,source_id}'=d.id::text
       and (o.field_provenance#>>'{name,source}'='venues_backfill'
         or (o.field_provenance#>>'{identity,source}'='unified_location'
           and o.field_provenance#>>'{identity,venue_id}'=d.id::text))
       and not exists(select 1 from jsonb_object_keys(o.field_provenance) key
         where key not in('identity','location_inheritance','name','email','phone'))
       and (not o.field_provenance?'email' or (
         o.field_provenance#>>'{email,source}'='primary_venue' and o.field_provenance#>>'{email,source_id}'=d.id::text))
       and (not o.field_provenance?'phone' or (
         o.field_provenance#>>'{phone,source}'='primary_venue' and o.field_provenance#>>'{phone,source_id}'=d.id::text))
       and public.city_canonical_key(o.name)=public.city_canonical_key(d.name)
       and public.city_canonical_key(ko.name)=public.city_canonical_key(k.name)
       and d.website ~* '^https?://[^/?#]+/?$' and k.website ~* '^https?://[^/?#]+/?$'
       and public.org_normalize_domain(d.website)=public.org_normalize_domain(k.website)
       and public.org_normalize_domain(d.website) not in('facebook.com','instagram.com','linktr.ee','tinyurl.com','x.com','twitter.com')
       and (o.website is null or public.org_normalize_domain(o.website)=public.org_normalize_domain(d.website))
       and (ko.website is null or public.org_normalize_domain(ko.website)=public.org_normalize_domain(k.website))
       and public.normalize_phone(d.phone) ~ '^[+]?[0-9]{8,15}$'
       and public.normalize_phone(d.phone)=public.normalize_phone(k.phone)
       and (o.phone is null or public.normalize_phone(o.phone)=public.normalize_phone(d.phone))
       and (ko.phone is null or public.normalize_phone(ko.phone)=public.normalize_phone(k.phone))
       and o.safety_gated is not distinct from ko.safety_gated
       and (public.haversine_m(d.latitude,d.longitude,k.latitude,k.longitude)<=100
         or (length(public.city_canonical_key(d.address))>=10 and public.city_canonical_key(d.address)=public.city_canonical_key(k.address)))
       and not exists(select 1 from public.content_revisions h where h.source_table='organizations'
         and h.source_id=o.id and h.actor_kind='human')
     )
   )
$expanded$;
begin
  if (length(definition)-length(replace(definition,original,'')))/length(original)<>1 then
    raise exception 'Venue business spine selector changed';
  end if;
  execute replace(definition,original,expanded);
end $patch$;
