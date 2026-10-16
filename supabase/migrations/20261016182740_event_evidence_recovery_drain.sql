-- Bound backfill transactions; the temporary drain stops itself when empty.
create or replace function public.run_event_source_schedule_recovery(p_batch integer default 75,p_dry_run boolean default true,p_event_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; rule jsonb; fingerprint text; n integer:=0; repaired integer:=0; blocked integer:=0; started timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtext('event_source_schedule_recovery')) then
   return jsonb_build_object('busy',true,'updated',0); end if;
 for r in
   select e.id,e.schedule,s.id source_id,s.source_url,s.payload->'raw' raw,
     md5((s.payload#>'{raw,dates}')::text) input_hash
   from public.events e join lateral(select es.id,es.source_url,es.payload from public.event_sources es
     where es.event_id=e.id and es.source_slug='agendaq' and jsonb_typeof(es.payload#>'{raw,dates}')='array'
     order by es.is_primary desc,es.last_seen_at desc limit 1)s on true
   where e.duplicate_of_id is null and e.status='active' and e.data_source='agendaq'
     and coalesce(e.end_date,e.start_date)>=now()
     and (p_event_ids is null or e.id=any(p_event_ids))
     and (e.schedule is null or e.schedule->>'source'='agendaq-raw')
     and (e.field_provenance#>>'{source_schedule_recovery,input_hash}' is distinct from md5((s.payload#>'{raw,dates}')::text)
       or (e.schedule->>'source'='agendaq-raw' and (e.schedule->>'recovery_horizon')::date<current_date+365))
   order by e.start_date desc,e.id limit greatest(0,least(coalesce(p_batch,75),250))
   for update of e skip locked
 loop
   exit when clock_timestamp()-started>interval '20 seconds';
   n:=n+1;
   rule:=public.agendaq_evidence_schedule(r.raw);
   if rule is null then blocked:=blocked+1; else repaired:=repaired+1; end if;
   if p_dry_run then continue; end if;
   update public.events set
     schedule=case when rule is null then schedule else rule end,
     field_provenance=jsonb_set(coalesce(field_provenance,'{}'),'{source_schedule_recovery}',
       jsonb_build_object('input_hash',r.input_hash,'source_url',r.source_url,'source_record_id',r.source_id,
         'at',now(),'outcome',case when rule is null then 'review' else 'updated' end,
         'reason',case when rule is null then 'unsupported_or_incomplete_calendar' else 'source_calendar_restored' end,
         'slots',case when rule is null then 0 else jsonb_array_length(rule->'extra') end)),
     needs_attention=case when rule is null then true else needs_attention end,
     updated_at=now()
   where id=r.id;
   if rule is not null then
     delete from public.event_quality_current where event_id=r.id;
     update public.event_gap_queue q set next_attempt_at=now(),updated_at=now()
     where (q.event_id,q.lane) in(select g.event_id,g.lane from public.event_gap_queue g
       where g.event_id=r.id and g.last_outcome='review' and g.last_details->>'reason'='unverified_long_running_schedule'
       and coalesce(g.lease_until,'-infinity')<now() for update skip locked);
     insert into public.event_quality_signals(event_id,signal_type,value,source,details)
     values(r.id,'enrichment',1,'event-source-recovery',jsonb_build_object('fields',array['schedule'],
       'source_url',r.source_url,'source_hash',r.input_hash,'slots',jsonb_array_length(rule->'extra')));
   end if;
 end loop;
 return jsonb_build_object('examined',n,'updated',repaired,'review',blocked,'dry_run',p_dry_run);
end $$;
revoke all on function public.run_event_source_schedule_recovery(integer,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.run_event_source_schedule_recovery(integer,boolean,uuid[]) to service_role;

select cron.schedule('event_source_schedule_drain','* * * * *',$job$
do $drain$
declare result jsonb;
begin
 result:=public.run_event_source_schedule_recovery(250,false);
 if (result->>'examined')::integer=0 and not coalesce((result->>'busy')::boolean,false) then
   perform cron.unschedule('event_source_schedule_drain');
 end if;
end $drain$;
$job$);

-- Pass only the raw source fields needed by deterministic content/media fills.
do $$
declare definition text; previous text:=$old$jsonb_build_object('description',left(es.payload#>>'{raw,description}',20000)) as raw$old$;
begin
 definition:=pg_get_functiondef('public.claim_event_gaps(text,uuid,integer,uuid[],boolean)'::regprocedure);
 if position(previous in definition)=0 then raise exception 'claim source evidence contract changed'; end if;
 definition:=replace(definition,previous,$new$jsonb_build_object(
   'description',left(coalesce(es.payload#>>'{raw,description}',es.payload#>>'{raw,descShort}'),20000),
   'assets',jsonb_path_query_array(es.payload,'$.raw.assets[0 to 4]')) as raw$new$);
 execute definition;
end $$;
