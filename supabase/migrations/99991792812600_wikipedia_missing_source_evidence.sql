-- A current official API missing-page response is evidence about that exact
-- registered source, never a business-quality pass or an entity-existence claim.
create table api_private.venue_source_presence_observations(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.venue_sources(id)on delete cascade,
 source_payload_hash text not null,source_url text not null,requested_title text not null,
 result text not null check(result in('missing','present')),selected_page jsonb not null,
 selected_page_sha256 text not null check(selected_page_sha256~'^[a-f0-9]{64}$'),
 response_sha256 text not null check(response_sha256~'^[a-f0-9]{64}$'),api_url text not null,
 observed_at timestamptz not null,created_at timestamptz not null default now());
create unique index venue_source_presence_capture on api_private.venue_source_presence_observations(source_id,source_payload_hash,result,selected_page_sha256,observed_at);
create index venue_source_presence_latest on api_private.venue_source_presence_observations(source_id,observed_at desc,id desc);
revoke all on api_private.venue_source_presence_observations from public,anon,authenticated,service_role;

create function api_private.registered_wikipedia_source_title(p_url text,p_id text)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare title text;identity_title text;
begin
 if p_url is null or p_id is null or p_url!~'^https://en[.]wikipedia[.]org/wiki/[^?#[:space:]]+$'
  or p_id not like 'wp:%'then return null;end if;
 title:=replace(public.url_decode(replace(substring(p_url from length('https://en.wikipedia.org/wiki/')+1),'+','%2B')),'_',' ');
 identity_title:=replace(split_part(substring(p_id from 4),'|',1),'_',' ');
 if length(title)not between 1 and 300 or title<>identity_title or title~'[:#|[:cntrl:]]'then return null;end if;
 return title;
exception when character_not_in_repertoire or invalid_parameter_value or invalid_text_representation then return null;
end $$;
revoke all on function api_private.registered_wikipedia_source_title(text,text)from public,anon,authenticated;

create function api_private.organization_missing_wikipedia_source(p_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('contract','registered-wikipedia-missing-page:v1','outcome','source_unavailable',
 'unavailable_dimensions','["editorial","contact","media"]'::jsonb,'source_table','venues','source_venue_id',v.id,
 'source_records',jsonb_build_array(jsonb_build_object('id',s.id,'source_slug',s.source_slug,'source_entity_id',s.source_entity_id,
 'source_url',s.source_url,'payload_hash',s.payload_hash)),
 'observation_id',observation.id,'observed_at',observation.observed_at,'requested_title',observation.requested_title,
 'selected_page_sha256',observation.selected_page_sha256,'response_sha256',observation.response_sha256,
 'api_url',observation.api_url,'api_page',observation.selected_page,'human_reviewed',false,
 'explanation','The official Wikipedia API reported this exact sole registered article missing. No business prose, contact or reusable media is supplied by the registered record. Existing facts and identity decisions remain applicable; new source evidence invalidates this outcome.')
 from organizations o join venues v on v.id=o.primary_venue_id and v.organization_id=o.id
 join venue_sources s on s.venue_id=v.id
 cross join lateral(select x.*from api_private.venue_source_presence_observations x where x.source_id=s.id order by x.observed_at desc,(x.result='present')desc,x.created_at desc,x.id desc limit 1)observation
 where o.id=p_id and o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
 and o.status='active'and o.claim_status='unclaimed'and o.last_verified_at is null and o.roles=array['venue']::text[]
 and o.field_provenance#>>'{identity,source}'='unified_location'
 and lower(btrim(o.name))=lower(btrim(v.name))and o.city_id is not distinct from v.city_id and o.country_id is not distinct from v.country_id
 and s.source_slug='nude-places'and s.payload#>>'{normalized,metadata,source}'='wikipedia'
 and lower(btrim(coalesce(s.payload#>>'{raw,name}',s.payload#>>'{normalized,name}')))=lower(btrim(v.name))
 and observation.source_payload_hash=s.payload_hash and observation.source_url=s.source_url and observation.result='missing'
 and observation.requested_title=api_private.registered_wikipedia_source_title(s.source_url,s.source_entity_id)
 and not exists(select 1 from venue_sources other where other.venue_id=v.id and other.id<>s.id)
 and not exists(select 1 from venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
 and not(o.field_provenance?|array['description','website','website_domain','phone','email','social','images','logo_url','cover_image_url'])
 and not exists(select 1 from entity_quality_findings f where f.entity_type='organization'and f.entity_id=o.id
  and(f.waived_at is not null or f.waived_by is not null or f.evidence?'governance_resolution'))
 and not exists(select 1 from content_revisions r where r.source_table in('venues','organizations')and r.source_id in(v.id,o.id)
  and r.actor_kind='human'and r.changed_fields&&array['description','website','phone','email','images','logo_url','cover_image_url'])
 and not exists(select 1 from venue_review_queue q where q.venue_id=v.id and q.status in('open','rejected')
  and q.field in('description','website','phone','email','images','logo_url','cover_image_url'))
 and not exists(select 1 from(values(s.payload->'raw'),(s.payload->'normalized'),(s.payload->'enriched'),(s.payload#>'{normalized,metadata}'))sections(data)
  cross join lateral jsonb_each(case when jsonb_typeof(data)='object'then data else '{}'::jsonb end)fact
  where fact.value not in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb,'"[]"'::jsonb,'"{}"'::jsonb)
  and(fact.key in('website','website_url','phone','phone_e164','telephone','email','contacts','social','images','photos','image_url','logo_url','cover_image_url')
   or(fact.key='description'and fact.value#>>'{}'not in(v.name,
    coalesce('Social nudity place in '||coalesce(s.payload#>>'{raw,country}',s.payload#>>'{normalized,metadata,country_name}')||'.','')))))
$$;
revoke all on function api_private.organization_missing_wikipedia_source(uuid)from public,anon,authenticated;

create function public.register_wikipedia_source_observations(p_proofs jsonb,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare p jsonb;page jsonb;r record;title text;after_org jsonb;ready int:=0;recorded int:=0;protected int:=0;invalidated int:=0;was_limited boolean;is_limited boolean;ids uuid[]:='{}';
begin
 perform public.assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal source evidence only';end if;
 if jsonb_typeof(p_proofs)is distinct from 'array'or jsonb_array_length(p_proofs)>100 then raise exception 'At most one hundred observations';end if;
 if exists(select 1 from jsonb_array_elements(p_proofs)p group by p->>'source_id'having count(*)>1)then raise exception 'Repeated source identities';end if;
 if not pg_try_advisory_xact_lock(hashtext('business_quality_lifecycle'))then return jsonb_build_object('dry_run',p_dry_run,'skipped',true,'reason','native_business_producer_busy');end if;
 for p in select value from jsonb_array_elements(p_proofs)loop
  if p->>'contract'is distinct from 'registered_wikipedia_page_presence:v1'or p->>'human_reviewed'is distinct from 'false'
   or p->>'http_status'is distinct from '200'or coalesce(p->>'result','')not in('missing','present')
   or not coalesce(pg_input_is_valid(p->>'source_id','uuid'),false)or not coalesce(pg_input_is_valid(p->>'id','uuid'),false)
   or not coalesce(pg_input_is_valid(p->>'selected_page_json','jsonb'),false)
   or not coalesce(pg_input_is_valid(p->>'observed_at','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p->>'updated_at','timestamp with time zone'),false)
   or coalesce(p->>'api_url','')!~'^https://en[.]wikipedia[.]org/w/api[.]php[?]action=query[&]format=json[&]formatversion=2[&]'
   or coalesce(p->>'response_sha256','')!~'^[a-f0-9]{64}$'
   or encode(extensions.digest(p->>'selected_page_json','sha256'),'hex')is distinct from p->>'selected_page_sha256'
   then protected:=protected+1;continue;end if;
  if(p->>'observed_at')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'then protected:=protected+1;continue;end if;
  title:=api_private.registered_wikipedia_source_title(p->>'source_url',p->>'source_entity_id');page:=(p->>'selected_page_json')::jsonb;
  if title is null or title is distinct from p->>'requested_title'or jsonb_typeof(page)is distinct from 'object'
   or jsonb_typeof(page->'ns')is distinct from 'number'or page->>'ns'is distinct from '0'or page?'invalid'
   or coalesce(page->>'title','')not in(title,upper(left(title,1))||substring(title from 2))
   or(p->>'result'='missing'and(page->'missing'is distinct from 'true'::jsonb or page?'pageid'))
   or(p->>'result'='present'and(page->'missing'is distinct from 'false'::jsonb
    or jsonb_typeof(page->'pageid')is distinct from 'number'or not coalesce(pg_input_is_valid(page->>'pageid','bigint'),false)))then protected:=protected+1;continue;end if;
  if p->>'result'='present'and(page->>'pageid')::bigint<1 then protected:=protected+1;continue;end if;
  select s.id source_id,o.id organization_id,to_jsonb(o)old_org into r
   from venue_sources s join venues v on v.id=s.venue_id join organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
   where s.id=(p->>'source_id')::uuid and v.id=(p->>'id')::uuid and v.name=p->>'name'and v.updated_at=(p->>'updated_at')::timestamptz
    and s.source_slug='nude-places'and s.payload#>>'{normalized,metadata,source}'='wikipedia'
    and s.payload_hash=p->>'payload_hash'and s.source_url=p->>'source_url'and s.source_entity_id=p->>'source_entity_id'
    and o.id=(p->>'organization_id')::uuid and o.duplicate_of_id is null and v.duplicate_of_id is null
   for update of s,v,o skip locked;
  if not found then protected:=protected+1;continue;end if;
  if exists(select 1 from api_private.venue_source_presence_observations x where x.source_id=r.source_id
   and x.source_payload_hash=p->>'payload_hash'and x.result=p->>'result'and x.selected_page_sha256=p->>'selected_page_sha256'
   and x.observed_at=(p->>'observed_at')::timestamptz)then continue;end if;
  ready:=ready+1;if p_dry_run then continue;end if;
  was_limited:=api_private.organization_missing_wikipedia_source(r.organization_id)is not null;
  insert into api_private.venue_source_presence_observations(source_id,source_payload_hash,source_url,requested_title,result,selected_page,
   selected_page_sha256,response_sha256,api_url,observed_at)
   values(r.source_id,p->>'payload_hash',p->>'source_url',title,p->>'result',page,p->>'selected_page_sha256',p->>'response_sha256',p->>'api_url',(p->>'observed_at')::timestamptz);
  is_limited:=api_private.organization_missing_wikipedia_source(r.organization_id)is not null;
  if was_limited is distinct from is_limited then
   update organizations set quality_checked_at=null where id=r.organization_id;
   invalidated:=invalidated+1;ids:=array_append(ids,r.organization_id);
  end if;
  select to_jsonb(o)into after_org from organizations o where o.id=r.organization_id;
  if after_org-array['quality_checked_at','updated_at']is distinct from r.old_org-array['quality_checked_at','updated_at']then raise exception 'Unexpected business mutation';end if;
  recorded:=recorded+1;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'ready',ready,'observations_recorded',recorded,'profiles_invalidated',invalidated,'protected_or_changed',protected,'organization_ids',ids);
end $$;
revoke all on function public.register_wikipedia_source_observations(jsonb,boolean)from public,anon,authenticated;
grant execute on function public.register_wikipedia_source_observations(jsonb,boolean)to service_role;

-- Ordinary reassessment owns finding state and scores, including existing facts.
do $patch$
declare src text;code text;old_selector text:='public.organization_facts_only_source(o.id) source_contract';
 new_selector text:='coalesce(public.organization_facts_only_source(o.id),api_private.organization_missing_wikipedia_source(o.id)) source_contract';
begin
 src:=pg_get_functiondef('public.refresh_business_brand_quality()'::regprocedure);
 code:=regexp_replace(src,'--[^'||chr(10)||']*','','g');
 if(length(code)-length(replace(code,old_selector,'')))/length(old_selector)<>1 then raise exception 'Business source selector drift';end if;
 execute replace(src,old_selector,new_selector);
end $patch$;
