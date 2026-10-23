-- Default dry run. This exact shared asset was fetched and visually verified as
-- a HugeDomains advertisement. This says nothing about a venue's closure.
-- Retain every other image, human choice, source capture and quality finding.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
set local app.actor='system:remove-confirmed-domain-parking-ad:v1';
do $repair$
declare
 dry_run boolean:=true;
 ad constant text:='https://static.hugedomains.com/images/hdv3-img/og_hugedomains.png';
 row_before record;
 row_after jsonb;
 venue_count integer:=0;
 business_count integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 for row_before in
  select v.id,to_jsonb(v) snapshot from public.venues v
  where ad=any(v.images) and not coalesce(v.verified,false)
   and not exists(select 1 from public.venue_field_provenance p where p.venue_id=v.id and p.field='images' and p.is_winning)
   and not exists(select 1 from public.content_revisions r where r.source_table='venues' and r.source_id=v.id
    and r.actor_kind='human' and 'images'=any(r.changed_fields))
  order by v.id limit 100 for update of v skip locked
 loop
  venue_count:=venue_count+1;
  if not dry_run then
   update public.venues set images=array_remove(images,ad) where id=row_before.id;
   select to_jsonb(v) into row_after from public.venues v where v.id=row_before.id;
   if row_after-'images'-'updated_at'-'quality_checked_at' is distinct from row_before.snapshot-'images'-'updated_at'-'quality_checked_at'
    or row_after->'images' is distinct from to_jsonb(array_remove(array(select jsonb_array_elements_text(row_before.snapshot->'images')),ad))
   then raise exception 'Unexpected venue mutation %',row_before.id;end if;
  end if;
 end loop;
 for row_before in
  select o.id,to_jsonb(o) snapshot from public.organizations o
  where ad=any(o.images) and o.claimed_by is null
   and o.field_provenance#>>'{identity,source}'='unified_location'
   and not coalesce(o.field_provenance,'{}'::jsonb)?'images'
   and not exists(select 1 from public.content_revisions r where r.source_table='organizations' and r.source_id=o.id
    and r.actor_kind='human' and 'images'=any(r.changed_fields))
  order by o.id limit 100 for update of o skip locked
 loop
  business_count:=business_count+1;
  if not dry_run then
   update public.organizations set images=array_remove(images,ad) where id=row_before.id;
   select to_jsonb(o) into row_after from public.organizations o where o.id=row_before.id;
   if row_after-'images'-'updated_at'-'quality_checked_at' is distinct from row_before.snapshot-'images'-'updated_at'-'quality_checked_at'
    or row_after->'images' is distinct from to_jsonb(array_remove(array(select jsonb_array_elements_text(row_before.snapshot->'images')),ad))
   then raise exception 'Unexpected business mutation %',row_before.id;end if;
  end if;
 end loop;
 perform set_config('matching.parked_media_result',jsonb_build_object('dry_run',dry_run,'venues',venue_count,'businesses',business_count)::text,false);
end $repair$;
select current_setting('matching.parked_media_result')::jsonb result;
commit;
