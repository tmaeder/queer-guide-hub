-- Checkpoint-only normalization: these facts were already present in original raw CSV rows.
update public.outxout_sync_entities e set normalized=jsonb_set(e.normalized,'{metadata,sports_details}',jsonb_build_object('sports',s.raw_data->'sports','seasons',s.raw_data->'seasons','fee',s.raw_data->'fee','who_can_play',s.raw_data->'who_can_play','skill_levels',s.raw_data->'skill_levels')) from public.ingestion_staging s where s.id=e.staging_id and e.normalized->'metadata'->>'source_kind'='sports_league' and e.normalized->'metadata'->'sports_details' is null;

alter table public.outxout_sync_changes add column if not exists reconciliation jsonb;
with verified as materialized(
 select c.id,c.run_id,c.staging_id from public.outxout_sync_changes c join public.ingestion_staging s on s.id=c.staging_id
 where c.outcome='held' and c.conflicts='[{"field":"__sports_details","reason":"changed_media_tags_or_service_scope_requires_review"}]'::jsonb
 and c.proposed_data->'metadata'->'sports_details'=jsonb_build_object('sports',s.raw_data->'sports','seasons',s.raw_data->'seasons','fee',s.raw_data->'fee','who_can_play',s.raw_data->'who_can_play','skill_levels',s.raw_data->'skill_levels')
), corrected as(
 update public.outxout_sync_changes c set outcome='unchanged',reconciliation=jsonb_build_object('reason','adapter_baseline_representation_changed_but_published_raw_facts_identical','at',now()) from verified v where c.id=v.id returning c.run_id,c.staging_id
), resolved as(
 update public.review_queue q set status='resolved',resolved_at=now(),details=q.details||jsonb_build_object('resolution','raw_source_facts_verified_identical_baseline_only') from corrected c where q.entity_type='ingestion_staging' and q.entity_id=c.staging_id and q.status='pending' and q.details->>'reason'='outxout_source_change' and q.details->>'run_id'=c.run_id::text returning q.id
), counts as(select run_id,count(*) n from corrected group by run_id), adjusted as(
 update public.outxout_sync_runs r set held=r.held-c.n,unchanged=r.unchanged+c.n from counts c where r.id=c.run_id returning r.id,r.held,r.unchanged
)
update public.pipeline_runs p set context=p.context||jsonb_build_object('held',a.held,'unchanged',a.unchanged) from adjusted a where p.id=a.id;

alter table public.outxout_sync_runs add column if not exists consecutive_errors integer not null default 0;
create or replace function public.outxout_retry_run(p_run uuid,p_token uuid,p_error text) returns void language plpgsql set search_path=public as $$
declare failures integer;
begin
 update outxout_sync_runs set consecutive_errors=consecutive_errors+1,error=p_error,lease_until=now()+interval '1 minute',heartbeat_at=now() where id=p_run and lease_token=p_token and phase in('collect','process') returning consecutive_errors into failures;
 if not found then return;end if;
 update pipeline_runs set error_message=p_error,updated_at=now() where id=p_run;
 if failures>=3 then
  update outxout_sync_runs set phase='failed',lease_until=null where id=p_run;
  update pipeline_runs set status='failed',completed_at=now() where id=p_run;
 end if;
end $$;
revoke all on function public.outxout_retry_run(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.outxout_retry_run(uuid,uuid,text) to service_role;

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
   if (patch ? 'title' or patch ? 'start_date' or patch ? 'name') and n->>'description' is not null
      and (cur->'description'=known.normalized->'description' or cur->'description'=(select normalized_data->'description' from ingestion_staging where id=stage_id))
      and cur->'field_provenance'->'description'->>'source' is null then
    patch:=patch||jsonb_build_object('description',n->'description');
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
   if found then
    stage_id:=stage.id;target:=stage.target_record_id;
    if stage.review_status='auto' and to_jsonb(stage)->>'reviewed_by' is null and to_jsonb(stage)->>'reviewed_at' is null then
     update ingestion_staging set normalized_data=jsonb_set(n,'{sourceId}',to_jsonb(stage.source_entity_id)),raw_data=raw,pipeline_run_id=p_run,job_id=p_run,disposition='pending',processed_at=null,error_message=null,ai_validation_status='pending',dedup_status='pending',dedup_match_id=null,dedup_details=null,updated_at=now() where id=stage.id;
    end if;
   else
    insert into ingestion_staging(source_type,source_name,source_entity_id,entity_type,target_table,raw_data,normalized_data,pipeline_run_id,job_id,node_id,ai_validation_status,dedup_status,review_status)
    values('outxout','outxout',sid,case tab when 'events' then 'event' when 'venues' then 'venue' else 'organization' end,tab,raw,n,p_run,p_run,'outxout',case when n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true' then 'needs_review' else 'pending' end,'pending',case when n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true' then 'pending_review' else 'auto' end) returning id into stage_id;
   end if;
   why:='staged';
   if (n->'metadata'->>'date_status'='unconfirmed' or coalesce(n->'metadata'->>'identity_review_required','false')='true') and not exists(select 1 from review_queue where entity_type='ingestion_staging' and entity_id=stage_id and status='pending') then
    insert into review_queue(entity_type,entity_id,review_type,status,details) values('ingestion_staging',stage_id,'validate_flag','pending',jsonb_build_object('source','outxout','reason',case when n->'metadata'->>'date_status'='unconfirmed' then 'date_unconfirmed' else 'published_employer_unverified' end,'source_url',n->'metadata'->>'url'));
   end if;
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
