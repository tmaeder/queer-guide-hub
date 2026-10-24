-- The audited identity keys must resolve before complete profile comparison.
-- Planner cost hints alone still timed out at 120 seconds in production.
-- Lateral OFFSET 0 keeps each profile lookup bound to its venue's actual key;
-- materialization prevents full-record comparisons on unrelated pairs. Final
-- full-row CAS and original row locks retain concurrent content protections.
do $patch$
declare src text;old_selector text:=$old$
  select o.id drop_id,ko.id keep_id,d.id duplicate_venue_id,k.id canonical_venue_id,va.id venue_merge_audit_id
  from public.organizations o join public.venues d on d.id=o.primary_venue_id and d.organization_id=o.id
  join public.venues k on k.id=d.duplicate_of_id and k.duplicate_of_id is null and k.closed_at is null
  join public.organizations ko on ko.id=k.organization_id and ko.duplicate_of_id is null and ko.status='active'
  join lateral(select a.id from public.venue_merge_audit a where a.drop_id=d.id and a.keep_id=k.id and a.undone_at is null order by a.created_at desc limit 1) va on true
  where o.id<>ko.id and o.status='active' and o.duplicate_of_id is null
   and o.roles=array['venue']::text[] and ko.roles @> array['venue']::text[]
   and o.claimed_by is null and o.claim_status='unclaimed' and o.last_verified_at is null
   and o.field_provenance#>>'{identity,source}'='unified_location'
   and o.field_provenance#>>'{identity,venue_id}'=d.id::text
   and coalesce(o.field_provenance#>>'{identity,human_reviewed}','false')='false'
   and not exists(select 1 from jsonb_object_keys(o.field_provenance) key where key not in('identity','location_inheritance'))
   and not exists(select 1 from jsonb_each(o.field_provenance) p where p.value->>'human_reviewed'='true' or nullif(p.value->>'reviewed_by','') is not null)
   and o.city_id=ko.city_id and o.country_id=ko.country_id and d.city_id=k.city_id and d.country_id=k.country_id
   and o.city_id=d.city_id and o.country_id=d.country_id
   and public.merge_gap_patch('organization',to_jsonb(ko),to_jsonb(o))='{}'
   and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id and f.state in('fail','pending') and f.waived_at is null)
   and not exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id and f.waived_at is not null)
   and not exists(select 1 from public.venues other left join public.venues target on target.id=other.duplicate_of_id
    where other.organization_id=o.id and (other.duplicate_of_id is null or target.id is null or target.duplicate_of_id is not null or target.organization_id is distinct from ko.id))
   and not exists(select 1 from public.hotels h where h.organization_id=o.id)
   and not exists(select 1 from public.marketplace_brands b where b.organization_id=o.id)
   and not exists(select 1 from public.marketplace_merchants m where m.organization_id=o.id)
   and not exists(select 1 from public.affiliate_partners a where a.organization_id=o.id)
   and not exists(select 1 from public.news_sources n where n.organization_id=o.id)
   and not exists(select 1 from public.organizations child where child.duplicate_of_id=o.id)
   and not exists(select 1 from public.org_slug_redirects redirect where redirect.organization_id=o.id)
   and not exists(select 1 from public.org_link_suggestions suggestion where suggestion.organization_id=o.id)
  order by o.id limit greatest(0,least(batch_size,100)) for update of o,ko,d,k skip locked
$old$;new_selector text:=$new$
  with keyed_candidates as materialized(
  select o.id drop_id,ko.id keep_id,d.id duplicate_venue_id,k.id canonical_venue_id,va.id venue_merge_audit_id,
   to_jsonb(o) drop_profile,to_jsonb(ko) keep_profile,to_jsonb(d) drop_venue,to_jsonb(k) keep_venue
  from public.venues d
  join public.venues k on k.id=d.duplicate_of_id and k.duplicate_of_id is null and k.closed_at is null
  join lateral(select profile.*from public.organizations profile
   where profile.id=d.organization_id and profile.primary_venue_id=d.id offset 0)o on true
  join lateral(select profile.*from public.organizations profile
   where profile.id=k.organization_id and profile.duplicate_of_id is null and profile.status='active' offset 0)ko on true
  join lateral(select a.id from public.venue_merge_audit a where a.drop_id=d.id and a.keep_id=k.id and a.undone_at is null order by a.created_at desc limit 1) va on true
  where o.id<>ko.id and o.status='active' and o.duplicate_of_id is null
   and o.roles=array['venue']::text[] and ko.roles @> array['venue']::text[]
   and o.claimed_by is null and o.claim_status='unclaimed' and o.last_verified_at is null
   and o.field_provenance#>>'{identity,source}'='unified_location'
   and o.field_provenance#>>'{identity,venue_id}'=d.id::text
   and coalesce(o.field_provenance#>>'{identity,human_reviewed}','false')='false'
   and not exists(select 1 from jsonb_object_keys(o.field_provenance) key where key not in('identity','location_inheritance'))
   and not exists(select 1 from jsonb_each(o.field_provenance) p where p.value->>'human_reviewed'='true' or nullif(p.value->>'reviewed_by','') is not null)
   and o.city_id=ko.city_id and o.country_id=ko.country_id and d.city_id=k.city_id and d.country_id=k.country_id
   and o.city_id=d.city_id and o.country_id=d.country_id
   and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id and f.state in('fail','pending') and f.waived_at is null)
   and not exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id and f.waived_at is not null)
   and not exists(select 1 from public.venues other left join public.venues target on target.id=other.duplicate_of_id
    where other.organization_id=o.id and (other.duplicate_of_id is null or target.id is null or target.duplicate_of_id is not null or target.organization_id is distinct from ko.id))
   and not exists(select 1 from public.hotels h where h.organization_id=o.id)
   and not exists(select 1 from public.marketplace_brands b where b.organization_id=o.id)
   and not exists(select 1 from public.marketplace_merchants m where m.organization_id=o.id)
   and not exists(select 1 from public.affiliate_partners a where a.organization_id=o.id)
   and not exists(select 1 from public.news_sources n where n.organization_id=o.id)
   and not exists(select 1 from public.organizations child where child.duplicate_of_id=o.id)
   and not exists(select 1 from public.org_slug_redirects redirect where redirect.organization_id=o.id)
   and not exists(select 1 from public.org_link_suggestions suggestion where suggestion.organization_id=o.id)
  ), compatible_candidates as materialized(
   select *from keyed_candidates where public.merge_gap_patch('organization',keep_profile,drop_profile)='{}'
  )
  select c.drop_id,c.keep_id,c.duplicate_venue_id,c.canonical_venue_id,c.venue_merge_audit_id
  from compatible_candidates c
  join public.organizations o on o.id=c.drop_id
  join public.organizations ko on ko.id=c.keep_id
  join public.venues d on d.id=c.duplicate_venue_id
  join public.venues k on k.id=c.canonical_venue_id
  where to_jsonb(o)=c.drop_profile and to_jsonb(ko)=c.keep_profile
   and to_jsonb(d)=c.drop_venue and to_jsonb(k)=c.keep_venue
  order by o.id limit greatest(0,least(batch_size,100)) for update of o,ko,d,k skip locked
$new$;
begin
 src:=pg_get_functiondef('public.reconcile_merged_venue_business_spines(integer,boolean)'::regprocedure);
 old_selector:=btrim(old_selector,chr(10));new_selector:=btrim(new_selector,chr(10));
 if(length(src)-length(replace(src,old_selector,'')))/length(old_selector)<>1 then raise exception 'Business spine selector changed';end if;
 execute replace(src,old_selector,new_selector);
end $patch$;

