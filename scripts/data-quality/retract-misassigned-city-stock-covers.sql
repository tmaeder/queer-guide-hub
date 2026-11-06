-- Detach three known country-fallback assignments from the wrong city.
-- Dry run by default. The asset remains available for its genuine subject.
begin;
set local statement_timeout='95s';
set local lock_timeout='3s';
set local app.actor='system:misassigned-city-stock-cover:v1';
do $repair$
declare dry_run boolean:=true; r record; after_city jsonb; after_review jsonb;
 ids uuid[]:='{}'; n integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required'; end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled) then raise exception 'Review repair paused'; end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then raise exception 'Review cleanup busy'; end if;
 for r in
  with sources(asset_id,source_ref,subject_aliases,subject_qid) as (values
   ('7bc23a99-0216-43e7-a135-5c0e5c8d0360'::uuid,'pexels:36705525','munich|munchen|muenchen|monaco di baviera','Q1726'),
   ('1a52ee92-783a-4bbc-9316-d932ca198b59'::uuid,'pexels:13030035','mexico city|ciudad de mexico|cdmx','Q1489'),
   ('587a817a-d900-4ebb-bcd3-8e29f75a9f43'::uuid,'pexels:12233053','milan|milano','Q490')
  )
  select c.id,q.id review_id,ia.id asset_id,ia.source_ref,ia.alt_text,to_jsonb(c) old_city,to_jsonb(q) old_review,to_jsonb(l) old_link
  from public.admin_review_case_worklist w
  join public.review_queue q on q.id=(w.item->>'id')::uuid
  join public.cities c on c.id=q.entity_id
  join public.image_asset_links l on l.entity_type='city' and l.entity_id=c.id and l.role='cover'
  join sources s on s.asset_id=l.asset_id
  join public.image_assets ia on ia.id=s.asset_id and ia.source_ref=s.source_ref
  where w.active and w.item->>'subtitle'='city image reused'
   and q.entity_type='city' and q.review_type='CITY_IMAGE_REUSED' and q.status='pending' and q.resolved_by is null
   and q.details->>'source'='city_quality_profile' and q.details->>'city_name'=c.name and q.details->>'city_slug'=c.slug
   and q.details->>'publication_ready'='false'
   and q.details-array['source','city_name','city_slug','hard_blocker','publication_ready','observed_at']='{}'::jsonb
   and c.duplicate_of_id is null and c.curated_image_url is null and not coalesce(c.image_flagged,false)
   and coalesce(c.wikidata_qid,'')<>s.subject_qid
   and lower(public.immutable_unaccent(c.name||' '||c.slug)) !~ ('\m('||s.subject_aliases||')\M')
   and length(btrim(c.name))>=3
   and strpos(lower(public.immutable_unaccent(ia.alt_text)),lower(public.immutable_unaccent(c.name)))=0
   and c.image_url=ia.url and ia.source='scraper' and l.added_by is null
   and c.image_metadata->'queer_backfill'='true'::jsonb and c.image_metadata->>'source'='pexels'
   and c.image_metadata->>'source_id'=split_part(ia.source_ref,':',2)
   and c.image_metadata->>'alt'=ia.alt_text and c.image_metadata->'previous_image_url'='null'::jsonb
   and coalesce(c.field_provenance->'image_url','{}')-'candidates'='{}'::jsonb
   and not exists(select 1 from public.content_revisions h where h.source_table='cities' and h.source_id=c.id and h.actor_kind='human'
     and h.changed_fields&&array['image_url','curated_image_url','image_metadata','image_flagged','field_provenance'])
   and not exists(select 1 from public.image_asset_links peer where peer.entity_type='city' and peer.entity_id=c.id and peer.role='cover' and peer.asset_id<>ia.id)
  order by c.id limit 250 for update of c,q,l skip locked for share of ia skip locked
 loop
  n:=n+1; ids:=array_append(ids,r.id);
  if dry_run then continue; end if;
  update public.cities c set image_url=null,image_metadata=null,updated_at=now() where c.id=r.id returning to_jsonb(c) into after_city;
  if after_city-array['image_url','image_metadata','updated_at'] is distinct from r.old_city-array['image_url','image_metadata','updated_at']
   then raise exception 'Protected city state changed %',r.id; end if;
  -- The native city image trigger detaches the sole previous cover.
  if exists(select 1 from public.image_asset_links l where l.entity_type='city' and l.entity_id=r.id and l.role='cover')
   then raise exception 'Native cover link was not detached %',r.id; end if;
  update public.review_queue q set status='resolved',resolved_at=now(),
    details=q.details||jsonb_build_object('resolution','misassigned_stock_city_cover_retracted','resolved_automatically',true,
      'source_ref',r.source_ref,'source_caption',r.alt_text)
   where q.id=r.review_id and to_jsonb(q)=r.old_review returning to_jsonb(q) into after_review;
  if not found then raise exception 'Review changed %',r.review_id; end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value) values
   ('city',r.id,'misassigned_city_stock_cover:v1',r.old_city,after_city),
   ('city',r.id,'misassigned_city_stock_cover_link:v1',r.old_link,null),
   ('review_queue',r.review_id,'misassigned_city_stock_cover_review:v1',r.old_review,after_review);
 end loop;
 if not dry_run and exists(select 1 from public.city_quality_profile where id=any(ids) and 'CITY_IMAGE_REUSED'=any(issue_codes))
  then raise exception 'Native city image reuse finding remains'; end if;
 perform set_config('matching.misassigned_city_stock_cover_result',jsonb_build_object('dry_run',dry_run,'count',n,'city_ids',ids)::text,true);
end
$repair$;
select current_setting('matching.misassigned_city_stock_cover_result')::jsonb result;
commit;
