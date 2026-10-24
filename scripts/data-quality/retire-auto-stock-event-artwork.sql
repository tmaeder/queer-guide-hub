-- Default dry run. Remove only registered machine stock photos from sole-source
-- Siegessaeule listings whose registered source supplied no artwork. This is
-- not an image-quality pass or a claim about current publisher availability.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:retire-auto-stock-event-artwork:v1';
do $repair$
#variable_conflict use_column
declare dry_run boolean:=coalesce(nullif(current_setting('matching.event_stock_dry_run',true),''),'true')::boolean;
 r record;a record;after_row jsonb;links jsonb;asset_before jsonb;eligible integer:=0;ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal repair only';end if;
 if not dry_run and(not exists(select 1 from supabase_migrations.schema_migrations where version='99991792816500')
  or not exists(select 1 from admin_automations where slug='queer_image_backfill_event'and not enabled and lifecycle_state='consolidated')
  or exists(select 1 from cron.job where jobname='queer_image_backfill_event'and active)
  or not exists(select 1 from admin_automations where slug='event_image_backfill'and enabled and lifecycle_state='active')
  or not exists(select 1 from cron.job where jobname='event_image_backfill'and active))
 then raise exception 'Deploy stock producer retirement before cleanup';end if;
 for r in
 select e.id,to_jsonb(e)old_event,s.id source_id,to_jsonb(s)old_source
 from events e join event_sources s on s.event_id=e.id and s.source_slug='siegessaeule'
 where e.duplicate_of_id is null and e.created_by is null and e.verification_status='unverified'
 and coalesce(e.status,'active')not in('archived','rejected','cancelled')and cardinality(e.images)=1
 and not(coalesce(e.field_provenance,'{}')?|array['images','image_url','cover_image_url'])
 and s.source_url='https://www.siegessaeule.de/termine/'||s.source_entity_id||'/'
 and s.payload#>>'{raw,url}'=s.source_url and s.payload#>>'{raw,source}'='siegessaeule'
 and jsonb_typeof(s.payload->'raw')='object'and(s.payload->'raw')-array['url','source']='{}'::jsonb
 and s.payload#>>'{normalized,title}'=e.title and s.payload#>>'{normalized,sourceId}'=s.source_entity_id
 and s.payload#>'{normalized,images}'='[]'::jsonb
 and s.payload-array['raw','normalized','enriched']='{}'::jsonb
 and coalesce(s.payload->'enriched','{}'::jsonb)='{}'::jsonb
 and(s.payload->'normalized')-array['name','title','tags','urls','dates','images','website','location','metadata','sourceId','event_type','start_date','end_date','ticket_url','venue_name','description','entityType','sourceName']='{}'::jsonb
 and(s.payload#>'{normalized,metadata}')-array['url','adult','series','source','category']='{}'::jsonb
 and not exists(select 1 from event_sources other where other.event_id=e.id and other.id<>s.id)
 and not exists(select 1 from(values(s.payload->'normalized'),(s.payload->'enriched'),(s.payload#>'{normalized,metadata}'))section(data)
  cross join lateral jsonb_each(case when jsonb_typeof(data)='object'then data else '{}'::jsonb end)fact
  where fact.key in('image','images','photos','image_url','cover_image_url','artwork','poster')
   and fact.value not in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb))
 and not exists(select 1 from content_revisions rev where rev.source_table='events'and rev.source_id=e.id
  and rev.actor_kind='human'and rev.changed_fields&&array['images','image_url','cover_image_url','field_provenance'])
 and not exists(select 1 from event_quality_issues issue where issue.event_id=e.id and issue.dimension='media'and issue.reviewed_by is not null)
 and not exists(select 1 from image_asset_links human where human.entity_type='event'and human.entity_id=e.id and human.added_by is not null)
 and exists(select 1 from image_assets a join image_asset_links k on k.asset_id=a.id and k.entity_type='event'and k.entity_id=e.id
  where a.url=e.images[1]and a.url~'^https://img[.]queer[.]guide/event-images/[a-f0-9]{64}[.]jpg$'
   and a.source='scraper'and a.source_ref~'^(pexels:[1-9][0-9]*|unsplash:[A-Za-z0-9_-]+)$'and k.added_by is null)
 order by e.id limit 50 for update of e,s skip locked
 loop
  select a.id,to_jsonb(a)asset into a from image_assets a where a.url_hash=encode(extensions.digest(r.old_event#>>'{images,0}','sha256'),'hex')for update;
  if not found or a.asset->>'url' is distinct from r.old_event#>>'{images,0}'or a.asset->>'source'is distinct from 'scraper'
   or(a.asset->>'source_ref'~'^(pexels:[1-9][0-9]*|unsplash:[A-Za-z0-9_-]+)$')is not true then raise exception 'Asset provenance changed';end if;
  perform 1 from image_asset_links k where k.asset_id=a.id and k.entity_type='event'and k.entity_id=r.id for update;
  select jsonb_agg(to_jsonb(k)order by k.role)into links from image_asset_links k where k.asset_id=a.id and k.entity_type='event'and k.entity_id=r.id;
  if links is null or exists(select 1 from jsonb_array_elements(links)k where k->>'added_by'is not null)then raise exception 'Image ownership changed';end if;
  eligible:=eligible+1;ids:=array_append(ids,r.id);if dry_run then continue;end if;
  update events set images='{}'::text[],updated_at=now(),field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('images',jsonb_build_object(
   'source','retired-generic-stock:v1','outcome','removed_unrelated_machine_stock','human_reviewed',false,'at',now(),
   'previous_value',r.old_event->'images','asset',a.asset,'previous_asset_links',links,
   'registered_source_id',r.source_id,'registered_source_url',r.old_source->>'source_url','registered_source_payload_hash',r.old_source->>'payload_hash'))where id=r.id;
  delete from image_asset_links k where k.asset_id=a.id and k.entity_type='event'and k.entity_id=r.id and k.added_by is null;
  select to_jsonb(e)into after_row from events e where e.id=r.id;
  if after_row-array['images','updated_at','field_provenance']is distinct from r.old_event-array['images','updated_at','field_provenance']
   or (after_row->'field_provenance')-'images'is distinct from(r.old_event->'field_provenance')-'images'
   or after_row->'images'<>'[]'::jsonb then raise exception 'Unrelated event data changed';end if;
  if exists(select 1 from event_sources s where s.id=r.source_id and to_jsonb(s)is distinct from r.old_source)
   or exists(select 1 from image_assets x where x.id=a.id and to_jsonb(x)is distinct from a.asset)then raise exception 'Source or library asset changed';end if;
  -- Invalidate the derived assessment only. Native scanning owns issue outcomes.
  delete from event_quality_current where event_id=r.id;
 end loop;
 perform set_config('matching.event_stock_result',jsonb_build_object('dry_run',dry_run,'eligible',eligible,'cleaned',case when dry_run then 0 else eligible end,'event_ids',to_jsonb(ids))::text,true);
end $repair$;
select current_setting('matching.event_stock_result')::jsonb result;
commit;
