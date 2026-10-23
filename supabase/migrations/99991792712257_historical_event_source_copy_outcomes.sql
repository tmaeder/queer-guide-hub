-- Accept only complete, corroborated historical source copy. Preserve every
-- content value, score and original detector evidence; this is an explicit
-- source limitation outcome, not a fabricated repair or human verification.
create function public.reconcile_historical_event_brevity(p_batch integer default 500,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare dry_run boolean:=p_dry_run is distinct from false;batch_size integer:=greatest(0,least(coalesce(p_batch,500),1000));r record;n integer:=0;ids uuid[]:='{}';note text;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('historical_event_source_brevity')) then
  return jsonb_build_object('skipped',true,'reason','already_running');
 end if;
 if auth.uid() is not null then raise exception 'Automatic source outcomes require an internal actor'; end if;
 for r in
  select i.id,i.event_id,i.evidence_hash,e.external_id,e.title,e.description,e.start_date,e.end_date,
   s.id source_id,s.source_url,s.payload_hash,s.last_seen_at,s.payload#>>'{raw,updatedOn}' source_updated_at
  from public.event_quality_issues i join public.events e on e.id=i.event_id
  join public.event_sources s on s.event_id=e.id and s.source_slug='agendaq'
  where i.status='open' and i.issue_code='DESCRIPTION_THIN' and i.severity='medium'
   and i.dimension='completeness' and i.detector='event-quality-scan'
   and i.reviewed_by is null and ((i.reviewed_at is null and i.resolution is null)
    or i.resolution like 'auto-source-brevity:invalidated:v1 %')
   and e.duplicate_of_id is null and coalesce(e.status,'active') not in('cancelled','archived','rejected')
   and coalesce(e.end_date,e.start_date)<now()-interval '30 days'
   and length(btrim(e.description)) between 20 and 79 and e.description!~'[<>]'
   and i.evidence->>'length'=length(btrim(e.description))::text
   and public.dedup_despace(e.description)<>public.dedup_despace(e.title)
   and e.description!~'(…|\.{3})[[:space:]]*$'
   and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(s.payload->'raw')='object' then s.payload->'raw' else '{}' end) k where k not in(
    'name','slug','start','end','dates','updatedOn','data','description','descShort','tags','taxons','locations','assets','businesses','people','price','parent','super','children'))
   and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(s.payload#>'{raw,data}')='object' then s.payload#>'{raw,data}' else '{}' end) k where k not in('url','payment','socials','currency','mandatorydrink'))
   and e.description!~*'(accept cookies|cookie policy|sign in to read|subscribe to continue|all rights reserved|privacy policy|en savoir plus|voir plus|read more|coming soon)'
   and s.source_url='https://www.agendaq.fr/fr/agenda/'||s.source_entity_id
   and s.source_entity_id=e.external_id and s.source_entity_id=s.payload#>>'{raw,slug}'
   and e.title=s.payload#>>'{raw,name}' and s.payload_hash~'^[a-f0-9]{64}$'
   and not exists(select 1 from public.event_sources copy_source
    cross join lateral(values(copy_source.payload#>>'{normalized,description}'),(copy_source.payload#>>'{enriched,description}'),
     (copy_source.payload#>>'{raw,jsonLd,description}'),(copy_source.payload#>>'{raw,data,desc}'),(copy_source.payload#>>'{raw,data,description}')) copy(value)
    where copy_source.event_id=e.id and nullif(btrim(copy.value),'') is not null
     and btrim(copy.value) is distinct from nullif(btrim(e.description),''))
   and not exists(select 1 from public.event_sources dup where dup.event_id=e.id and dup.source_slug='agendaq' and dup.id<s.id)
   and e.start_date=case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamp with time zone')
    then (s.payload#>>'{raw,start}')::timestamptz end
   and (s.payload#>>'{raw,end}' is null or pg_input_is_valid(s.payload#>>'{raw,end}','timestamp with time zone'))
   and e.end_date is not distinct from case when pg_input_is_valid(s.payload#>>'{raw,end}','timestamp with time zone')
    then (s.payload#>>'{raw,end}')::timestamptz end
   and ((btrim(s.payload#>>'{raw,descShort}')=btrim(e.description)
     and (nullif(btrim(s.payload#>>'{raw,description}'),'') is null or btrim(s.payload#>>'{raw,description}')=btrim(e.description)))
    or (btrim(s.payload#>>'{raw,description}')=btrim(e.description)
     and (nullif(btrim(s.payload#>>'{raw,descShort}'),'') is null or btrim(s.payload#>>'{raw,descShort}')=btrim(e.description))))
   and not exists(select 1 from public.event_sources other where other.event_id=e.id and other.id<>s.id and (
    (nullif(btrim(other.payload#>>'{raw,description}'),'') is not null and btrim(other.payload#>>'{raw,description}')<>btrim(e.description))
    or (nullif(btrim(other.payload#>>'{raw,descShort}'),'') is not null and btrim(other.payload#>>'{raw,descShort}')<>btrim(e.description))))
  order by i.detected_at,i.id limit batch_size
  for update of i,e skip locked for share of s skip locked
 loop
  n:=n+1;ids:=array_append(ids,r.id);
  note:='auto-source-brevity:v1 '||jsonb_build_object(
   'reason','The event already contains the entire supplied plain-text description; accepted historical source brevity without inventing prose.',
   'source_id',r.source_id,'source_url',r.source_url,'payload_hash',r.payload_hash,
   'source_last_seen_at',r.last_seen_at,'source_updated_at',r.source_updated_at,
   'complete_source_copy',r.description,'description_md5',md5(r.description),
   'event_external_id',r.external_id,'start_date',r.start_date,'end_date',r.end_date,
   'finding_evidence_hash',r.evidence_hash,'automated',true,'human_reviewed',false)::text;
  if not dry_run then perform public.decide_event_quality_issue(r.id,'accepted',note); end if;
 end loop;
 return jsonb_build_object('dry_run',dry_run,'candidates',n,
  'accepted',case when dry_run then 0 else n end,'issue_ids',to_jsonb(ids));

end $fn$;
revoke all on function public.reconcile_historical_event_brevity(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_historical_event_brevity(integer,boolean) to service_role;

-- Full captured AgendaQ calendar schema, exact identity/dates, empty source
-- narrative and no alternate provider copy. Unknown schema remains pending.
create function public.reconcile_historical_event_copy_absence(p_batch integer default 500,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare dry_run boolean:=p_dry_run is distinct from false;batch_size integer:=greatest(0,least(coalesce(p_batch,500),1000));r record;n integer:=0;ids uuid[]:='{}';note text;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('historical_event_copy_absence')) then
  return jsonb_build_object('skipped',true,'reason','already_running');
 end if;
 if auth.uid() is not null then raise exception 'Automatic source outcomes require an internal actor'; end if;
 for r in
  select i.id,i.event_id,i.evidence_hash,e.external_id,e.title,e.description,e.start_date,e.end_date,
   s.id source_id,s.source_url,s.payload_hash,s.last_seen_at,s.payload#>>'{raw,updatedOn}' source_updated_at
  from public.event_quality_issues i join public.events e on e.id=i.event_id
  join public.event_sources s on s.event_id=e.id and s.source_slug='agendaq'
  where i.status='open' and i.issue_code='DESCRIPTION_MISSING' and i.severity='high'
   and i.dimension='completeness' and i.detector='event-quality-scan'
   and i.reviewed_by is null and ((i.reviewed_at is null and i.resolution is null)
    or i.resolution like 'auto-source-copy-absence:invalidated:v1 %')
   and e.duplicate_of_id is null and coalesce(e.status,'active') not in('cancelled','archived','rejected')
   and coalesce(e.end_date,e.start_date)<now()-interval '30 days'
   and nullif(btrim(e.description),'') is null
   and s.source_url='https://www.agendaq.fr/fr/agenda/'||s.source_entity_id
   and s.source_entity_id=e.external_id and s.source_entity_id=s.payload#>>'{raw,slug}'
   and e.title=s.payload#>>'{raw,name}' and s.payload_hash~'^[a-f0-9]{64}$'
   and not exists(select 1 from public.event_sources copy_source
    cross join lateral(values(copy_source.payload#>>'{normalized,description}'),(copy_source.payload#>>'{enriched,description}'),
     (copy_source.payload#>>'{raw,jsonLd,description}'),(copy_source.payload#>>'{raw,data,desc}'),(copy_source.payload#>>'{raw,data,description}')) copy(value)
    where copy_source.event_id=e.id and nullif(btrim(copy.value),'') is not null
     and btrim(copy.value) is distinct from nullif(btrim(e.description),''))
   and not exists(select 1 from public.event_sources dup where dup.event_id=e.id and dup.source_slug='agendaq' and dup.id<s.id)
   and e.start_date=case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamp with time zone')
    then (s.payload#>>'{raw,start}')::timestamptz end
   and (s.payload#>>'{raw,end}' is null or pg_input_is_valid(s.payload#>>'{raw,end}','timestamp with time zone'))
   and e.end_date is not distinct from case when pg_input_is_valid(s.payload#>>'{raw,end}','timestamp with time zone')
    then (s.payload#>>'{raw,end}')::timestamptz end
   and nullif(btrim(s.payload#>>'{raw,description}'),'') is null and nullif(btrim(s.payload#>>'{raw,descShort}'),'') is null
   and jsonb_typeof(s.payload->'raw')='object' and jsonb_typeof(s.payload#>'{raw,data}')='object'
   and case when jsonb_typeof(s.payload#>'{raw,dates}')='array' then jsonb_array_length(s.payload#>'{raw,dates}')>0 else false end
   and pg_input_is_valid(s.payload#>>'{raw,updatedOn}','timestamp with time zone')
   and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(s.payload->'raw')='object' then s.payload->'raw' else '{}' end) k where k not in(
    'name','slug','start','end','dates','updatedOn','data','description','descShort','tags','taxons','locations','assets','businesses','people','price','parent','super','children'))
   and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(s.payload#>'{raw,data}')='object' then s.payload#>'{raw,data}' else '{}' end) k where k not in('url','payment','socials','currency','mandatorydrink'))
   and not exists(select 1 from public.event_sources alt where alt.event_id=e.id and alt.source_slug is distinct from 'agendaq')
   and not exists(select 1 from public.event_sources other where other.event_id=e.id and other.id<>s.id and (
    nullif(btrim(other.payload#>>'{raw,description}'),'') is not null
    or nullif(btrim(other.payload#>>'{raw,descShort}'),'') is not null
    or nullif(btrim(other.payload#>>'{raw,jsonLd,description}'),'') is not null
    or nullif(btrim(other.payload#>>'{raw,data,desc}'),'') is not null))
  order by i.detected_at,i.id limit batch_size
  for update of i,e skip locked for share of s skip locked
 loop
  n:=n+1;ids:=array_append(ids,r.id);
  note:='auto-source-copy-absence:v1 '||jsonb_build_object(
   'reason','The complete captured historical calendar record supplies no narrative in either description field and no alternate stored source supplies one; accepted source omission without inventing prose.',
   'source_id',r.source_id,'source_url',r.source_url,'payload_hash',r.payload_hash,
   'source_last_seen_at',r.last_seen_at,'source_updated_at',r.source_updated_at,
   'current_description',r.description,'source_description_provided',false,'source_schema','agendaq-calendar:v1','description_md5',md5(r.description),
   'event_external_id',r.external_id,'start_date',r.start_date,'end_date',r.end_date,
   'finding_evidence_hash',r.evidence_hash,'automated',true,'human_reviewed',false)::text;
  if not dry_run then perform public.decide_event_quality_issue(r.id,'accepted',note); end if;
 end loop;
 return jsonb_build_object('dry_run',dry_run,'candidates',n,
  'accepted',case when dry_run then 0 else n end,'issue_ids',to_jsonb(ids));

end $fn$;
revoke all on function public.reconcile_historical_event_copy_absence(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_historical_event_copy_absence(integer,boolean) to service_role;

-- An acceptance belongs to specific source/event inputs. A changed, removed or
-- additional source can provide richer copy; make that work pending again in
-- the same transaction. Asset-only and unchanged upserts do not reopen it.
create function public.invalidate_historical_event_source_copy()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
declare affected uuid[];r record;
begin
 if tg_table_name='event_sources' then
  if tg_op='UPDATE' then
   -- Compare all captured semantic fields, including unknown/new schema keys
   -- and normalized copy. Only the known asset/timestamp fields are irrelevant.
   if row(old.event_id,old.source_slug,old.source_entity_id,old.source_url,
     case when jsonb_typeof(old.payload->'raw')='object' then jsonb_set(old.payload,'{raw}',(old.payload->'raw')-'assets'-'updatedOn') else old.payload end)
    is not distinct from
    row(new.event_id,new.source_slug,new.source_entity_id,new.source_url,
     case when jsonb_typeof(new.payload->'raw')='object' then jsonb_set(new.payload,'{raw}',(new.payload->'raw')-'assets'-'updatedOn') else new.payload end) then return new; end if;
   affected:=array[old.event_id,new.event_id];
  elsif tg_op='DELETE' then affected:=array[old.event_id];
  else affected:=array[new.event_id]; end if;
 else
  affected:=array[new.id];
 end if;
 for r in select i.id,i.event_id,i.issue_code,i.resolution from public.event_quality_issues i
  join public.events e on e.id=i.event_id
  where i.event_id=any(affected) and i.status='accepted' and i.reviewed_by is null
   and ((i.issue_code='DESCRIPTION_THIN' and i.resolution like 'auto-source-brevity:v1 %')
    or (i.issue_code='DESCRIPTION_MISSING' and i.resolution like 'auto-source-copy-absence:v1 %'))
   and e.duplicate_of_id is null and coalesce(e.status,'active') not in('cancelled','archived','rejected')
  for update of i
 loop
  update public.event_quality_issues set status='open',resolved_at=null,reviewed_at=now(),
   resolution=(case when r.issue_code='DESCRIPTION_THIN' then 'auto-source-brevity:invalidated:v1 '
    else 'auto-source-copy-absence:invalidated:v1 ' end)||jsonb_build_object(
    'reason','Source or event inputs changed; reassess complete source copy',
    'input_table',tg_table_name,'operation',tg_op,'at',now(),'previous_resolution',r.resolution,
    'automated',true,'human_reviewed',false)::text where id=r.id;
  update public.event_quality_current c set open_issue_codes=coalesce((select array_agg(i.issue_code order by i.issue_code)
   from public.event_quality_issues i where i.event_id=r.event_id and i.status='open'),'{}'::text[])
   where c.event_id=r.event_id;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $fn$;
revoke all on function public.invalidate_historical_event_source_copy() from public,anon,authenticated;
grant execute on function public.invalidate_historical_event_source_copy() to service_role;

create trigger event_sources_invalidate_source_copy
after insert or delete or update of event_id,source_slug,source_entity_id,source_url,payload on public.event_sources
for each row execute function public.invalidate_historical_event_source_copy();
create trigger events_invalidate_source_copy
after update of title,description,external_id,start_date,end_date on public.events
for each row when(old.title is distinct from new.title or old.description is distinct from new.description
 or old.external_id is distinct from new.external_id or old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date)
execute function public.invalidate_historical_event_source_copy();

-- Use the existing repair job's enabled/paused controls and dry-run semantics.
do $patch$
declare target regprocedure;src text;decl_anchor text:='v_update jsonb;';
 loop_anchor text:='for r in select distinct e.* from public.events e';
 return_anchor text:='return jsonb_build_object(''dry_run'',p_dry_run,''candidates'',v_candidates,''changed'',v_changed);';
begin
 target:=coalesce(to_regprocedure('api_private.run_event_quality_repairs(integer,boolean)'),to_regprocedure('public.run_event_quality_repairs(integer,boolean)'));
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,decl_anchor,'')))/length(decl_anchor)<>1
  or (length(src)-length(replace(src,loop_anchor,'')))/length(loop_anchor)<>1
  or (length(src)-length(replace(src,return_anchor,'')))/length(return_anchor)<>1 then
  raise exception 'Event quality repair automation hook changed';
 end if;
 src:=replace(src,decl_anchor,decl_anchor||' v_source_brevity jsonb; v_source_copy_absence jsonb;');
 src:=replace(src,loop_anchor,$hook$if auth.uid() is null then
   v_source_brevity := public.reconcile_historical_event_brevity(p_batch,p_dry_run);
   v_source_copy_absence := public.reconcile_historical_event_copy_absence(p_batch,p_dry_run);
  else
   v_source_brevity := jsonb_build_object('skipped',true,'reason','internal_source_outcomes_only');
   v_source_copy_absence := v_source_brevity;
  end if;
  $hook$||loop_anchor);
 src:=replace(src,return_anchor,'return jsonb_build_object(''dry_run'',p_dry_run,''candidates'',v_candidates,''changed'',v_changed,''source_brevity'',v_source_brevity,''source_copy_absence'',v_source_copy_absence);');
 execute src;
end $patch$;
