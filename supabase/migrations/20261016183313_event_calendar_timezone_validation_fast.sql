-- AT TIME ZONE resolves and validates one timezone instead of enumerating all
-- timezone names for every period. Source semantics and date bounds are unchanged.
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
   if entry_tz is null or (tz is not null and tz<>entry_tz) then return null; end if;
   if tz is null then perform p_from::timestamp at time zone entry_tz; end if;
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
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return null;
end $$;
revoke all on function public.agendaq_evidence_schedule(jsonb,date,date) from public,anon,authenticated;
grant execute on function public.agendaq_evidence_schedule(jsonb,date,date) to service_role;
