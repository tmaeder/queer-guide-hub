-- Default dry run. Promote freshly probed original artwork from a registered
-- source; preserve content, scores, publication and human image decisions.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:gaycities-captured-artwork:v1';
do $repair$
#variable_conflict use_column
declare dry_run boolean:=coalesce(nullif(current_setting('matching.gaycities_artwork_dry_run',true),''),'true')::boolean;input jsonb;r record;after_row jsonb;changed integer:=0;ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal actor required';end if;
 input:=coalesce(nullif(current_setting('matching.gaycities_artwork_proofs',true),''),'[]')::jsonb;
 if jsonb_typeof(input)<>'array' or jsonb_array_length(input)>100 then raise exception 'At most one hundred artwork proofs required';end if;
 for r in
 with inputs as materialized(select value p from jsonb_array_elements(input)),
 single as(select p->>'event_id' id from inputs group by 1 having count(*)=1)
 select i.p,to_jsonb(e) old_event,s.id source_id,s.source_url,s.payload_hash
 from inputs i join single u on u.id=i.p->>'event_id'
 join events e on e.id=(i.p->>'event_id')::uuid
 join event_sources s on s.id=(i.p->>'source_id')::uuid and s.event_id=e.id and s.source_slug='gaycities'
 where e.duplicate_of_id is null and e.status='completed'and coalesce(cardinality(e.images),0)=0
 and e.title=i.p->>'title'
 and e.updated_at=(i.p->>'expected_updated_at')::timestamptz
 and jsonb_typeof(coalesce(e.field_provenance->'images','null'::jsonb))in('object','null')
 and coalesce(e.field_provenance#>>'{images,human_reviewed}','false')<>'true'
 and coalesce(e.field_provenance#>>'{images,source}','')not in('human','manual','user_submission','admin_upload')
 and nullif(e.field_provenance#>>'{images,reviewed_by}','')is null
 and not exists(select 1 from event_quality_issues reviewed where reviewed.event_id=e.id
  and reviewed.dimension='media'and(reviewed.reviewed_by is not null or reviewed.reviewed_at is not null))
 and not exists(select 1 from content_revisions revision where revision.source_table='events' and revision.source_id=e.id
  and revision.actor_kind='human' and revision.changed_fields&&array['images'])
 and s.source_url=i.p->>'source_url' and s.payload_hash=i.p->>'payload_hash'
 and s.source_url~'^https://[a-z0-9-]+[.]gaycities[.]com/events/[1-9][0-9]*-[^[:space:]?#]+$'
 and s.source_entity_id=e.external_id and split_part(regexp_replace(s.source_url,'^https://[^/]+/events/',''),'-',1)=e.external_id
 and s.payload#>>'{raw,url}'=s.source_url and s.payload#>'{raw,fromWayback}'='true'::jsonb
 and s.payload#>'{raw,jsonLd,_legacyTemplate}'='true'::jsonb
 and btrim(regexp_replace(lower(extensions.unaccent(s.payload#>>'{raw,jsonLd,name}')),'[^[:alnum:]]+',' ','g'))
  =btrim(regexp_replace(lower(extensions.unaccent(e.title)),'[^[:alnum:]]+',' ','g'))
 and left(s.payload#>>'{raw,jsonLd,startDate}',10)=to_char(e.start_date at time zone 'UTC','YYYY-MM-DD')
 and jsonb_typeof(s.payload#>'{raw,jsonLd,image}')='array'and jsonb_array_length(s.payload#>'{raw,jsonLd,image}')=1
 and regexp_replace(s.payload#>>'{raw,jsonLd,image,0}','^http:','https:')=i.p->>'url'
 and i.p->>'url'~'^https://gaycities-featured-images-production[.]s3[.]amazonaws[.]com/events/(t/sm/|originals/)[A-Za-z0-9._-]+[.](jpg|jpeg|png|webp)$'
 and not exists(select 1 from event_sources other where other.event_id=e.id and other.id<>s.id)
 and public.event_quality_url_is_safe(i.p->>'url') and i.p->>'human_reviewed'='false'
 and i.p#>>'{probe,passed}'='true' and i.p#>>'{probe,status}'='200'
 and i.p#>>'{probe,mime_type}' like 'image/%' and i.p#>>'{probe,sha256}'~'^[a-f0-9]{64}$'
 and (i.p#>>'{probe,byte_size}')::integer between 20000 and 4194304
 and least((i.p#>>'{probe,width}')::integer,(i.p#>>'{probe,height}')::integer)>=450
 and greatest((i.p#>>'{probe,width}')::integer,(i.p#>>'{probe,height}')::integer)>=800
 and (i.p#>>'{probe,byte_size}')::numeric/((i.p#>>'{probe,width}')::numeric*(i.p#>>'{probe,height}')::numeric)>=.05
 and (i.p->>'observed_at')::timestamptz between now()-interval '1 hour' and now()+interval '5 minutes'
 and exists(select 1 from event_quality_issues issue where issue.event_id=e.id and issue.status='open'
  and issue.issue_code='IMAGE_MISSING'and issue.reviewed_by is null and issue.reviewed_at is null)
 and (select count(*)from event_image_quality_observations observation where observation.content_hash=i.p#>>'{probe,sha256}')
  +(select count(*)from inputs other where other.p#>>'{probe,sha256}'=i.p#>>'{probe,sha256}')<10
 order by e.id limit 100 for update of e,s skip locked
 loop
  ids:=array_append(ids,(r.p->>'event_id')::uuid);changed:=changed+1;
  if dry_run then continue;end if;
  update events e set images=array[r.p->>'url']||array(select image from unnest(e.images)with ordinality old(image,n)
   where n>1 and image<>r.p->>'url' order by n),updated_at=now(),
   field_provenance=coalesce(e.field_provenance,'{}')||jsonb_build_object('images',jsonb_build_object(
    'source','gaycities-captured-artwork','source_id',r.source_id,'source_url',r.source_url,
    'source_payload_hash',r.payload_hash,'observed_at',r.p->>'observed_at','content_sha256',r.p#>>'{probe,sha256}',
    'width',r.p#>'{probe,width}','height',r.p#>'{probe,height}','previous_value',r.old_event->'images',
    'previous_provenance',r.old_event->'field_provenance'->'images','human_reviewed',false))
   where e.id=(r.p->>'event_id')::uuid;
  insert into event_quality_signals(event_id,signal_type,value,source,details)
   values((r.p->>'event_id')::uuid,'enrichment',1,'gaycities-captured-artwork',jsonb_build_object(
    'source_id',r.source_id,'source_url',r.source_url,'source_payload_hash',r.payload_hash,
    'previous_images',r.old_event->'images','new_image',r.p->>'url','probe',r.p->'probe','human_reviewed',false));
  select to_jsonb(e)into after_row from events e where e.id=(r.p->>'event_id')::uuid;
  if after_row-array['images','field_provenance','updated_at'] is distinct from r.old_event-array['images','field_provenance','updated_at']
   or (after_row->'field_provenance')-'images' is distinct from (r.old_event->'field_provenance')-'images'
   then raise exception 'Unexpected event mutation %',r.p->>'event_id';end if;
  delete from event_quality_current where event_id=(r.p->>'event_id')::uuid;
 end loop;
 perform set_config('matching.gaycities_artwork_result',jsonb_build_object('dry_run',dry_run,'eligible',changed,'promoted',case when dry_run then 0 else changed end,'event_ids',to_jsonb(ids))::text,false);
end $repair$;
select current_setting('matching.gaycities_artwork_result')::jsonb result;
commit;
