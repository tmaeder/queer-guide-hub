-- An archival calendar source that supplies no narrative cannot support invented
-- editorial copy. Record an explicit source limitation with the native ACCEPTED
-- outcome. Default dry run; preserve all event content, scores and detector evidence.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
do $repair$
declare dry_run boolean:=true;batch_size integer:=500;r record;n integer:=0;ids uuid[]:='{}';note text;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic source outcomes require an internal actor'; end if;
 for r in
  select i.id,i.event_id,i.evidence_hash,e.external_id,e.title,e.description,e.start_date,e.end_date,
   s.id source_id,s.source_url,s.payload_hash,s.last_seen_at,s.payload#>>'{raw,updatedOn}' source_updated_at
  from public.event_quality_issues i join public.events e on e.id=i.event_id
  join public.event_sources s on s.event_id=e.id and s.source_slug='agendaq'
  where i.status='open' and i.issue_code='DESCRIPTION_MISSING' and i.severity='high'
   and i.dimension='completeness' and i.detector='event-quality-scan'
   and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null
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
 perform set_config('matching.source_copy_absence',jsonb_build_object('dry_run',dry_run,'candidates',n,
  'accepted',case when dry_run then 0 else n end,'issue_ids',to_jsonb(ids))::text,true);
end $repair$;
select current_setting('matching.source_copy_absence')::jsonb result;
commit;
