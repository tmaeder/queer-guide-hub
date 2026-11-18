create index if not exists outxout_seen_source_url on public.outxout_sync_entities(last_seen_run,('https://outxout.com/'||source_entity_id));
create or replace function public.outxout_release(p_run uuid,p_token uuid) returns void language plpgsql set search_path=public as $$
begin
 update outxout_sync_runs set lease_until=null,heartbeat_at=now() where id=p_run and lease_token=p_token;
 if found and exists(select 1 from outxout_sync_runs r where r.id=p_run and r.phase in('collect','process'))
 and (exists(select 1 from outxout_sync_work where run_id=p_run and status='pending' and retry_at<=now())
      or not exists(select 1 from outxout_sync_work where run_id=p_run and status='pending')) then
  perform outxout_tick(false);
 end if;
end;
$$;

create or replace function public.outxout_ingest(p_run uuid,p_items jsonb) returns void language plpgsql set search_path=public,extensions as $$
declare item jsonb;n jsonb;raw jsonb;sid text;tab text;native text;known outxout_sync_entities%rowtype;stage ingestion_staging%rowtype;
 oldfields jsonb;fields jsonb;cur jsonb;patch jsonb;conflicts jsonb;k text;v jsonb;owned boolean;target uuid;stage_id uuid;why text;count_targets integer;
begin
 for item in select value from jsonb_array_elements(p_items) loop
  sid:=item->>'source_entity_id';tab:=item->>'target_table';n:=item->'normalized';raw:=item->'raw';native:=nullif(n->'metadata'->>'source_native_id','');
  if tab not in('events','venues','organizations') or sid is null then raise exception 'invalid_source_entity';end if;
  perform pg_advisory_xact_lock(hashtextextended('outxout:'||tab||':'||coalesce(native,sid),0));
  select * into known from outxout_sync_entities where source_entity_id=sid for update;
  if not found and native is not null then
   select count(distinct target_id) into count_targets from outxout_sync_entities where target_table=tab and native_id=native;
   if count_targets>1 then raise exception 'ambiguous_native_identity: %',native;end if;
   select * into known from outxout_sync_entities where target_table=tab and native_id=native order by target_id nulls last limit 1;
  end if;
  if known.last_seen_run=p_run and known.source_entity_id=sid then continue;end if;
  target:=known.target_id;stage_id:=known.staging_id;
  fields:=outxout_source_fields(n,tab);oldfields:=outxout_source_fields(known.normalized,tab);patch:='{}';conflicts:='[]';cur:=null;why:=null;
  if target is not null then
   execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into cur using target;
   if cur is null or cur->>'duplicate_of_id' is not null then why:='canonical_missing_or_redirected';end if;
  end if;
  if (known.staging_id is not null and fields=oldfields and coalesce(n->'metadata'->>'identity_review_required','false')='false') then why:='unchanged';
  elsif target is not null and cur is not null then
   owned:=cur->>'data_source'='outxout';
   for k,v in select key,value from jsonb_each(fields) loop
    if v is not distinct from oldfields->k then continue;end if;
    if k like '\_\_%' escape '\' then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',k,'reason','changed_media_tags_or_service_scope_requires_review'));continue;
    end if;
    if (tab='events' and k in('title','start_date','end_date') and (cur->'enrichment_status'->'date_confirmation'->>'state' in('confirmed','needs_review') or n->'metadata'->>'date_status'='unconfirmed'))
       or (k='address' and cur->'enrichment_status'?'current_location_verified')
       or (cur->'field_provenance'->k->>'source' is not null and cur->'field_provenance'->k->>'source' not like 'outxout%') then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',k,'reason','protected_verified_or_reviewed_field'));continue;
    end if;
    if (cur->k is null or cur->k='null' or cur->k='""' or cur->k='{}') or (owned and cur->k is not distinct from oldfields->k) then patch:=patch||jsonb_build_object(k,v);
    elsif v is distinct from cur->k then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',k,'reason','existing_value_not_owned_by_source'));end if;
   end loop;
   if jsonb_array_length(coalesce(item->'validation_errors','[]'))>0 or coalesce(n->'metadata'->>'identity_review_required','false')='true' then patch:='{}';conflicts:=conflicts||'[{"reason":"new_source_facts_require_validation"}]';end if;
   -- Missing/moved source geography is held, never used to move a current or historical record.
   if n->'location'->>'country' is distinct from known.normalized->'location'->>'country' or n->'location'->>'city' is distinct from known.normalized->'location'->>'city' then
    patch:=patch-'address';conflicts:=conflicts||'[{"reason":"source_geography_changed_or_incomplete"}]';
   end if;
   if patch<>'{}' then
    execute format('update public.%1$I t set %2$s,updated_at=now() from jsonb_populate_record(null::public.%1$I,$1) d where t.id=$2',tab,(select string_agg(format('%1$I=d.%1$I',key),',') from jsonb_each(patch))) using patch,target;
   end if;
   why:=case when conflicts<>'[]' then 'held' when patch<>'{}' then 'updated' else 'unchanged' end;
   if known.source_entity_id is distinct from sid and native is not null then
    if tab='events' then
     insert into event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at)
      values(target,'outxout',sid,n->'metadata'->>'url',n,encode(extensions.digest(n::text,'sha256'),'hex'),.99,false,now(),now()) on conflict(source_slug,source_entity_id) do nothing;
    elsif tab='venues' then
     insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at)
      values(target,'outxout',sid,n->'metadata'->>'url',n,encode(extensions.digest(n::text,'sha256'),'hex'),.99,false,now(),now()) on conflict(source_slug,source_entity_id) do nothing;
    end if;
   end if;
  else
   select * into stage from ingestion_staging where source_name='outxout' and (id=known.staging_id or source_entity_id=sid) order by created_at desc limit 1 for update;
   if found then stage_id:=stage.id;target:=stage.target_record_id;
   else
    insert into ingestion_staging(source_type,source_name,source_entity_id,entity_type,target_table,raw_data,normalized_data,pipeline_run_id,job_id,node_id,ai_validation_status,dedup_status,review_status)
    values('outxout','outxout',sid,case tab when 'events' then 'event' when 'venues' then 'venue' else 'organization' end,tab,raw,n,p_run,p_run,'outxout','pending','pending',case when n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true' then 'pending_review' else 'auto' end) returning id into stage_id;
   end if;
   why:='staged';
  end if;
  if conflicts<>'[]' and stage_id is not null and not exists(select 1 from review_queue where entity_type='ingestion_staging' and entity_id=stage_id and status='pending' and details->>'reason'='outxout_source_change') then
   insert into review_queue(entity_type,entity_id,review_type,status,details) values('ingestion_staging',stage_id,'validate_flag','pending',jsonb_build_object('reason','outxout_source_change','source','outxout','run_id',p_run,'conflicts',conflicts,'source_url',n->'metadata'->>'url','proposed_normalized_data',n));
  end if;
  insert into outxout_sync_changes(run_id,source_entity_id,staging_id,target_id,outcome,previous_data,proposed_data,applied_patch,conflicts)
   values(p_run,sid,stage_id,target,why,known.normalized,n,patch,conflicts)
   on conflict(run_id,source_entity_id) do nothing;
  insert into outxout_sync_entities(source_entity_id,target_table,native_id,staging_id,target_id,normalized,last_seen_run)
   values(sid,tab,native,stage_id,target,n,p_run)
   on conflict(source_entity_id) do update set native_id=coalesce(excluded.native_id,outxout_sync_entities.native_id),normalized=excluded.normalized,staging_id=excluded.staging_id,target_id=excluded.target_id,last_seen_run=p_run,last_seen_at=now();
  update outxout_sync_runs set observed=observed+1,changed=changed+(why in('updated','staged'))::int,unchanged=unchanged+(why='unchanged')::int,held=held+(why='held')::int where id=p_run;
 end loop;
end $$;

create or replace function public.outxout_commit_batch(p_run uuid,p_limit integer default 20) returns jsonb language plpgsql set search_path=public,extensions as $$
declare s ingestion_staging%rowtype;n jsonb;co uuid;ci uuid;oid uuid;matches uuid[];res record;ct integer:=0;held integer:=0;sl text;
begin
 for s in select * from ingestion_staging where source_name='outxout' and pipeline_run_id=p_run and disposition='pending' and ai_validation_status='approved' and dedup_status in('unique','duplicate') and review_status in('auto','approved') order by case target_table when 'venues' then 0 when 'organizations' then 1 else 2 end,created_at limit least(p_limit,50) for update skip locked loop
  begin
   n:=s.normalized_data;
   if n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true' then
    update ingestion_staging set review_status='pending_review',ai_validation_status='needs_review',error_message='outxout_requires_official_verification' where id=s.id;held:=held+1;continue;
   end if;
   if s.target_table='events' then
    -- Identity links from this publisher are stronger than coincident name/geography.
    select target_id into oid from outxout_sync_entities where source_entity_id='venue/'||(n->'metadata'->>'source_venue_slug') and target_table='venues';
    if oid is not null then
     update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{venue_id}',to_jsonb(oid::text)) where id=s.id;
    end if;
    perform * from commit_event_staging_item(s.id,'outxout-backend-sync');
   elsif s.target_table='venues' then perform * from commit_venue_staging_item(s.id,'outxout-backend-sync');
   else
    co:=null;ci:=null;oid:=null;
    select id into co from countries where code=n->'location'->>'country' and duplicate_of_id is null limit 1;
    if co is null then raise exception 'organization_country_unverified';end if;
    ci:=city_pick_in_country(co,n->'location'->>'city',n->'location'->>'state',false);
    if ci is null then raise exception 'organization_city_unverified';end if;
    perform pg_advisory_xact_lock(hashtextextended('outxout-org:'||normalize_name(n->>'name')||ci::text,0));
    select array_agg(id) into matches from organizations where duplicate_of_id is null and normalize_name(name)=normalize_name(n->>'name') and city_id=ci and country_id=co;
    if cardinality(matches)>1 then raise exception 'ambiguous_organization_identity';end if;
    if s.dedup_status='duplicate' and (cardinality(matches) is distinct from 1 or matches[1] is distinct from s.dedup_match_id) then raise exception 'organization_match_not_exact';end if;
    if cardinality(matches)=1 then oid:=matches[1];
    else
     sl:=trim(both '-' from regexp_replace(lower(n->>'name'),'[^a-z0-9]+','-','g'))||'-outxout-'||substr(md5(s.source_entity_id),1,8);
     insert into organizations(name,slug,description,roles,website,email,phone,address,state,city_id,country_id,status,field_provenance)
      values(n->>'name',sl,n->>'description',array['community'],n->'contacts'->>'website',n->'contacts'->>'email',n->'contacts'->>'phone',n->'location'->>'address',n->'location'->>'state',ci,co,'draft',jsonb_build_object('outxout',jsonb_build_object(s.source_entity_id,jsonb_build_object('source_url',n->'metadata'->>'url','at',now())))) returning id into oid;
    end if;
    update ingestion_staging set target_record_id=oid,disposition=case when cardinality(matches)=1 then 'updated' else 'inserted' end,processed_at=now() where id=s.id;
   end if;
   select target_record_id into oid from ingestion_staging where id=s.id;
   update outxout_sync_entities set target_id=oid where staging_id=s.id;
   if s.target_table='events' then
    insert into event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at)
    select oid,'outxout',e.source_entity_id,e.normalized->'metadata'->>'url',e.normalized,encode(extensions.digest(e.normalized::text,'sha256'),'hex'),.99,false,now(),now() from outxout_sync_entities e where e.staging_id=s.id and e.target_table='events' on conflict(source_slug,source_entity_id) do nothing;
   elsif s.target_table='venues' then
    insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at)
    select oid,'outxout',e.source_entity_id,e.normalized->'metadata'->>'url',e.normalized,encode(extensions.digest(e.normalized::text,'sha256'),'hex'),.99,false,now(),now() from outxout_sync_entities e where e.staging_id=s.id and e.target_table='venues' on conflict(source_slug,source_entity_id) do nothing;
   end if;
   update outxout_sync_changes set target_id=oid,outcome='committed' where run_id=p_run and staging_id=s.id;
   ct:=ct+1;
  exception when others then
   update ingestion_staging set review_status='pending_review',error_message='outxout_backend_commit: '||sqlerrm where id=s.id;
   insert into review_queue(entity_type,entity_id,review_type,status,details) values('ingestion_staging',s.id,'validate_flag','pending',jsonb_build_object('source','outxout','reason','outxout_commit_requires_review','error',sqlerrm));held:=held+1;
  end;
 end loop;
 return jsonb_build_object('committed',ct,'held',held);
end $$;