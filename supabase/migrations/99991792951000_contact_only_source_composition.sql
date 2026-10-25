-- A registered phone-only capture supplies no editorial prose or reusable media.
-- Preserve the original facts-only import contract alongside that exact overlay.
create function api_private.overture_phone_source_is_contact_only(s public.venue_sources)
returns boolean language plpgsql stable set search_path=public,pg_temp as $fn$
declare p jsonb:=s.payload;c jsonb;raw jsonb;decoded jsonb;phone jsonb;
begin
 if jsonb_typeof(p)is distinct from 'object'then return false;end if;
 if s.source_slug is distinct from 'overture' or s.is_primary is distinct from false
  or jsonb_typeof(p)is distinct from 'object' or p->>'contract'is distinct from 'overture_phone_capture:v1'
  or s.payload_hash is distinct from encode(extensions.digest(p::text,'sha256'),'hex')
  or exists(select 1 from jsonb_object_keys(p)k where k not in('raw','normalized','capture','contract'))then return false;end if;
 c:=p->'capture';raw:=p->'raw';
 if jsonb_typeof(c)is distinct from 'object'or jsonb_typeof(raw)is distinct from 'object'
  or jsonb_typeof(p->'normalized')is distinct from 'object'or jsonb_typeof(p#>'{normalized,contacts}')is distinct from 'object'then return false;end if;
 if jsonb_typeof(c)is distinct from 'object'or jsonb_typeof(raw)is distinct from 'object'
  or jsonb_typeof(p->'normalized')is distinct from 'object'or jsonb_typeof(p#>'{normalized,contacts}')is distinct from 'object'
  or c->>'contact_kind'is distinct from 'phone'or c->>'human_reviewed'is distinct from 'false'
  or c->>'release'is distinct from '2026-10-21.0'or c->>'window_complete'is distinct from 'true'
  or s.source_url is distinct from 'https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json'
  or c->>'source_url'is distinct from s.source_url or c->>'venue_id'is distinct from s.venue_id::text
  or coalesce(s.source_entity_id,'')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or nullif(btrim(p#>>'{normalized,name}'),'')is null
  or raw->>'id'is distinct from s.source_entity_id
  or raw#>>'{names,primary}'is distinct from p#>>'{normalized,name}'
  or raw->>'operating_status'is distinct from 'open'
  or not coalesce(pg_input_is_valid(c->>'payload_text','jsonb'),false)
  or c->>'payload_sha256'is distinct from encode(extensions.digest(c->>'payload_text','sha256'),'hex')
  or not coalesce(pg_input_is_valid(c->>'observed_at','timestamp with time zone'),false)
  or exists(select 1 from jsonb_object_keys(c)k where k not in('id','name','latitude','longitude','address','country_id','city_id','organization_id','updated_at','country_code','city_name','venue_id','expected_updated_at','human_reviewed','website','phone','contact_kind','observed_at','release','source_url','assets','window_complete','window_bounds','window_rows','payload_text','payload_sha256','website_probe'))
  or exists(select 1 from jsonb_object_keys(raw)k where k not in('id','version','names','confidence','websites','phones','emails','socials','addresses','sources','operating_status','longitude','latitude'))
  or exists(select 1 from jsonb_object_keys(p->'normalized')k where k not in('name','contacts'))
  or exists(select 1 from jsonb_object_keys(p#>'{normalized,contacts}')k where k<>'phone')then return false;end if;
 decoded:=(c->>'payload_text')::jsonb;
 if jsonb_typeof(decoded)is distinct from 'array'or jsonb_typeof(raw->'phones')is distinct from 'array'or jsonb_typeof(raw->'sources')is distinct from 'array'then return false;end if;
 if jsonb_typeof(decoded)is distinct from 'array'or not(decoded@>jsonb_build_array(raw))
  or jsonb_typeof(raw->'phones')is distinct from 'array'or jsonb_array_length(raw->'phones')not between 1 and 10
  or jsonb_typeof(raw->'sources')is distinct from 'array'or jsonb_array_length(raw->'sources')=0
  or not coalesce(pg_input_is_valid(raw->>'confidence','numeric'),false)then return false;end if;
 if(raw->>'confidence')::numeric<.9
  or exists(select 1 from jsonb_array_elements(raw->'sources')x where coalesce(x->>'license','')not in('CDLA-Permissive-2.0','Apache-2.0','CC0-1.0'))
  or exists(select 1 from jsonb_array_elements(raw->'phones')x where jsonb_typeof(x)<>'string'
   or regexp_replace(x#>>'{}','[^+0-9]','','g')is distinct from regexp_replace(c->>'phone','[^+0-9]','','g'))then return false;end if;
 phone:=public.canonicalize_phone(c->>'phone',c->>'country_code');
 return coalesce(phone->>'verdict'='ok'and phone->>'e164'~'^\+[1-9][0-9]{6,14}$'
  and phone->>'e164'=p#>>'{normalized,contacts,phone}',false);
end $fn$;
revoke all on function api_private.overture_phone_source_is_contact_only(public.venue_sources)from public,anon,authenticated;
grant execute on function api_private.overture_phone_source_is_contact_only(public.venue_sources)to service_role;

do $patch$
declare target regprocedure:='public.organization_facts_only_source(uuid)'::regprocedure;src text;
 count_anchor text:='from public.venue_sources where venue_id=v.id) sl';
 guard_anchor text:='where s.venue_id=v.id and (';
 identity_anchor text:='and sl.source_count=1 and sl.source_slug in';
begin
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,count_anchor,'')))/length(count_anchor)<>1
  or(length(src)-length(replace(src,guard_anchor,'')))/length(guard_anchor)<>3
  or(length(src)-length(replace(src,identity_anchor,'')))/length(identity_anchor)<>1 then raise exception 'Facts-only source contract changed';end if;
 src:=replace(src,count_anchor,'from public.venue_sources where venue_id=v.id and source_slug<>''overture'') sl');
 src:=replace(src,guard_anchor,'where s.venue_id=v.id and s.source_slug<>''overture'' and (');
 src:=replace(src,identity_anchor,'and not exists(select 1 from public.venue_sources supplement where supplement.venue_id=v.id and supplement.source_slug=''overture'' and not api_private.overture_phone_source_is_contact_only(supplement)) '||identity_anchor);
 execute src;
end $patch$;
