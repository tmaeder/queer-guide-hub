-- Extend the existing archived-source contract only for individually verified AccessDenied artwork.
-- Physical media quality, publication and human decisions remain unchanged.
create or replace function api_private.historical_graph_artwork_scope(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $scope$
declare e public.events;s public.event_sources;ld jsonb;image jsonb;fact jsonb;item jsonb;values_array jsonb;
 api_reference text;candidate text;retired_bucket boolean:=false;contract_name text:='gaycities-wayback-graph-artwork:v1';source_count integer:=0;declared_exclusion boolean:=false;
 records jsonb:='[]';semantics jsonb:='[]';proof jsonb;context jsonb;
begin
 select * into e from public.events where id=p_event_id;
 if not found or e.duplicate_of_id is not null or e.status is distinct from 'completed'
  or coalesce(e.end_date,e.start_date)is null or coalesce(e.end_date,e.start_date)>=now()-interval '1 day'
  or e.start_date is null or coalesce(e.external_id,'')!~'^[1-9][0-9]*$'
  or coalesce(cardinality(e.images),0)>1 then return null;end if;
 if (e.field_provenance->'images'is not null and jsonb_typeof(e.field_provenance->'images')not in('object','null'))
  or coalesce(e.field_provenance#>>'{images,human_reviewed}','false')='true'
  or coalesce(e.field_provenance#>>'{images,actor_kind}','')='human'
  or coalesce(e.field_provenance#>>'{images,source}','')in('human','manual','user_submission','admin_upload')
  or exists(select 1 from public.content_revisions revision where revision.source_table='events' and revision.source_id=e.id
   and revision.actor_kind='human' and revision.changed_fields&&array['images'])
  or exists(select 1 from public.event_quality_issues issue where issue.event_id=e.id and issue.dimension='media'and(
   issue.reviewed_by is not null
   or(issue.status='accepted'and coalesce(issue.resolution,'')not like 'auto-source-artwork-unavailable:v1 %')
   or(issue.status='open'and(issue.severity='critical'or issue.reviewed_at is not null
    or(nullif(issue.resolution,'')is not null and issue.resolution not like 'auto-source-artwork-unavailable:invalidated:v1 %')))))
   then return null;end if;
 for s in select * from public.event_sources where event_id=e.id order by id loop
  source_count:=source_count+1;
  if source_count>10 or s.source_slug is distinct from 'gaycities' or s.source_entity_id is distinct from e.external_id
   or coalesce(length(s.payload_hash),0)<16 or s.source_url is null
   or s.source_url!~'^https://[a-z0-9-]+[.]gaycities[.]com/events/[1-9][0-9]*-[^[:space:]?#]+$'
   or split_part(regexp_replace(s.source_url,'^https://[^/]+/events/',''),'-',1)<>s.source_entity_id
   or s.payload#>>'{raw,url}' is distinct from s.source_url
   or s.payload#>'{raw,fromWayback}' is distinct from 'true'::jsonb
   or s.payload#>'{normalized,metadata,from_wayback}' is distinct from 'true'::jsonb
   then return null;end if;
  ld:=s.payload#>'{raw,jsonLd}';
  if jsonb_typeof(ld)is distinct from 'object' or ld->'_legacyTemplate'is distinct from 'true'::jsonb
   or left(ld->>'startDate',10)is distinct from left(e.start_date::text,10)
   or nullif(btrim(ld->>'name'),'')is null
   or btrim(regexp_replace(lower(extensions.unaccent(ld->>'name')),'[^[:alnum:]]+',' ','g'))
    is distinct from btrim(regexp_replace(lower(extensions.unaccent(e.title)),'[^[:alnum:]]+',' ','g'))
   then return null;end if;
  image:=ld->'image';
  if jsonb_typeof(image)is distinct from 'array' then return null;end if;
  if jsonb_array_length(image)<>1 or jsonb_typeof(image->0)is distinct from 'string' then return null;end if;
  candidate:=regexp_replace(image->>0,'^http:','https:');
  if candidate~'^https://gaycities-featured-images-production[.]s3[.]amazonaws[.]com/events/[A-Za-z0-9._-]+[.](jpg|jpeg|png|webp)$'
   and coalesce(cardinality(e.images),0)=0 then
   retired_bucket:=true;contract_name:='gaycities-wayback-retired-bucket-artwork:v1';
  elsif candidate!~'^https://graph[.]facebook[.]com/[1-9][0-9]*/picture([?&]type=(large|normal|square))?$' then return null;end if;
  if api_reference is not null and candidate<>api_reference then return null;end if;
  api_reference:=candidate;
  -- Any other supplied image must be recovered, rather than called unavailable.
  for fact in select value from jsonb_array_elements(jsonb_build_array(
   ld->'thumbnailUrl',ld->'thumbnail',ld->'primaryImageOfPage',
   s.payload#>'{raw,images}',s.payload#>'{raw,image_url}',s.payload#>'{raw,photos}',s.payload#>'{raw,cover_image_url}',
   s.payload#>'{normalized,images}',s.payload#>'{normalized,image_url}',s.payload#>'{normalized,imageUrl}',
   s.payload#>'{normalized,metadata,image_url}',s.payload#>'{enriched,images}',s.payload#>'{enriched,image_url}',
   s.payload#>'{enriched,imageUrl}',s.payload#>'{enriched,photos}'))loop
   if fact is null or fact in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)then continue;end if;
   if jsonb_typeof(fact)='string'then values_array:=jsonb_build_array(fact);
   elsif jsonb_typeof(fact)='array'then values_array:=fact;else return null;end if;
   for item in select value from jsonb_array_elements(values_array)loop
    if jsonb_typeof(item)is distinct from 'string'
     or regexp_replace(item#>>'{}','^http:','https:')<>api_reference then return null;end if;
   end loop;
  end loop;
  declared_exclusion:=declared_exclusion or (
   s.payload#>>'{normalized,metadata,artwork_exclusion,contract}'='gaycities-wayback-graph-artwork:v1'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,outcome}'='source_unavailable'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,reason}'='api_reference_excluded'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,api_reference}'=api_reference
   and s.payload#>'{normalized,metadata,artwork_exclusion,human_reviewed}'='false'::jsonb);
  records:=records||jsonb_build_array(jsonb_build_object('id',s.id,'source_slug',s.source_slug,
   'source_entity_id',s.source_entity_id,'source_url',s.source_url,'payload_hash',s.payload_hash));
  semantics:=semantics||jsonb_build_array(jsonb_build_object('id',s.id,'source_entity_id',s.source_entity_id,
   'source_url',s.source_url,'api_reference',api_reference,'source_name',ld->>'name','source_date',left(ld->>'startDate',10)));
 end loop;
 if source_count=0 or api_reference is null then return null;end if;
 if coalesce(cardinality(e.images),0)=1 and regexp_replace(e.images[1],'^http:','https:')<>api_reference then return null;end if;
 if retired_bucket then
  -- An old failure must never hide a newer successful observation, including
  -- the same registered URL with its HTTP/HTTPS spelling normalized.
  select jsonb_build_object('image_url',observation.image_url,'http_status',observation.http_status,
   'mime_type',observation.mime_type,'reason',observation.failure_reason,'observed_at',observation.checked_at,
   'response_sha256',observation.content_hash,'probe_status',observation.probe_status)
  into proof from public.event_image_quality_observations observation
  where observation.event_id=e.id and regexp_replace(observation.image_url,'^http:','https:')=api_reference
  order by observation.checked_at desc limit 1;
  if proof is null or proof->>'probe_status'is distinct from 'fail' or proof->>'http_status'is distinct from '403'
   or coalesce(proof->>'mime_type','')not like 'application/xml%' or proof->>'reason'is distinct from 'retired_source_bucket:AccessDenied'
   or coalesce(proof->>'response_sha256','')!~'^[a-f0-9]{64}$' then return null;end if;
 else
 select jsonb_build_object('image_url',observation.image_url,'http_status',observation.http_status,
  'mime_type',observation.mime_type,'reason',observation.failure_reason,'observed_at',observation.checked_at)
 into proof from public.event_image_quality_observations observation
 where observation.event_id=e.id and regexp_replace(observation.image_url,'^http:','https:')=api_reference
  and observation.probe_status='fail' and observation.http_status in(200,400)
  and observation.mime_type like 'application/json%'
 order by observation.checked_at desc limit 1;
 if proof is null and not(coalesce(cardinality(e.images),0)=0 and coalesce(declared_exclusion,false))then return null;end if;
 end if;
 context:=jsonb_build_object('event_id',e.id,'title',e.title,'external_id',e.external_id,
  'start_date',e.start_date,'end_date',e.end_date,'status',e.status,'images',coalesce(to_jsonb(e.images),'[]'),
  'source_semantics',semantics,'contract',contract_name);
 return jsonb_build_object('contract',contract_name,'outcome','source_unavailable',
  'reason',case when retired_bucket then 'The only artwork supplied by every registered archive record is in the retired source bucket and returned a verified AccessDenied response; no alternative source artwork is supplied.' else 'The registered archived event importer supplies an API reference, not reusable artwork; no alternative artwork is supplied by its registered records.' end,
  'api_reference',api_reference,'source_records',records,'non_image_response',proof,
  'importer_exclusion',coalesce(declared_exclusion,false),'human_reviewed',false,
  'context_hash',encode(extensions.digest(context::text,'sha256'),'hex'));
end $scope$;
revoke all on function api_private.historical_graph_artwork_scope(uuid)from public,anon,authenticated;
grant execute on function api_private.historical_graph_artwork_scope(uuid)to service_role;


-- Successful new source evidence must invalidate an earlier unavailable outcome.
-- Preserve the existing lock order and ownership checks in the shared invalidator.
do $patch$
declare body text;anchor text:=$a$if tg_table_name='event_sources'then$a$;
begin
 select pg_get_functiondef('api_private.invalidate_historical_graph_artwork()'::regprocedure)into body;
 if position(anchor in body)=0 then raise exception 'Historical artwork invalidator drift';end if;
 body:=replace(body,anchor,$a$if tg_table_name in('event_sources','event_image_quality_observations')then$a$);
 anchor:=$a$  scope:=api_private.historical_graph_artwork_scope(affected_id);invalidated:=0;$a$;
 if position(anchor in body)=0 then raise exception 'Historical artwork invalidator scope drift';end if;
 body:=replace(body,anchor,$a$  if tg_table_name='event_image_quality_observations'and not exists(
   select 1 from public.event_quality_issues existing where existing.event_id=affected_id
    and existing.status='accepted'and existing.reviewed_by is null and left(existing.resolution,length(prefix))=prefix)
   then continue;end if;
  scope:=api_private.historical_graph_artwork_scope(affected_id);invalidated:=0;$a$);
 execute body;
end $patch$;
create trigger invalidate_historical_artwork_observation
after insert or update or delete on public.event_image_quality_observations
for each row execute function api_private.invalidate_historical_graph_artwork();
