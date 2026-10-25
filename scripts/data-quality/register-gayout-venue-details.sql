-- Positive facts from the exact registered publisher listing. Default dry run.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
set local app.actor='system:gayout-registered-venue-details:v1';
do $repair$
#variable_conflict use_column
declare p jsonb;j jsonb;r record;capture jsonb;phone_result jsonb;phone_value text;description_value text;
 new_payload jsonb;after_venue jsonb;after_org jsonb;provenance jsonb;changed integer:=0;phones integer:=0;descriptions integer:=0;protected integer:=0;
 dry_run boolean:=coalesce(nullif(current_setting('matching.gayout_details_dry_run',true),''),'true')::boolean;
 inputs jsonb:=coalesce(nullif(current_setting('matching.gayout_details_proofs',true),''),'[]')::jsonb;
begin
 perform public.assert_admin_or_internal();if auth.uid()is not null then raise exception 'Internal source facts only';end if;
 if jsonb_typeof(inputs)<>'array'or jsonb_array_length(inputs)>50 then raise exception 'At most fifty registered source proofs';end if;
 if not pg_try_advisory_xact_lock(hashtext('business_quality_lifecycle'))then
  perform set_config('matching.gayout_details_result',jsonb_build_object('dry_run',dry_run,'skipped',true,'reason','native_business_producer_busy')::text,true);return;
 end if;
 for p in select value from jsonb_array_elements(inputs)loop
  if p->>'contract'is distinct from 'gayout_registered_venue_details:v1'or p->>'human_reviewed'is distinct from 'false'
   or p->>'http_status'is distinct from '200'or coalesce(p->>'source_url','')!~'^https://www[.]gayout[.]com/[A-Za-z0-9/%_.-]+$'
   or not coalesce(pg_input_is_valid(p->>'source_json_text','jsonb'),false)
   or encode(extensions.digest(p->>'source_json_text','sha256'),'hex')is distinct from p->>'source_json_sha256'
   or not coalesce(pg_input_is_valid(p->>'observed_at','timestamp with time zone'),false)
   or not coalesce(pg_input_is_valid(p->>'expected_updated_at','timestamp with time zone'),false)
   then protected:=protected+1;continue;end if;
  if(p->>'observed_at')::timestamptz not between now()-interval '1 hour'and now()+interval '5 minutes'then protected:=protected+1;continue;end if;
  j:=(p->>'source_json_text')::jsonb;
  if jsonb_typeof(j)is distinct from 'object'or j->>'url'is distinct from p->>'source_url'
   or not coalesce(pg_input_is_valid(j#>>'{geo,latitude}','numeric'),false)
   or not coalesce(pg_input_is_valid(j#>>'{geo,longitude}','numeric'),false)
   then protected:=protected+1;continue;end if;
  select v.id,v.organization_id,c.code country_code,to_jsonb(v)old_venue,to_jsonb(o)old_org,to_jsonb(s)old_source into r
  from public.venues v join public.organizations o on o.id=v.organization_id and o.primary_venue_id=v.id
   join public.countries c on c.id=v.country_id join public.venue_sources s on s.venue_id=v.id and s.id=(p->>'source_id')::uuid
  where v.id=(p->>'id')::uuid and v.updated_at=(p->>'expected_updated_at')::timestamptz
   and v.name=p->>'name'and lower(btrim(o.name))=lower(btrim(v.name))
   and o.id=(p->>'organization_id')::uuid and o.country_id=v.country_id and o.city_id is not distinct from v.city_id
   and v.duplicate_of_id is null and v.closed_at is null and o.duplicate_of_id is null and o.status='active'
   and o.claim_status='unclaimed'and o.last_verified_at is null and o.roles=array['venue']::text[]
   and o.field_provenance#>>'{identity,source}'='unified_location'
   and v.category not in('cruising','toilet','other')
   and c.code=p->>'country_code'and j#>>'{address,addressCountry}'=c.code
   and s.source_slug='gayout'and s.source_url=p->>'source_url'and s.payload_hash=p->>'payload_hash'
   and s.payload#>>'{normalized,metadata,gayout_numeric_id}'=p->>'publisher_venue_id'
   and btrim(regexp_replace(lower(extensions.unaccent(v.name)),'[^[:alnum:]]+',' ','g'))
    =btrim(regexp_replace(lower(extensions.unaccent(j->>'name')),'[^[:alnum:]]+',' ','g'))
   and(j#>>'{geo,latitude}')::numeric between -90 and 90 and(j#>>'{geo,longitude}')::numeric between -180 and 180
   and not((j#>>'{geo,latitude}')::numeric=0 and(j#>>'{geo,longitude}')::numeric=0)
   and public.haversine_m(v.latitude,v.longitude,(j#>>'{geo,latitude}')::numeric,(j#>>'{geo,longitude}')::numeric)<=60
   and coalesce(jsonb_typeof(o.field_provenance),'object')='object'
   and not exists(select 1 from public.content_revisions revision where revision.source_table in('venues','organizations')
    and revision.source_id in(v.id,o.id)and revision.actor_kind='human'and revision.changed_fields&&array['phone','phone_e164','description'])
   and not exists(select 1 from public.entity_quality_findings finding where finding.entity_type='organization'and finding.entity_id=o.id
    and finding.dimension in('contact','editorial')and(finding.waived_by is not null or finding.waived_at is not null))
   and not exists(select 1 from public.venue_review_queue review where review.venue_id=v.id and review.field in('phone','description')and review.status in('open','rejected'))
   and not exists(select 1 from public.venue_field_provenance field where field.venue_id=v.id and field.field='phone'and field.is_winning)
   and not exists(select 1 from jsonb_array_elements(jsonb_build_array(o.field_provenance->'phone',o.field_provenance->'description')) item where item not in('null'::jsonb,'{}'::jsonb)
    and(jsonb_typeof(item)<>'object'or item->>'human_reviewed'='true'or item->>'actor_kind'='human'
     or item->>'source'in('human','manual','user_submission','admin_upload')))
  for update of v,o,s skip locked;
  if not found then protected:=protected+1;continue;end if;
  phone_value:=null;description_value:=null;
  if nullif(btrim(r.old_venue->>'phone'),'')is null and nullif(btrim(r.old_venue->>'phone_e164'),'')is null
   and nullif(btrim(r.old_org->>'phone'),'')is null and p->>'phone_raw'is not null and j->>'telephone'=p->>'phone_raw'then
   phone_result:=public.canonicalize_phone(p->>'phone_raw',r.country_code);
   if phone_result->>'verdict'='ok'and phone_result->>'e164'~'^\+[1-9][0-9]{6,14}$'then phone_value:=phone_result->>'e164';end if;
  end if;
  if nullif(btrim(r.old_org->>'description'),'')is null and p->>'description'is not null
   and p->>'description'=btrim(regexp_replace(j->>'description','[[:space:]]+',' ','g'))
   and length(p->>'description')between 80 and 500
   and cardinality(regexp_split_to_array(p->>'description','[[:space:]]+'))between 10 and 25
   and p->>'description'!~*'(<|>|lorem ipsum|cookie policy|privacy policy|all rights reserved|click here)'
   then description_value:=p->>'description';end if;
  if phone_value is null and description_value is null then protected:=protected+1;continue;end if;
  if dry_run then changed:=changed+1;phones:=phones+case when phone_value is not null then 1 else 0 end;
   descriptions:=descriptions+case when description_value is not null then 1 else 0 end;continue;end if;
  provenance:=jsonb_build_object('source','gayout_registered_details','source_url',p->>'source_url','source_id',p->>'source_id',
   'observed_at',p->>'observed_at','source_json_sha256',p->>'source_json_sha256','human_reviewed',false);
  if phone_value is not null then
   update public.venues set phone=phone_value,phone_e164=phone_value,updated_at=now()where id=r.id;
   insert into public.venue_field_provenance(venue_id,field,source,value,confidence,is_winning,observed_at)
    values(r.id,'phone','gayout_registered_details',to_jsonb(phone_value),.85,true,(p->>'observed_at')::timestamptz);
  end if;
  update public.organizations set phone=coalesce(phone_value,phone),description=coalesce(description_value,description),
   field_provenance=coalesce(field_provenance,'{}'::jsonb)||case when phone_value is not null then jsonb_build_object('phone',provenance)else '{}'::jsonb end
    ||case when description_value is not null then jsonb_build_object('description',provenance)else '{}'::jsonb end,
   quality_checked_at=null,updated_at=now()where id=r.organization_id;
  capture:=p||jsonb_build_object('phone_e164',phone_value,'description_applied',description_value,'capture_kind','selected_business_jsonld_fields');
  new_payload:=(r.old_source->'payload')||jsonb_build_object('detail_enrichment',capture);
  update public.venue_sources set payload=new_payload,payload_hash=encode(extensions.digest(new_payload::text,'sha256'),'hex'),
   last_seen_at=(p->>'observed_at')::timestamptz where id=(p->>'source_id')::uuid;
  select to_jsonb(v)into after_venue from public.venues v where id=r.id;
  select to_jsonb(o)into after_org from public.organizations o where id=r.organization_id;
  if after_venue-array['phone','phone_e164','updated_at']is distinct from r.old_venue-array['phone','phone_e164','updated_at']
   or after_org-array['phone','description','field_provenance','quality_checked_at','updated_at']is distinct from r.old_org-array['phone','description','field_provenance','quality_checked_at','updated_at']
   or(after_org->'field_provenance')-array['phone','description']is distinct from(r.old_org->'field_provenance')-array['phone','description']
   then raise exception 'Unrelated canonical fields changed during source enrichment';end if;
  if(new_payload-'detail_enrichment')is distinct from((r.old_source->'payload')-'detail_enrichment')then raise exception 'Original capture changed';end if;
  changed:=changed+1;phones:=phones+case when phone_value is not null then 1 else 0 end;descriptions:=descriptions+case when description_value is not null then 1 else 0 end;
 end loop;
 perform set_config('matching.gayout_details_result',jsonb_build_object('dry_run',dry_run,'changed',changed,
  'phones',phones,'descriptions',descriptions,'protected_or_changed',protected)::text,true);
end $repair$;
select current_setting('matching.gayout_details_result')::jsonb result;
commit;
