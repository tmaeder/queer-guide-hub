-- Default dry run. Replace only an original machine-generated unresolved
-- classification using fresh named/country/coordinate/class source evidence.
-- Native geography RPCs retain polygon checks and fingerprint compare-and-swap.
-- This does not run city-quality issue synchronization or change publication.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:corroborate-city-classification:v1';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;r record;after_row jsonb;record_json jsonb;
 checks jsonb;sources jsonb;classified integer:=0;verified integer:=0;kept_review integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal actor required';end if;
 for r in
 with input as(
 select * from jsonb_to_recordset(coalesce(nullif(current_setting('matching.city_classification_proofs',true),''),'[]')::jsonb)
 as x(id uuid,name text,wikidata_qid text,country_code text,expected_updated_at timestamptz,expected_fingerprint text,
 previous_classification jsonb,status text,reason text,classes jsonb,class_ids jsonb,country_ids jsonb,
 source_latitude double precision,source_longitude double precision,source_url text,observed_at timestamptz,
 entity_payload_sha256 text,human_reviewed boolean)
 ), single as(select id from input group by id having count(*)=1)
 select x.*,to_jsonb(c) old_row from input x join single using(id)
 join cities c on c.id=x.id join countries country on country.id=c.country_id
 join geo_places g on g.id=c.id and g.place_type='city' and g.duplicate_of_id is null
 join geo_cms_verifications verification on verification.place_id=g.id
 where c.duplicate_of_id is null and coalesce(c.shell_status,'real')='real'
 and c.wikidata_qid=x.wikidata_qid and c.name=x.name and c.updated_at=x.expected_updated_at
 and country.code=x.country_code and public.geo_cms_fingerprint(c.id)=x.expected_fingerprint
 and c.field_provenance->'city_place_audit'=x.previous_classification
 and c.field_provenance#>>'{city_place_audit,status}'='unresolved'
 and c.field_provenance#>>'{city_place_audit,reason}'='No corroborated settlement classification'
 and coalesce(c.enrichment_status#>>'{disposition,state}','')<>'not_a_city'
 and verification.status in('review','stale')
 and verification.checks->>'reason'='No corroborated settlement classification'
 and not exists(select 1 from content_revisions revision where revision.source_table='cities' and revision.source_id=c.id
  and revision.actor_kind='human' and revision.changed_fields&&array['field_provenance','wikidata_qid','country_id','latitude','longitude'])
 and x.status in('municipality','settlement') and x.human_reviewed=false
 and x.observed_at between now()-interval '1 hour' and now()+interval '5 minutes'
 and x.source_url='https://www.wikidata.org/wiki/'||c.wikidata_qid
 and x.entity_payload_sha256~'^[a-f0-9]{64}$'
 and jsonb_typeof(x.classes)='array' and jsonb_array_length(x.classes)>0
 and jsonb_array_length(x.class_ids)=jsonb_array_length(x.classes)
 and x.source_latitude between -90 and 90 and x.source_longitude between -180 and 180
 and public.haversine_m(c.latitude::numeric,c.longitude::numeric,x.source_latitude::numeric,x.source_longitude::numeric)<=10000
 order by c.id limit greatest(0,least(batch_size,50)) for update of c,g,verification skip locked
 loop
  classified:=classified+1;if dry_run then continue;end if;
  update cities c set updated_at=now(),field_provenance=field_provenance||jsonb_build_object('city_place_audit',
   jsonb_build_object('at',now(),'status',r.status,'reason',r.reason,'classes',r.classes,'class_ids',r.class_ids,
    'sources',jsonb_build_array(r.source_url),'fingerprint',r.expected_fingerprint,
    'before',jsonb_build_object('city_place_audit',r.previous_classification),
    'source_capture',jsonb_build_object('url',r.source_url,'entity_payload_sha256',r.entity_payload_sha256,
     'observed_at',r.observed_at,'country_code',r.country_code,'source_latitude',r.source_latitude,
     'source_longitude',r.source_longitude,'contract','corroborated_city_classification:v1','human_reviewed',false)))
   where c.id=r.id;
  record_json:=public.geo_cms_verify(r.id);
  checks:=record_json#>'{verification,checks}';sources:=record_json#>'{verification,sources}';
  checks:=checks||jsonb_build_object('wikidata_qid',r.wikidata_qid,'identity_verified',true,'coordinates_verified',true,
   'parent_verified',true,'city_classification',r.status,'human_reviewed',false,
   'reason',case when checks->>'country_match'='true' then 'Current source name, settlement class, country, coordinates and native country polygon agree'
    else 'Settlement classification corroborated; native country polygon evidence still requires review' end);
  sources:=sources||jsonb_build_array(jsonb_build_object('title','Wikidata named settlement and classification','url',r.source_url,
   'version',r.observed_at,'entity_payload_sha256',r.entity_payload_sha256,'classes',r.classes,'country_code',r.country_code,
   'source_latitude',r.source_latitude,'source_longitude',r.source_longitude,'human_reviewed',false));
  perform public.geo_cms_record_evidence(r.id,public.geo_cms_fingerprint(r.id),checks,sources);
  if exists(select 1 from geo_cms_verifications where place_id=r.id and status='verified')then verified:=verified+1;else kept_review:=kept_review+1;end if;
  select to_jsonb(c)into after_row from cities c where c.id=r.id;
  if after_row-'field_provenance'-'updated_at' is distinct from r.old_row-'field_provenance'-'updated_at'
   or (after_row->'field_provenance')-'city_place_audit' is distinct from (r.old_row->'field_provenance')-'city_place_audit'
  then raise exception 'Unexpected city content mutation %',r.id;end if;
 end loop;
 perform set_config('matching.city_classification_result',jsonb_build_object('dry_run',dry_run,'classified',classified,'geography_verified',verified,'geography_requires_review',kept_review)::text,false);
end $repair$;
select current_setting('matching.city_classification_result')::jsonb result;
commit;
