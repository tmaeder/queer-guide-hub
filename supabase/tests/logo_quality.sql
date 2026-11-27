-- Integration checks against real trigger/RPC behavior; all mutations roll back.
begin;
do $$
<<logo_quality>>
declare id uuid := gen_random_uuid(); lease uuid := gen_random_uuid(); result text;
  v public.venues; d public.venues; submitted text := 'https://img.queer.guide/logos/525b075474e7f890985c8e0a2cadc3d358f58ad43888c83347ec0406f88bb46b.png';
begin
 if has_function_privilege('anon','public.logo_quality_claim(text,integer)','execute') or
    has_function_privilege('authenticated','public.logo_quality_finish(text,uuid,uuid,text,text,text,jsonb,boolean)','execute') then
   raise exception 'Privileged logo processing is publicly executable';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.logo_quality_history'::regclass) then raise exception 'History RLS missing'; end if;
 insert into public.logo_quality_jobs(entity_table,entity_id,entity_name,expected_url,expected_website,status,lease)
 values('venues',id,'Deleted synthetic entity',null,null,'processing',lease);
 result := public.logo_quality_finish('venues',id,lease,'review',null,'fixture','{}');
 if result<>'superseded' then raise exception 'Deleted entity was not detected: %',result; end if;
 result := public.logo_quality_finish('venues',id,lease,'review',null,'fixture','{}');
 if result<>'stale_lease' then raise exception 'Stale lease accepted: %',result; end if;
 update public.logo_quality_jobs set status='processing',attempts=3,updated_at=now()-interval '11 minutes'
 where entity_table='venues' and entity_id=logo_quality.id;
 perform public.logo_quality_claim('__no_fixture_entities',1);
 if not exists(select 1 from public.logo_quality_jobs where entity_id=logo_quality.id and status='review' and reason='processing_budget_exhausted') then
   raise exception 'Exhausted lease was stranded instead of sent to review';
 end if;

 select * into v from public.venues where duplicate_of_id is null and website is not null
   and not exists(select 1 from public.logo_quality_jobs j where j.entity_table='venues' and j.entity_id=venues.id)
   limit 1 for update;
 if not found then raise exception 'No integration fixture available'; end if;
 -- A known denied logo is held/cleared before publication and its source saved.
 update public.venues set logo_url=submitted where venues.id=v.id;
 if exists(select 1 from public.venues where venues.id=v.id and logo_url=submitted) then raise exception 'Known platform mark published'; end if;
 if not exists(select 1 from public.logo_quality_jobs where entity_table='venues' and entity_id=v.id and evidence->>'blocked_url'=submitted) then raise exception 'Missing write-guard evidence'; end if;

 -- An unverified automated import must preserve the current image until verified.
 submitted := 'https://example.com/unverified-logo.png';
 update public.venues set logo_url=submitted where venues.id=v.id;
 if exists(select 1 from public.venues where venues.id=v.id and logo_url=submitted) then raise exception 'Unverified imported logo published'; end if;
 if not exists(select 1 from public.logo_quality_jobs where entity_table='venues' and entity_id=v.id and evidence->>'submitted_url'=submitted) then raise exception 'Submitted image was not held for verification'; end if;

 -- An editor changing the image after a claim makes that claim obsolete.
 update public.logo_quality_jobs set status='processing',lease=logo_quality.lease,expected_url='https://example.com/stale.png'
 where entity_table='venues' and entity_id=v.id;
 result := public.logo_quality_finish('venues',v.id,lease,'review',null,'fixture','{}');
 if result<>'superseded' then raise exception 'Intervening edit overwritten: %',result; end if;
 select venues.* into d from public.venues join public.logo_quality_jobs j on j.entity_table='venues' and j.entity_id=venues.id
 where venues.duplicate_of_id is not null limit 1 for update of venues;
 if found then
   update public.logo_quality_jobs set status='processing',lease=logo_quality.lease,
     expected_url=d.logo_url,expected_website=d.website where entity_table='venues' and entity_id=d.id;
   result:=public.logo_quality_finish('venues',d.id,lease,'review',null,'fixture','{}');
   if result<>'superseded' then raise exception 'Merged alias accepted for repair: %',result; end if;
 end if;
end $$;
rollback;
