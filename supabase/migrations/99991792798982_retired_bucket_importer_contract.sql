-- New complete archive captures explicitly record the existing DEAD_IMAGE_HOSTS
-- importer limitation. Older captures still require an individual verified 403.
-- A successful source observation always overrides the importer exclusion.
do $patch$
declare body text;anchor text;
begin
 select pg_get_functiondef('api_private.historical_graph_artwork_scope(uuid)'::regprocedure)into body;
 anchor:='declared_exclusion boolean:=false;';
 if position(anchor in body)=0 then raise exception 'Source exclusion declaration drift';end if;
 body:=replace(body,anchor,anchor||'all_retired_exclusions boolean:=true;');
 anchor:=$a$  records:=records||jsonb_build_array$a$;
 if position(anchor in body)=0 then raise exception 'Source exclusion records drift';end if;
 body:=replace(body,anchor,$a$  all_retired_exclusions:=all_retired_exclusions and coalesce(
   s.payload#>>'{normalized,metadata,artwork_exclusion,contract}'='gaycities-wayback-retired-bucket-artwork:v1'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,outcome}'='source_unavailable'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,reason}'='retired_source_bucket_excluded'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,api_reference}'=api_reference
   and s.payload#>'{normalized,metadata,artwork_exclusion,human_reviewed}'='false'::jsonb,false);
$a$||anchor);
 anchor:=$a$  if proof is null or proof->>'probe_status'is distinct from 'fail' or proof->>'http_status'is distinct from '403'
   or coalesce(proof->>'mime_type','')not like 'application/xml%' or proof->>'reason'is distinct from 'retired_source_bucket:AccessDenied'
   or coalesce(proof->>'response_sha256','')!~'^[a-f0-9]{64}$' then return null;end if;$a$;
 if position(anchor in body)=0 then raise exception 'Retired source proof guard drift';end if;
 body:=replace(body,anchor,$a$  if proof->>'probe_status'='pass'then return null;end if;
  if proof is null or proof->>'probe_status'is distinct from 'fail' or proof->>'http_status'is distinct from '403'
   or coalesce(proof->>'mime_type','')not like 'application/xml%' or proof->>'reason'is distinct from 'retired_source_bucket:AccessDenied'
   or coalesce(proof->>'response_sha256','')!~'^[a-f0-9]{64}$'then
   if not all_retired_exclusions then return null;end if;
   proof:=null;
  end if;
  declared_exclusion:=all_retired_exclusions;$a$);
 anchor:=$a$'reason',case when retired_bucket then$a$;
 if position(anchor in body)=0 then raise exception 'Retired source reason drift';end if;
 body:=replace(body,anchor,$a$'reason',case when retired_bucket and proof is null then
   'Every registered complete archive capture explicitly excludes the retired artwork bucket under the maintained importer policy; the importer supplies no reusable artwork and no alternative source artwork is registered.'
  when retired_bucket then$a$);
 execute body;
end $patch$;
