-- Default dry run. Only original machine-unresolved cities with no external identity.
-- Input: fresh unique search + settlement proofs from discover-city-classification-evidence.ts.
-- Only identity/classification fields change; publication, lifecycle and pins stay unchanged.
-- Review rows remain unchanged for the native scheduled reconciler.
begin;
set local statement_timeout='60s';set local lock_timeout='2s';
set local app.actor='system:discover-city-identity:v1';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;r record;after_row jsonb;
 checks jsonb;sources jsonb;native jsonb;repaired integer:=0;eligible integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then raise exception 'Review sweep is running';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled)
 then raise exception 'Automatic resolution is paused';end if;
 for r in
 with input as(
 select * from jsonb_to_recordset(coalesce(nullif(current_setting('matching.city_classification_proofs',true),''),'[]')::jsonb)
 as x(id uuid,name text,wikidata_qid text,country_code text,expected_updated_at timestamptz,expected_fingerprint text,
 previous_classification jsonb,status text,reason text,classes jsonb,class_ids jsonb,
 source_latitude double precision,source_longitude double precision,source_url text,observed_at timestamptz,
 entity_payload_sha256 text,entity_payload_text text,human_reviewed boolean,
 discovery_contract text,previous_wikidata_qid text,identity_search jsonb)
 ), single as(select id from input group by id having count(*)=1)
 select x.*,to_jsonb(c) old_row from input x join single using(id)
 join public.cities c on c.id=x.id join public.countries country on country.id=c.country_id
 join public.geo_places g on g.id=c.id and g.place_type='city' and g.duplicate_of_id is null
 join public.geo_cms_verifications verification on verification.place_id=c.id
 where c.duplicate_of_id is null and coalesce(c.shell_status,'real')='real'
 and c.wikidata_qid is null and x.previous_wikidata_qid is null and c.name=x.name and c.updated_at=x.expected_updated_at
 and verification.status in('review','stale') and verification.checks->>'reason'='No corroborated settlement classification'
 and not exists(select 1 from input other where other.id<>x.id and other.wikidata_qid=x.wikidata_qid)
 and country.code=x.country_code and public.geo_cms_fingerprint(c.id)=x.expected_fingerprint
 and c.field_provenance->'city_place_audit' is not distinct from x.previous_classification
 and (c.field_provenance#>>'{city_place_audit,status}'='unresolved'
  and c.field_provenance#>>'{city_place_audit,reason}'='No corroborated settlement classification')
 and not(coalesce(c.field_provenance,'{}') ?| array['wikidata_qid'])
 and coalesce(c.enrichment_status#>>'{disposition,state}','')<>'not_a_city'
 and not exists(select 1 from public.cities other where other.id<>c.id and other.duplicate_of_id is null
  and (other.wikidata_qid=x.wikidata_qid or other.country_id=c.country_id and public.city_canonical_key(other.name)=public.city_canonical_key(c.name)))
 and not exists(select 1 from public.content_revisions revision where revision.source_table='cities' and revision.source_id=c.id
  and revision.actor_kind='human' and revision.changed_fields&&array['shell_status','slug','field_provenance','wikidata_qid','country_id','latitude','longitude','seo_indexable'])
 and not exists(select 1 from public.review_queue q where q.entity_type='city' and q.entity_id=c.id
  and (q.resolved_by is not null
   or lower(q.details->>'hard_blocker')='true' and not coalesce((
    q.status='pending'and q.review_type='CITY_IDENTITY_AMBIGUOUS'and q.details->>'source'='city_quality_profile'
    and q.details->>'city_name'=c.name and q.details->>'city_slug'=c.slug and q.details->>'publication_ready'='false'
    and q.details-array['source','city_name','city_slug','hard_blocker','publication_ready','observed_at']='{}'::jsonb),false)
   or lower(q.details->>'requires_confirm')='true' or lower(q.details->>'force_review')='true'
   or lower(q.details->>'manual_hold')='true' or lower(q.details->>'human_reviewed')='true'))
 and x.status in('municipality','settlement') and x.human_reviewed=false
 and x.observed_at between now()-interval '1 hour' and now()+interval '5 minutes'
 and x.discovery_contract='city_missing_identity.v1' and x.wikidata_qid~'^Q[1-9][0-9]*$'
 and x.source_url='https://www.wikidata.org/wiki/'||x.wikidata_qid
 and x.identity_search->>'url' like 'https://www.wikidata.org/w/api.php?%'
 and x.identity_search->>'sha256'=encode(extensions.digest(x.identity_search->>'payload_text','sha256'),'hex')
 and pg_input_is_valid(x.identity_search->>'observed_at','timestamp with time zone')
 and (x.identity_search->>'observed_at')::timestamptz between now()-interval '1 hour' and now()+interval '5 minutes'
 and jsonb_typeof((x.identity_search->>'payload_text')::jsonb->'search')='array'
 and jsonb_array_length((x.identity_search->>'payload_text')::jsonb->'search')<50
 and not((x.identity_search->>'payload_text')::jsonb ?|array['search-continue','error'])
 and exists(select 1 from jsonb_array_elements((x.identity_search->>'payload_text')::jsonb->'search')hit where hit->>'id'=x.wikidata_qid)
 and x.entity_payload_sha256=encode(extensions.digest(x.entity_payload_text,'sha256'),'hex')
 and (x.entity_payload_text::jsonb)->>'id'=x.wikidata_qid
 and coalesce((x.entity_payload_text::jsonb)#>'{claims,P576}','[]')='[]'::jsonb
 and jsonb_typeof(x.classes)='array' and jsonb_array_length(x.classes)>0
 and jsonb_array_length(x.class_ids)=jsonb_array_length(x.classes)
 and x.source_latitude between -90 and 90 and x.source_longitude between -180 and 180
 and public.haversine_m(c.latitude::numeric,c.longitude::numeric,x.source_latitude::numeric,x.source_longitude::numeric)<=2000
 and exists(select 1 from public.geo_country_at(c.latitude,c.longitude) boundary where boundary.iso_a2=country.code)
 order by c.id limit greatest(0,least(batch_size,50)) for update of c,g,verification skip locked
 loop
  -- A machine publication blocker describes the missing fact, not ownership
  -- of that fact. It stays unchanged here. Lock/recheck reviews so a human hold
  -- added after selection wins before any factual mutation.
  begin
   perform 1 from public.review_queue q where q.entity_type='city'and q.entity_id=r.id for update nowait;
  exception when lock_not_available then continue;end;
  if exists(select 1 from public.review_queue q where q.entity_type='city'and q.entity_id=r.id
   and(q.resolved_by is not null
    or lower(q.details->>'hard_blocker')='true'and not coalesce((
     q.status='pending'and q.review_type='CITY_IDENTITY_AMBIGUOUS'and q.details->>'source'='city_quality_profile'
     and q.details->>'city_name'=r.name and q.details->>'city_slug'=r.old_row->>'slug'and q.details->>'publication_ready'='false'
     and q.details-array['source','city_name','city_slug','hard_blocker','publication_ready','observed_at']='{}'::jsonb),false)
    or lower(q.details->>'requires_confirm')='true' or lower(q.details->>'force_review')='true'
    or lower(q.details->>'manual_hold')='true' or lower(q.details->>'human_reviewed')='true'))then continue;end if;
  eligible:=eligible+1;if dry_run then continue;end if;
  update public.cities c set wikidata_qid=r.wikidata_qid,updated_at=now(),
   field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object(
    'city_place_audit',jsonb_build_object('at',now(),'status',r.status,'reason',r.reason,'classes',r.classes,'class_ids',r.class_ids,
     'sources',jsonb_build_array(r.source_url),'before',jsonb_build_object('city_place_audit',r.previous_classification),
     'source_capture',jsonb_build_object('url',r.source_url,'entity_payload_sha256',r.entity_payload_sha256,
      'observed_at',r.observed_at,'country_code',r.country_code,'source_latitude',r.source_latitude,
      'source_longitude',r.source_longitude,'contract','city_missing_identity.v1','human_reviewed',false)),
    'wikidata_qid',jsonb_build_object('source','city_missing_identity.v1','previous_value',null,
     'value',r.wikidata_qid,'at',now(),'source_url',r.source_url,'identity_search',r.identity_search,
     'entity_payload_text',r.entity_payload_text,'entity_payload_sha256',r.entity_payload_sha256,'human_reviewed',false))where c.id=r.id;
  native:=public.geo_cms_verify(r.id);
  checks:=native#>'{verification,checks}';sources:=native#>'{verification,sources}';
  if checks->>'country_match' is distinct from 'true' then raise exception 'Native polygon changed %',r.id;end if;
  checks:=checks||jsonb_build_object('wikidata_qid',r.wikidata_qid,'identity_verified',true,'coordinates_verified',true,
   'parent_verified',true,'city_classification',r.status,'human_reviewed',false,
   'reason','Current source name, settlement class, country, coordinates and native country polygon agree');
  sources:=sources||jsonb_build_array(jsonb_build_object('title','Wikidata named settlement and classification','url',r.source_url,
   'version',r.observed_at,'entity_payload_sha256',r.entity_payload_sha256,'classes',r.classes,'country_code',r.country_code,
   'source_latitude',r.source_latitude,'source_longitude',r.source_longitude,'human_reviewed',false));
  perform public.geo_cms_record_evidence(r.id,public.geo_cms_fingerprint(r.id),checks,sources);
  if not exists(select 1 from public.geo_cms_verifications where place_id=r.id and status='verified')
  then raise exception 'Identity did not verify %',r.id;end if;
  select to_jsonb(c) into after_row from public.cities c where c.id=r.id;
  if after_row-'field_provenance'-'updated_at'-'wikidata_qid' is distinct from r.old_row-'field_provenance'-'updated_at'-'wikidata_qid'
   or (after_row->'field_provenance')-'city_place_audit'-'wikidata_qid' is distinct from (r.old_row->'field_provenance')-'city_place_audit'-'wikidata_qid'
   or after_row->>'wikidata_qid' is distinct from r.wikidata_qid
  then raise exception 'Unexpected city mutation %',r.id;end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('city',r.id,'city_missing_identity.v1',r.old_row,after_row);
  -- Native scheduled reconciliation owns review findings. This operator changes
  -- factual identity/classification fields and their source evidence only.
  repaired:=repaired+1;
 end loop;
 perform set_config('matching.city_identity_result',jsonb_build_object('dry_run',dry_run,'eligible',eligible,'repaired',repaired)::text,false);
end $repair$;
select current_setting('matching.city_identity_result')::jsonb result;
commit;
