-- AgendaQ's live renderer confirms m.nth=5 means LAST, not fifth.
-- CANCEL entries are exclusions, including recurring exclusions and ranges.
create or replace function public.agendaq_evidence_schedule(p_raw jsonb,p_from date default current_date-1,p_to date default (current_date+interval '18 months')::date)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare entry jsonb; c jsonb; slots jsonb:='[]'; omitted jsonb:='[]'; cancelled date[]:='{}'; tz text; entry_tz text;
 a date; b date; d date; opening time; closing time; recurrence text; every_n integer;
 dow integer; nth integer; month_delta integer; until_day date; is_cancel boolean; n integer:=0;
begin
 if jsonb_typeof(p_raw->'dates') is distinct from 'array' or p_to<p_from or p_to-p_from>600 then return null; end if;
 for entry in select value from jsonb_array_elements(p_raw->'dates') loop
  if entry->>0<>'cal' or jsonb_typeof(entry->1)<>'object' then return null; end if;
  c:=entry->1;
  if coalesce(c->>'start','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(c->>'end','')!~'^\d{4}-\d{2}-\d{2}$' then return null; end if;
  a:=(c->>'start')::date; b:=(c->>'end')::date;
  -- Historical typos cannot invalidate an otherwise current calendar.
  if greatest(a,b)<p_from then continue; end if;
  if b<a then omitted:=omitted||jsonb_build_array(jsonb_build_object('reason','reversed_source_period','calendar',c)); continue; end if;
  if a>p_to then continue; end if;
  is_cancel:=upper(coalesce(c->>'label',''))='CANCEL';
  entry_tz:=nullif(c->>'tz','');
  if entry_tz is null then return null; end if;
  perform p_from::timestamp at time zone entry_tz; tz:=coalesce(tz,entry_tz);
  recurrence:=coalesce(c->>'recurring','');
  every_n:=coalesce(nullif(c->>'every','')::integer,1);
  if every_n not between 1 and 52 or recurrence not in ('','d','w','m') then return null; end if;
  if recurrence='m' then
   dow:=(c->>'m.day')::integer; nth:=(c->>'m.nth')::integer;
   if dow is null or dow not between 0 and 6 or nth is null or nth not between 1 and 5 then return null; end if;
  end if;
  if not is_cancel then
   if coalesce(c->>'startH','')!~'^\d{2}:\d{2}$' or coalesce(c->>'endH','')!~'^\d{2}:\d{2}$' then return null; end if;
   opening:=(c->>'startH')::time; closing:=(c->>'endH')::time;
   -- A one-off span is one span. It never implies daily opening hours.
   -- Long spans remain reviewable source errors rather than year-long parties.
   if recurrence='' and b-a>90 then omitted:=omitted||jsonb_build_array(jsonb_build_object('reason','ambiguous_long_source_period','calendar',c)); continue; end if;
   n:=n+1; until_day:=greatest(until_day,b);
  end if;
  for d in select day::date from generate_series(greatest(a,p_from)::timestamp,least(b,p_to)::timestamp,interval '1 day') day loop
   if recurrence='d' and (d-a)%every_n<>0 then continue; end if;
   if recurrence='w' and (not coalesce((c->>('w.'||extract(dow from d)::integer))::boolean,false)
     or ((d-date_trunc('week',a)::date)/7)%every_n<>0) then continue; end if;
   if recurrence='m' then
    month_delta:=(extract(year from d)::integer-extract(year from a)::integer)*12+extract(month from d)::integer-extract(month from a)::integer;
    if month_delta%every_n<>0 or extract(dow from d)::integer<>dow then continue; end if;
    if (nth=5 and extract(month from d+7)=extract(month from d))
      or (nth<>5 and ((extract(day from d)::integer-1)/7)+1<>nth) then continue; end if;
   end if;
   -- Different IANA names are allowed only when their instants agree for every materialized date.
   if entry_tz<>tz and (((d+coalesce(opening,'00:00'::time)) at time zone entry_tz) is distinct from ((d+coalesce(opening,'00:00'::time)) at time zone tz)
    or ((d+coalesce(closing,'23:59'::time)) at time zone entry_tz) is distinct from ((d+coalesce(closing,'23:59'::time)) at time zone tz)) then return null; end if;
   if is_cancel then cancelled:=array_append(cancelled,d);
   elsif recurrence='' then
    if d=greatest(a,p_from) then slots:=slots||jsonb_build_array(jsonb_build_object('date',a,'start',to_char(opening,'HH24:MI'),
      'end',to_char(closing,'HH24:MI'),'end_date',case when b=a and closing<=opening then b+1 else b end)); end if;
   else slots:=slots||jsonb_build_array(jsonb_build_object('date',d,'start',to_char(opening,'HH24:MI'),'end',to_char(closing,'HH24:MI')));
   end if;
  end loop;
 end loop;
 if tz is null or n=0 then return null; end if;
 select coalesce(jsonb_agg(v order by v->>'date',v->>'start'),'[]') into slots
 from(select distinct value v from jsonb_array_elements(slots) where not ((value->>'date')::date=any(cancelled))) s;
 return jsonb_build_object('kind','recurrence','tz',tz,'confidence','feed','source','agendaq-raw','parser_version',2,'omitted_periods',omitted,
   'weekly','[]'::jsonb,'extra',slots,'exceptions',to_jsonb(cancelled),'until',until_day,'recovery_horizon',p_to,'source_hash',md5((p_raw->'dates')::text));
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return null;
end $$;
revoke all on function public.agendaq_evidence_schedule(jsonb,date,date) from public,anon,authenticated;
grant execute on function public.agendaq_evidence_schedule(jsonb,date,date) to service_role;

-- The existing extra slot expander must respect explicit end dates for weekends.
-- Keep the rest of its published behavior and permission boundary intact.
do $$
declare def text; old text; replacement text; marker text; pos integer;
begin
 select pg_get_functiondef('public.event_schedule_dates(jsonb,timestamptz,timestamptz)'::regprocedure) into def;
 old:='v_close_at := ((case when v_close <= v_open then v_day + 1 else v_day end)::text';
 replacement:='v_close_at := ((case when v_entry ? ''end_date'' then greatest(v_day,(v_entry->>''end_date'')::date) when v_close <= v_open then v_day + 1 else v_day end)::text';
 marker:='  for v_entry in'||chr(10)||'    select value from jsonb_array_elements(coalesce(p_schedule->''extra''';
 pos:=strpos(def,marker);
 if pos=0 or strpos(substring(def from pos),old)=0 then
  raise exception 'Unknown extra-slot expander; review before replacing'; end if;
 def:=left(def,pos-1)||replace(replace(substring(def from pos),old,replacement),
  'if v_open_at >= p_from and v_open_at <= p_to then',
  'if coalesce(v_close_at,v_open_at) >= p_from and v_open_at <= p_to then');
 execute def;
end $$;

-- Re-evaluate owned schedules once on parser changes, including rejected hashes.
do $$
declare def text;
begin
 select pg_get_functiondef('public.run_event_source_schedule_recovery(integer,boolean,uuid[])'::regprocedure) into def;
 def:=replace(def,'and (e.field_provenance#>>','and (coalesce(e.field_provenance#>>''{source_schedule_recovery,parser_version}'',''1'')<>''2'' or e.field_provenance#>>');
 def:=replace(def,'''input_hash'',r.input_hash','''parser_version'',2,''omitted_periods'',coalesce(rule->''omitted_periods'',''[]''::jsonb),''input_hash'',r.input_hash');
 def:=replace(def,'''outcome'',case when rule is null then ''review'' else ''updated'' end', '''outcome'',case when rule is null then ''review'' when jsonb_array_length(coalesce(rule->''omitted_periods'',''[]''::jsonb))>0 then ''partial'' else ''updated'' end');
 def:=replace(def,'needs_attention=case when rule is null then true else needs_attention end','needs_attention=case when rule is null or jsonb_array_length(coalesce(rule->''omitted_periods'',''[]''::jsonb))>0 then true else needs_attention end');
 execute def;
end $$;
