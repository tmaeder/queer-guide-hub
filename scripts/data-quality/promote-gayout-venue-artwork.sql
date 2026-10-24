-- Default dry run. Only directly captured, correctly sized artwork from the
-- exact registered publisher listing; preserve every human image decision.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:gayout-registered-venue-artwork:v1';
do $repair$
#variable_conflict use_column
declare input jsonb:=coalesce(nullif(current_setting('matching.gayout_artwork_proofs',true),''),'[]')::jsonb;
 dry_run boolean:=coalesce(nullif(current_setting('matching.gayout_artwork_dry_run',true),''),'true')::boolean;
 p jsonb;j jsonb;r record;after_v jsonb;after_o jsonb;new_payload jsonb;provenance jsonb;eligible integer:=0;ids uuid[]:='{}';
begin
 perform assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal publisher evidence only';end if;
 if jsonb_typeof(input)<>'array'or jsonb_array_length(input)>20 then raise exception 'At most twenty publisher artwork captures';end if;
 if not pg_try_advisory_xact_lock(hashtext('business_quality_lifecycle'))then raise exception 'Native business producer busy';end if;
 for p in select value from jsonb_array_elements(input)loop
  if p->>'contract'is distinct from 'gayout_registered_venue_artwork:v1'or p->>'human_reviewed'is distinct from 'false'
   or not coalesce(pg_input_is_valid(p->>'source_json_text','jsonb'),false)
   or encode(extensions.digest(p->>'source_json_text','sha256'),'hex')is distinct from p->>'source_json_sha256'
   or coalesce(p->>'publisher_venue_id','')!~'^[1-9][0-9]{0,8}$'
   or coalesce(p->>'url','')!~('^https://www[.]gayout[.]com/uploads/venues/'||(p->>'publisher_venue_id')||'/[A-Za-z0-9_.-]+[.](jpg|jpeg|png|webp)$')
   or p->>'url'~*'(pexels|unsplash|stock|fallback|default|placeholder)'
   or jsonb_typeof(p->'listed_artwork_urls')is distinct from 'array'or p->'listed_artwork_urls'<>jsonb_build_array(p->>'url')
   or not coalesce(pg_input_is_valid(p->>'source_observed_at','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p#>>'{probe,observed_at}','timestamp with time zone'),false)
   or (p->>'source_observed_at')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'
   or (p#>>'{probe,observed_at}')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'
   or p#>>'{probe,passed}'is distinct from 'true'or p#>>'{probe,status}'is distinct from '200'
   or coalesce(p#>>'{probe,mime}','')not in('image/jpeg','image/png','image/webp')
   or coalesce(p#>>'{probe,format}','')not in('jpeg','png','webp')
   or coalesce(p#>>'{probe,sha256}','')!~'^[a-f0-9]{64}$'
   or not coalesce(pg_input_is_valid(p#>>'{probe,width}','integer'),false)
   or not coalesce(pg_input_is_valid(p#>>'{probe,height}','integer'),false)
   or not coalesce(pg_input_is_valid(p#>>'{probe,bytes}','integer'),false)
   then continue;end if;
  if least((p#>>'{probe,width}')::integer,(p#>>'{probe,height}')::integer)<450
   or greatest((p#>>'{probe,width}')::integer,(p#>>'{probe,height}')::integer)<800
   or (p#>>'{probe,bytes}')::integer not between 20000 and 4194304
   or (p#>>'{probe,bytes}')::numeric/((p#>>'{probe,width}')::numeric*(p#>>'{probe,height}')::numeric)<.05
   or(select count(*)from jsonb_array_elements(input)x where x->>'id'=p->>'id')<>1
   or(select count(*)from jsonb_array_elements(input)x where x#>>'{probe,sha256}'=p#>>'{probe,sha256}')<>1 then continue;end if;
  j:=(p->>'source_json_text')::jsonb;
  if j->>'url'is distinct from p->>'source_url'or not coalesce(pg_input_is_valid(j#>>'{geo,latitude}','numeric'),false)
   or not coalesce(pg_input_is_valid(j#>>'{geo,longitude}','numeric'),false)then continue;end if;
  select v.id,v.organization_id,to_jsonb(v)old_v,to_jsonb(o)old_o,to_jsonb(s)old_s into r
  from venues v join organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
  join countries c on c.id=v.country_id join venue_sources s on s.venue_id=v.id and s.id=(p->>'source_id')::uuid
  where v.id=(p->>'id')::uuid and v.name=p->>'name'and v.updated_at=(p->>'expected_updated_at')::timestamptz
   and v.duplicate_of_id is null and v.closed_at is null and not coalesce(v.verified,false)
   and coalesce(to_jsonb(v)->>'verification_status','')in('','auto','unverified') and o.duplicate_of_id is null and o.status='active'
   and o.claim_status='unclaimed'and o.last_verified_at is null and o.roles=array['venue']::text[]
   and o.field_provenance#>>'{identity,source}'='unified_location'and lower(btrim(o.name))=lower(btrim(v.name))
   and o.country_id=v.country_id and o.city_id is not distinct from v.city_id and v.category not in('other','toilet','cruising')
   and coalesce(cardinality(v.images),0)=0 and coalesce(cardinality(o.images),0)=0 and o.logo_url is null and o.cover_image_url is null
   and not(coalesce(o.field_provenance,'{}')?|array['images','logo_url','cover_image_url'])
   and s.source_slug='gayout'and s.source_url=p->>'source_url'and s.payload_hash=p->>'payload_hash'
   and s.source_url~'^https://www[.]gayout[.]com/[A-Za-z0-9/%_.-]+$'
   and s.payload#>>'{normalized,metadata,gayout_numeric_id}'=p->>'publisher_venue_id'
   and not(s.payload?'artwork_enrichment')
   and s.payload#>>'{detail_enrichment,contract}'='gayout_registered_venue_details:v1'
   and s.payload#>>'{detail_enrichment,human_reviewed}'='false'and s.payload#>>'{detail_enrichment,http_status}'='200'
   and s.payload#>>'{detail_enrichment,source_json_sha256}'=p->>'source_json_sha256'
   and s.payload#>>'{detail_enrichment,source_json_text}'=p->>'source_json_text'
   and s.payload#>>'{detail_enrichment,observed_at}'=p->>'source_observed_at'
   and c.code=j#>>'{address,addressCountry}'
   and btrim(regexp_replace(lower(extensions.unaccent(v.name)),'[^[:alnum:]]+',' ','g'))=btrim(regexp_replace(lower(extensions.unaccent(j->>'name')),'[^[:alnum:]]+',' ','g'))
   and (j#>>'{geo,latitude}')::numeric between -90 and 90 and(j#>>'{geo,longitude}')::numeric between -180 and 180
   and not((j#>>'{geo,latitude}')::numeric=0 and(j#>>'{geo,longitude}')::numeric=0)
   and haversine_m(v.latitude,v.longitude,(j#>>'{geo,latitude}')::numeric,(j#>>'{geo,longitude}')::numeric)<=60
   and not exists(select 1 from venue_field_provenance f where f.venue_id=v.id and f.field='images'and f.is_winning)
   and not exists(select 1 from venue_review_queue q where q.venue_id=v.id and q.field='images'and q.status in('open','rejected'))
   and not exists(select 1 from content_revisions rev where rev.source_table in('venues','organizations')and rev.source_id in(v.id,o.id)
    and rev.actor_kind='human'and rev.changed_fields&&array['images','logo_url','cover_image_url'])
   and not exists(select 1 from entity_quality_findings f where f.entity_type='organization'and f.entity_id=o.id and f.dimension='media'
    and(f.waived_by is not null or f.waived_at is not null or f.evidence?'governance_resolution'))
   and not exists(select 1 from image_assets a where(a.url=p->>'url'or a.content_hash=p#>>'{probe,sha256}')and(a.is_flagged or a.status is distinct from 'active'))
   and not exists(select 1 from image_assets a join image_asset_links k on k.asset_id=a.id where(a.url=p->>'url'or a.content_hash=p#>>'{probe,sha256}')and k.entity_id not in(v.id,o.id))
  for update of v,o,s skip locked;
  if not found then continue;end if;
  eligible:=eligible+1;ids:=array_append(ids,r.id);if dry_run then continue;end if;
  provenance:=jsonb_build_object('source','gayout_registered_artwork:v1','source_url',p->>'source_url','source_id',p->>'source_id',
   'image_url',p->>'url','source_observed_at',p->>'source_observed_at','source_json_sha256',p->>'source_json_sha256',
   'probe',p->'probe','human_reviewed',false,'previous_value','[]'::jsonb);
  update venues set images=array[p->>'url'],updated_at=now()where id=r.id;
  insert into venue_field_provenance(venue_id,field,source,value,confidence,is_winning,observed_at)
   values(r.id,'images','gayout_registered_artwork',jsonb_build_array(p->>'url'),.85,true,(p#>>'{probe,observed_at}')::timestamptz);
  update organizations set images=array[p->>'url'],field_provenance=field_provenance||jsonb_build_object('images',provenance),quality_checked_at=null,updated_at=now()where id=r.organization_id;
  new_payload:=(r.old_s->'payload')||jsonb_build_object('artwork_enrichment',provenance);
  update venue_sources set payload=new_payload,payload_hash=encode(extensions.digest(new_payload::text,'sha256'),'hex')where id=(p->>'source_id')::uuid;
  select to_jsonb(v)into after_v from venues v where v.id=r.id;select to_jsonb(o)into after_o from organizations o where o.id=r.organization_id;
  if after_v-array['images','updated_at']is distinct from r.old_v-array['images','updated_at']
   or after_o-array['images','field_provenance','quality_checked_at','updated_at']is distinct from r.old_o-array['images','field_provenance','quality_checked_at','updated_at']
   or(after_o->'field_provenance')-'images'is distinct from(r.old_o->'field_provenance')-'images'
   or new_payload-'artwork_enrichment'is distinct from(r.old_s->'payload')-'artwork_enrichment'then raise exception 'Unrelated publisher or canonical fields changed';end if;
 end loop;
 perform set_config('matching.gayout_artwork_result',jsonb_build_object('dry_run',dry_run,'eligible',eligible,'promoted',case when dry_run then 0 else eligible end,'venue_ids',to_jsonb(ids))::text,true);
end $repair$;
select current_setting('matching.gayout_artwork_result')::jsonb result;
commit;
