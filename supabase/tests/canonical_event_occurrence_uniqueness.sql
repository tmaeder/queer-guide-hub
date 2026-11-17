-- Integration regression: run as an internal database actor against seeded data.
-- All synthetic records and trigger side effects roll back.
begin;
do $test$
declare v public.venues; survivor uuid:=gen_random_uuid(); donor uuid:=gen_random_uuid();
 label text:='Review uniqueness regression '||gen_random_uuid(); stamp timestamptz:='2036-11-16T19:00:00Z'; rejected boolean:=false;
begin
 select * into v from public.venues where duplicate_of_id is null
  and city_id is not null and country_id is not null order by id limit 1;
 if not found then raise exception 'Test requires one seeded canonical venue';end if;
 insert into public.events(id,title,event_type,start_date,slug,is_public,city_id,country_id)
 values(survivor,label,'social',stamp,'review-regression-'||survivor,false,v.city_id,v.country_id);
 insert into public.events(id,title,event_type,start_date,slug,is_public,venue_id,city_id,country_id,duplicate_of_id)
 values(donor,label,'social',stamp,'review-regression-'||donor,false,v.id,v.city_id,v.country_id,survivor);
 -- The old index refused this valid survivor link because the donor held the slot.
 update public.events set venue_id=v.id where id=survivor;
 begin
  insert into public.events(title,event_type,start_date,slug,is_public,venue_id,city_id,country_id)
  values(label,'social',stamp,'review-regression-'||gen_random_uuid(),false,v.id,v.city_id,v.country_id);
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Canonical duplicate was allowed';end if;
 rejected:=false;
 begin
  update public.events set duplicate_of_id=null where id=donor;
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Conflicting unmerge was allowed';end if;
 if not exists(select 1 from public.events where id=donor and duplicate_of_id=survivor and venue_id=v.id)then
  raise exception 'Merged source relationship was not retained';end if;
end $test$;
select 'Canonical link, duplicate prevention, unmerge protection and source retention passed' result;
rollback;
