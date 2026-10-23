-- Refresh stale automatically inherited geography from the same sole primary
-- venue. Default dry run. Human-owned, claimed, verified and safety-gated
-- businesses are excluded. Never infer a new business/venue identity.
begin;
set local statement_timeout='30s';set local lock_timeout='2s';
set local app.actor='system:refresh-stale-primary-geography:v1';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;r record;after_row jsonb;changed integer:=0;audited integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 for r in select o.id,v.id venue_id,v.city_id,v.country_id,to_jsonb(o) old_row,to_jsonb(v) venue_row
 from organizations o join venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join cities c on c.id=v.city_id where o.status='active' and o.claimed_by is null and o.claim_status='unclaimed' and o.last_verified_at is null and o.roles=array['venue']::text[] and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null and c.duplicate_of_id is null and v.country_id=c.country_id and o.country_id<>v.country_id and o.field_provenance#>>'{identity,source}'='unified_location' and o.field_provenance#>>'{identity,venue_id}'=v.id::text and lower(btrim(o.name))=lower(btrim(v.name)) and o.field_provenance#>>'{location_inheritance,source_id}'=v.id::text and not exists(select 1 from venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null) and not exists(select 1 from content_revisions revision where revision.source_table='organizations' and revision.source_id=o.id and revision.actor_kind='human' and revision.changed_fields &&array['city_id','country_id','latitude','longitude','primary_venue_id','state','timezone']) and not exists(select 1 from jsonb_each(o.field_provenance)p where p.value->>'human_reviewed'='true' or p.key in('city_id','country_id','latitude','longitude','state','timezone')) and (o.latitude is null or o.latitude=v.latitude) and (o.longitude is null or o.longitude=v.longitude) and not coalesce(o.safety_gated,false)
 order by o.id limit greatest(0,least(batch_size,100)) for update of o,v skip locked
 loop
  changed:=changed+1;
  if dry_run then continue;end if;
  insert into business_brand_quality_events(entity_type,entity_id,dimension,previous_value,new_value,reason_code)
  values('organization',r.id,'location',jsonb_build_object('city_id',r.old_row->'city_id','country_id',r.old_row->'country_id','location_inheritance',r.old_row#>'{field_provenance,location_inheritance}'),
   jsonb_build_object('city_id',r.city_id,'country_id',r.country_id,'source_venue_id',r.venue_id,'human_reviewed',false),'primary_venue_geography_refresh');
  audited:=audited+1;
  update organizations set city_id=r.city_id,country_id=r.country_id,
   field_provenance=field_provenance||jsonb_build_object('location_inheritance',
    coalesce(field_provenance->'location_inheritance','{}')||jsonb_build_object('at',now(),'source_table','venues','source_id',r.venue_id,
     'human_reviewed',false,'previous_city_id',r.old_row->'city_id','previous_country_id',r.old_row->'country_id','contract','stale_primary_geography:v1'))
   where id=r.id;
  select to_jsonb(o)into after_row from organizations o where o.id=r.id;
  if after_row-'city_id'-'country_id'-'field_provenance'-'updated_at'-'quality_checked_at'-'safety_gated'-'timezone'-'state'
   is distinct from r.old_row-'city_id'-'country_id'-'field_provenance'-'updated_at'-'quality_checked_at'-'safety_gated'-'timezone'-'state'
   or (after_row->'field_provenance')-'location_inheritance' is distinct from (r.old_row->'field_provenance')-'location_inheritance'
   or after_row->>'city_id' is distinct from r.city_id::text or after_row->>'country_id' is distinct from r.country_id::text
  then raise exception 'Unexpected business mutation %',r.id;end if;
  if after_row->'state' is distinct from r.old_row->'state' and after_row->>'state' is distinct from (select region_name from cities where id=r.city_id)
  then raise exception 'Unexpected derived region %',r.id;end if;
  if after_row->'timezone' is distinct from r.old_row->'timezone' and
    (nullif(r.old_row->>'timezone','')is not null or after_row->>'timezone' is distinct from (select timezone from cities where id=r.city_id))
  then raise exception 'Unexpected timezone mutation %',r.id;end if;
  if exists(select 1 from venues v where v.id=r.venue_id and to_jsonb(v)is distinct from r.venue_row)
  then raise exception 'Source venue changed %',r.venue_id;end if;
 end loop;
 perform set_config('matching.stale_primary_geo_result',jsonb_build_object('dry_run',dry_run,'candidates',changed,'audited',audited)::text,false);
end $repair$;
select current_setting('matching.stale_primary_geo_result')::jsonb result;
commit;

