-- Recover missing canonical schedules from attributable AgendaQ calendar entries.
-- Keep original date spans and legacy annual-edition flags unchanged.
create or replace function public.agendaq_evidence_schedule(p_raw jsonb,p_from date default current_date-1,p_to date default (current_date+interval '18 months')::date)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare entry jsonb; c jsonb; slots jsonb:='[]'; tz text; entry_tz text;
 a date; b date; d date; first_day date; last_day date; opening time; closing time;
 recurrence text; every_n integer; dow integer; nth integer; month_delta integer;
 until_day date; count_entries integer:=0;
begin
 if jsonb_typeof(p_raw->'dates') is distinct from 'array' then return null; end if;
 if jsonb_array_length(p_raw->'dates')=0
   or p_to<p_from or p_to-p_from>600 then return null; end if;
 for entry in select value from jsonb_array_elements(p_raw->'dates') loop
   if entry->>0<>'cal' or jsonb_typeof(entry->1)<>'object' then return null; end if;
   c:=entry->1;
   if coalesce(c->>'start','')!~'^\d{4}-\d{2}-\d{2}$'
     or coalesce(c->>'end','')!~'^\d{4}-\d{2}-\d{2}$' then return null; end if;
   a:=(c->>'start')::date; b:=(c->>'end')::date;
   if b<a then return null; end if;
   if b<p_from or a>p_to then continue; end if;
   entry_tz:=nullif(c->>'tz','');
   if entry_tz is null or not exists(select 1 from pg_timezone_names where name=entry_tz)
      or (tz is not null and tz<>entry_tz) then return null; end if;
   tz:=entry_tz;
   if coalesce(c->>'startH','')!~'^\d{2}:\d{2}$'
      or coalesce(c->>'endH','')!~'^\d{2}:\d{2}$' then return null; end if;
   opening:=(c->>'startH')::time; closing:=(c->>'endH')::time;
   recurrence:=coalesce(c->>'recurring','');
   every_n:=coalesce(nullif(c->>'every','')::integer,1);
   if every_n<1 or every_n>52 or recurrence not in ('','d','w','m') then return null; end if;
   if recurrence in ('w','m') and every_n<>1 then return null; end if;
   if recurrence='m' then
     dow:=(c->>'m.day')::integer; nth:=(c->>'m.nth')::integer;
     -- The feed's fifth/last-week sentinel needs a source specification. Do not
     -- silently reinterpret it as a fifth or last weekday.
     if dow is null or dow not between 0 and 6 or nth is null or nth not between 1 and 4 then return null; end if;
   end if;
   count_entries:=count_entries+1; until_day:=greatest(until_day,b);
   first_day:=greatest(a,p_from); last_day:=least(b,p_to);
   if recurrence='' then
     -- The existing extra-slot model supports same-day or overnight occurrences.
     -- Reject longer explicit spans rather than truncate them or invent daily openings.
     if b-a>1 or (b-a=1 and closing>opening) or (b=a and closing<=opening) then return null; end if;
     if a>=p_from and a<=p_to then
       slots:=slots||jsonb_build_array(jsonb_build_object('date',a,'start',to_char(opening,'HH24:MI'),
         'end',to_char(closing,'HH24:MI'),'end_date',b));
     end if;
     continue;
   end if;
   for d in select day::date from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') day loop
     if recurrence='d' and (d-a)%every_n<>0 then continue; end if;
     if recurrence='w' and (coalesce((c->>('w.'||extract(dow from d)::integer))::boolean,false)=false
       or ((d-date_trunc('week',a)::date)/7)%every_n<>0) then continue; end if;
     if recurrence='m' then
       month_delta:=(extract(year from d)::integer-extract(year from a)::integer)*12
         +extract(month from d)::integer-extract(month from a)::integer;
       if month_delta%every_n<>0 or extract(dow from d)::integer<>dow
         or ((extract(day from d)::integer-1)/7)+1<>nth then continue; end if;
     end if;
     slots:=slots||jsonb_build_array(jsonb_build_object('date',d,'start',to_char(opening,'HH24:MI'),
       'end',to_char(closing,'HH24:MI')));
   end loop;
 end loop;
 if tz is null or count_entries=0 then return null; end if;
 select coalesce(jsonb_agg(v order by v->>'date',v->>'start'),'[]') into slots
 from(select distinct value v from jsonb_array_elements(slots)) distinct_slots;
 return jsonb_build_object('kind','recurrence','tz',tz,'confidence','feed','source','agendaq-raw',
   'weekly','[]'::jsonb,'extra',slots,'exceptions','[]'::jsonb,'until',until_day,
   'recovery_horizon',p_to,'source_hash',md5((p_raw->'dates')::text));
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then return null;
end $$;
revoke all on function public.agendaq_evidence_schedule(jsonb,date,date) from public,anon,authenticated;
grant execute on function public.agendaq_evidence_schedule(jsonb,date,date) to service_role;

create or replace function public.run_event_source_schedule_recovery(p_batch integer default 75,p_dry_run boolean default true,p_event_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; rule jsonb; fingerprint text; n integer:=0; repaired integer:=0; blocked integer:=0;
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

-- Re-open source evidence without waiting behind an active completion lock.
create or replace function public.reopen_event_gaps_from_source()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new.payload_hash is not distinct from old.payload_hash
   and new.source_url is not distinct from old.source_url then return new; end if;
 update public.event_gap_queue q set next_attempt_at=now(),no_change_streak=0,updated_at=now()
 where (q.event_id,q.lane) in(select g.event_id,g.lane from public.event_gap_queue g
   where g.event_id=new.event_id and coalesce(g.lease_until,'-infinity')<now() for update skip locked);
 return new;
end $$;
revoke all on function public.reopen_event_gaps_from_source() from public,anon,authenticated;

select cron.schedule('event_source_schedule_recovery','11-59/20 * * * *',
  $$select public.run_event_source_schedule_recovery(75,false)$$);

-- Canonical schedule evidence, not a legacy annual-edition flag, determines
-- whether a long span is unresolved. This changes selectors, never event dates.
do $$
declare f regprocedure; definition text;
begin
 foreach f in array array['public.claim_event_gaps(text,uuid,integer,uuid[],boolean)'::regprocedure,
   'public.event_gap_metrics()'::regprocedure] loop
   definition:=pg_get_functiondef(f);
   definition:=replace(definition,'coalesce(e.is_recurring,false)=false',
     'coalesce(e.is_recurring,false)=false and e.schedule is null');
   execute definition;
 end loop;
end $$;
