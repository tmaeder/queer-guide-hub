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
