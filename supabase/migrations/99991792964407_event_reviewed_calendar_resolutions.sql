-- Explicit organizer evidence, never a previous edition's month/day copied forward.
do $$
declare r record; e public.events%rowtype;
begin
 for r in select * from (values
  ('52c4e08e-da1f-43a4-87a3-fec1d6d212a9'::uuid,'Midsumma Pride March 2027','2027-02-01'::date,'2027-01-31'::date,'2027-01-31'::date,
   'https://www.midsumma.org.au/info/midsumma-festival-dates/','Midsumma Pride March: Sunday 31 January 2027'),
  ('6f2fc14e-1656-40eb-9f41-8924ec3768da'::uuid,'West Pride Gothenburg 2027','2027-06-08'::date,'2027-06-07'::date,'2027-06-13'::date,
   'https://www.westpride.se/','West Pride 2027 – 7-13 juni'),
  ('094719da-ceac-4b2f-b3b7-aa5f26ae548c'::uuid,'Dublin Pride 2027','2027-06-27'::date,'2027-06-23'::date,'2027-06-27'::date,
   'https://dublinpride.ie/','2027 Dublin Pride Festival June 23rd – 27th')
 ) as v(id,title,expected_day,start_day,end_day,source_url,quote) loop
  select * into e from public.events where id=r.id for update;
  if e.title=r.title and e.data_source='seed:clone-from-2026' and e.start_date::date=r.expected_day
    and e.duplicate_of_id is null then
   update public.events set start_date=r.start_day::timestamp at time zone 'UTC',
    end_date=(r.end_day::timestamp+interval '23 hours 59 minutes') at time zone 'UTC',
    description=replace(description,'Date is an estimate; check the official event for confirmation.','Dates confirmed by the organizer.'),
    field_provenance=jsonb_set(coalesce(field_provenance,'{}'),'{verified_edition_date}',jsonb_build_object(
      'verified',true,'source_url',r.source_url,'quote',r.quote,'checked_at',now(),
      'previous_start',e.start_date,'previous_end',e.end_date,'method','owner-directed-primary-source-review')),
    updated_at=now() where id=r.id;
   delete from public.event_quality_current where event_id=r.id;
  end if;
 end loop;
 -- The organizer explicitly cancelled/postponed this occurrence, with no new date announced.
 select * into e from public.events where id='252667ca-f1df-4b75-92ea-7e0b0509c29a' for update;
 if e.title='Week-end Rubber 2026' and e.status='active' and e.data_source='agendaq' then
  update public.events set status='cancelled',needs_attention=true,
   field_provenance=jsonb_set(coalesce(field_provenance,'{}'),'{source_schedule_recovery}',
    coalesce(field_provenance->'source_schedule_recovery','{}')||jsonb_build_object('outcome','cancelled',
     'reason','organizer_postponed_no_replacement_date','checked_at',now(),
     'resolution_url','https://mecs-en-caoutchouc.com/2026/10/annulation-week-end-rubber-mec-cancelled/',
     'quote','ANNULATION / Week-end Rubber MEC / CANCELLED')),
   updated_at=now() where id=e.id;
  delete from public.event_quality_current where event_id=e.id;
 end if;
end $$;

-- This stored 2022 edition has one explicit April 29-May 2 2022 calendar.
-- Its aggregate end was accidentally extended to 2026; retain the original in audit.
update public.events set end_date='2022-05-02 23:59 Europe/Madrid'::timestamptz,status='completed',
 field_provenance=jsonb_set(coalesce(field_provenance,'{}'),'{calendar_span_correction}',jsonb_build_object(
  'previous_end',end_date,'source_record_id',field_provenance#>>'{source_schedule_recovery,source_record_id}',
  'source_calendar_end','2022-05-02','reason','explicit_2022_edition_calendar','at',now())),updated_at=now()
where id='addfc0c7-8c4c-4609-8449-f7962dd96093' and title='Sleazy Madrid 2022'
 and end_date='2026-12-31 05:00:00+00' and data_source='agendaq'
 and exists(select 1 from public.event_sources s where s.event_id=events.id
  and s.payload#>>'{raw,dates,0,1,start}'='2022-04-29' and s.payload#>>'{raw,dates,0,1,end}'='2022-05-02'
  and jsonb_array_length(s.payload#>'{raw,dates}')=1);

-- Historical reviews must retain an explicit disposition once their source calendar ends.
-- This does not cancel or verify the event itself, and creates no future sessions.
update public.events e set field_provenance=jsonb_set(field_provenance,'{source_schedule_recovery}',
 field_provenance->'source_schedule_recovery'||jsonb_build_object('outcome','expired_source_calendar',
  'reason','no_current_calendar_period','reviewed_at',now())),updated_at=now()
where field_provenance#>>'{source_schedule_recovery,outcome}'='review'
 and exists(select 1 from public.event_sources s where s.id=(e.field_provenance#>>'{source_schedule_recovery,source_record_id}')::uuid
  and jsonb_typeof(s.payload#>'{raw,dates}')='array'
  and not exists(select 1 from jsonb_array_elements(s.payload#>'{raw,dates}') d
   where greatest(d#>>'{1,start}',d#>>'{1,end}')>current_date::text))
 and coalesce(e.end_date,e.start_date)<now();
