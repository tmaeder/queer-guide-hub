create table fixture_ids(n int primary key,e uuid,s uuid,i uuid);
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(1,36) n;
insert into events(id,title,external_id,description,start_date,end_date)
select e,'Archive event '||n,'event-'||n,'Programme complet : DJ A et DJ B, edition '||n,
 now()-interval '60 days',now()-interval '60 days'+interval '1 hour' from fixture_ids;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
select f.s,e.id,'agendaq',e.external_id,'https://www.agendaq.fr/fr/agenda/'||e.external_id,repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object('name',e.title,'slug',e.external_id,'start',e.start_date,'end',e.end_date,
 'descShort',e.description)) from events e join fixture_ids f on f.e=e.id;
insert into event_quality_issues(id,event_id,issue_code,evidence,evidence_hash,detected_at)
select f.i,e.id,'DESCRIPTION_THIN',jsonb_build_object('length',length(btrim(e.description))),'original-hash-'||f.n,
 now()+f.n*interval '1 second' from events e join fixture_ids f on f.e=e.id;
insert into event_quality_issues(event_id,issue_code,evidence,evidence_hash,detected_at)
select e.id,'IMAGE_MISSING','{}','image-hash',now() from events e;
insert into event_quality_current(event_id,open_issue_codes) select id,array['DESCRIPTION_THIN','IMAGE_MISSING'] from events;

update event_sources set payload=jsonb_set(payload,'{raw,description}',to_jsonb(repeat('Longer source body ',8))) where id=(select s from fixture_ids where n=2);
update events set title=description where id=(select e from fixture_ids where n=3);
update event_sources set payload=jsonb_set(payload,'{raw,name}',to_jsonb((select title from events where id=event_id))) where id=(select s from fixture_ids where n=3);
update events set start_date=now()+interval '1 day',end_date=now()+interval '2 days' where id=(select e from fixture_ids where n=4);
update event_quality_issues set reviewed_by=gen_random_uuid() where id=(select i from fixture_ids where n=5);
update event_quality_issues set reviewed_at=now() where id=(select i from fixture_ids where n=6);
update event_quality_issues set resolution='Human editorial note' where id=(select i from fixture_ids where n=7);
update event_quality_issues set severity='critical' where id=(select i from fixture_ids where n=8);
update events set description=null where id=(select e from fixture_ids where n=9);
update events set description='<p>Incomplete rendered HTML copy</p>' where id=(select e from fixture_ids where n=10);
update event_sources set payload=jsonb_set(payload,'{raw,name}','"Wrong event"') where id=(select s from fixture_ids where n=11);
update events set external_id='wrong' where id=(select e from fixture_ids where n=12);
update event_sources set payload=jsonb_set(payload,'{raw,slug}','"wrong"') where id=(select s from fixture_ids where n=13);
update event_sources set source_url='https://example.com/event' where id=(select s from fixture_ids where n=14);
update event_sources set payload=jsonb_set(payload,'{raw,start}','"2020-01-01"') where id=(select s from fixture_ids where n=15);
update event_sources set payload=jsonb_set(payload,'{raw,start}','"not a date"') where id=(select s from fixture_ids where n=16);
update event_sources set payload=jsonb_set(payload,'{raw,end}','"2020-01-01"') where id=(select s from fixture_ids where n=17);
update event_sources set payload=jsonb_set(payload,'{raw,end}','"not a date"') where id=(select s from fixture_ids where n=18);
update events set description='Programme annonce prochainement...' where id=(select e from fixture_ids where n=19);
update event_sources set payload=jsonb_set(payload,'{raw,descShort}',to_jsonb((select description from events where id=event_id))) where id=(select s from fixture_ids where n=19);
update event_sources set payload=jsonb_set(payload,'{raw,descShort}','"Different supplied source copy"') where id=(select s from fixture_ids where n=20);
insert into event_sources select gen_random_uuid(),event_id,'other','other','https://example.com/other',repeat('b',64),
 '{"raw":{"description":"A much richer and different source description that is not yet represented in the native event."}}',now()
from event_sources where id=(select s from fixture_ids where n=21);
update event_quality_issues set evidence='{"length":21}' where id=(select i from fixture_ids where n=22);
update event_sources set payload_hash='bad hash' where id=(select s from fixture_ids where n=23);
update events set duplicate_of_id=gen_random_uuid() where id=(select e from fixture_ids where n=24);
update events set status='cancelled' where id=(select e from fixture_ids where n=25);
update event_sources set payload=jsonb_set(payload#-'{raw,descShort}','{raw,description}',to_jsonb((select description from events where id=event_id))) where id=(select s from fixture_ids where n=26);
update event_sources set payload=jsonb_set(payload,'{raw,description}',to_jsonb((select description from events where id=event_id))) where id=(select s from fixture_ids where n=27);
update event_quality_issues set detector='custom-editorial-review' where id=(select i from fixture_ids where n=28);
update events set description='Please accept cookies before reading' where id=(select e from fixture_ids where n=29);
update event_sources set payload=jsonb_set(payload,'{raw,descShort}',to_jsonb((select description from events where id=event_id))) where id=(select s from fixture_ids where n=29);
update event_sources set payload=payload#-'{raw,descShort}' where id=(select s from fixture_ids where n=30);
insert into event_sources select gen_random_uuid(),event_id,source_slug,source_entity_id,source_url,payload_hash,payload,last_seen_at from event_sources where id=(select s from fixture_ids where n=31);
update events set status='archived' where id=(select e from fixture_ids where n=32);
insert into event_sources select gen_random_uuid(),event_id,'other','other','https://example.com/other',repeat('b',64),
 '{"raw":{"descShort":"Different source information"}}',now() from event_sources where id=(select s from fixture_ids where n=33);
update event_sources set payload=jsonb_set(payload,'{raw,description}','"Additional short source information"') where id=(select s from fixture_ids where n=34);
update event_quality_issues set reviewed_at=now(),resolution='auto-source-brevity:invalidated:v1 {"reason":"source changed"}' where id=(select i from fixture_ids where n=35);
update event_sources set payload=jsonb_set(payload,'{raw,descShort}','"Programme  complet : DJ A et DJ B, edition 36"') where id=(select s from fixture_ids where n=36);

do $test$
declare r jsonb;before_data text;after_data text;
begin
 assert not has_function_privilege('anon','reconcile_historical_event_brevity(integer,boolean)','execute');
 assert not has_function_privilege('authenticated','reconcile_historical_event_brevity(integer,boolean)','execute');
 assert has_function_privilege('service_role','reconcile_historical_event_brevity(integer,boolean)','execute');
 select md5(jsonb_agg(to_jsonb(e) order by id)::text) into before_data from events e;
 r:=reconcile_historical_event_brevity(1000,true);assert (r->>'candidates')::int=5,r::text;
 assert not exists(select 1 from event_quality_issues where status='accepted'),'Dry run changed state';
 r:=reconcile_historical_event_brevity(0,false);assert (r->>'accepted')::int=0;
 r:=reconcile_historical_event_brevity(1,false);assert (r->>'accepted')::int=1;
 r:=run_event_quality_repairs(1000,false);assert (r#>>'{source_brevity,accepted}')::int=4,r::text;
 select md5(jsonb_agg(to_jsonb(e) order by id)::text) into after_data from events e;
 assert before_data=after_data,'Event content, metadata or scores changed';
 assert not exists(select 1 from event_quality_current where overall_score<>42),'Current scores changed';
 assert (select count(*) from event_quality_issues where status='accepted')=5;
 assert not exists(select 1 from event_quality_issues i join fixture_ids f on f.i=i.id where i.status='accepted' and f.n not in(1,26,27,31,35));
 assert not exists(select 1 from event_quality_issues where status='accepted' and (reviewed_by is not null or resolution not like 'auto-source-brevity:v1 %'));
 assert not exists(select 1 from event_quality_issues where issue_code='IMAGE_MISSING' and status<>'open');
 assert not exists(select 1 from event_quality_current where not('IMAGE_MISSING'=any(open_issue_codes)));
 assert not exists(select 1 from event_quality_issues i join fixture_ids f on f.i=i.id where evidence_hash<>'original-hash-'||f.n);
 r:=reconcile_historical_event_brevity(1000,false);assert (r->>'accepted')::int=0,'Not idempotent';
 -- Asset-only source updates preserve the accepted text outcome.
 update event_sources set payload=jsonb_set(payload,'{raw,assets}','[]'),payload_hash=repeat('c',64) where id=(select s from fixture_ids where n=1);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=1))='accepted';
 -- Richer/different source text reopens the question immediately.
 update event_sources set payload=jsonb_set(payload,'{raw,descShort}','"Programme enrichi : DJ C et DJ D, informations supplementaires"') where id=(select s from fixture_ids where n=1);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=1))='open';
 assert (select resolution like 'auto-source-brevity:invalidated:v1 %' from event_quality_issues where id=(select i from fixture_ids where n=1));
 assert (select 'DESCRIPTION_THIN'=any(open_issue_codes) from event_quality_current where event_id=(select e from fixture_ids where n=1));
 r:=reconcile_historical_event_brevity(1000,false);assert (r->>'accepted')::int=0,'Incomplete updated source was accepted';
 -- Once actual native copy and detector evidence catch up, the rule can apply again.
 update events e set description=s.payload#>>'{raw,descShort}' from event_sources s where e.id=s.event_id and s.id=(select s from fixture_ids where n=1);
 update event_quality_issues i set evidence=jsonb_build_object('length',length(btrim(e.description))) from events e where i.event_id=e.id and i.id=(select i from fixture_ids where n=1);
 r:=reconcile_historical_event_brevity(1000,false);assert (r->>'accepted')::int=1;
 -- A removed primary source or newly supplied richer alternative invalidates acceptance.
 delete from event_sources where id=(select s from fixture_ids where n=26);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=26))='open';
 insert into event_sources(id,event_id,source_slug,payload) select gen_random_uuid(),e,'alternative',
 '{"raw":{"description":"Additional source information not represented by the previous short native copy."}}' from fixture_ids where n=27;
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=27))='open';
 r:=reconcile_historical_event_brevity(1000,false);assert (r->>'accepted')::int=0;
 -- Human decisions remain owned by their reviewer, even if their note retains the policy prefix.
 update event_quality_issues set status='accepted',reviewed_by=gen_random_uuid(),resolution='auto-source-brevity:v1 human-owned note' where id=(select i from fixture_ids where n=5);
 update event_sources set payload=jsonb_set(payload,'{raw,descShort}','"Changed human-reviewed source"') where id=(select s from fixture_ids where n=5);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=5))='accepted';
 update events set title='Different occurrence title' where id=(select e from fixture_ids where n=31);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=31))='open';
 r:=reconcile_historical_event_brevity(1000,false);assert (r->>'accepted')::int=0;
end $test$;

-- Missing historical copy has its own, stricter full-calendar-schema contract.
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(37,62) n;
insert into events(id,title,external_id,description,start_date,end_date)
select e,'Archive event '||n,'event-'||n,null,now()-interval '90 days',now()-interval '90 days'+interval '1 hour'
from fixture_ids where n>=37;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
select f.s,e.id,'agendaq',e.external_id,'https://www.agendaq.fr/fr/agenda/'||e.external_id,repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object('name',e.title,'slug',e.external_id,'start',e.start_date,'end',e.end_date,
 'updatedOn',now(),'dates',jsonb_build_array(jsonb_build_array('cal',jsonb_build_object('start',e.start_date))),
 'data',jsonb_build_object('currency','EUR')))
from events e join fixture_ids f on f.e=e.id where f.n>=37;
insert into event_quality_issues(id,event_id,issue_code,severity,evidence,evidence_hash,detected_at)
select i,e,'DESCRIPTION_MISSING','high','{}','missing-hash-'||n,now()+n*interval '1 second' from fixture_ids where n>=37;
insert into event_quality_issues(event_id,issue_code,evidence,evidence_hash,detected_at)
select e,'IMAGE_MISSING','{}','image-hash',now() from fixture_ids where n>=37;
insert into event_quality_current(event_id,open_issue_codes) select e,array['DESCRIPTION_MISSING','IMAGE_MISSING'] from fixture_ids where n>=37;
update event_sources set payload=jsonb_set(payload,'{raw,description}','"Real supplied narrative that needs extraction"') where id=(select s from fixture_ids where n=38);
update event_sources set payload=jsonb_set(payload,'{raw,descShort}','"Available short source text"') where id=(select s from fixture_ids where n=39);
update event_sources set payload=jsonb_set(payload,'{raw,data,body}','"Unknown new narrative field"') where id=(select s from fixture_ids where n=40);
update event_sources set payload=jsonb_set(payload,'{raw,article}','"Unknown new root narrative field"') where id=(select s from fixture_ids where n=41);
update event_sources set payload=jsonb_set(payload,'{raw,dates}','{}') where id=(select s from fixture_ids where n=42);
update event_sources set payload=jsonb_set(payload,'{raw,dates}','[]') where id=(select s from fixture_ids where n=43);
update event_sources set payload=jsonb_set(payload,'{raw,data}','[]') where id=(select s from fixture_ids where n=44);
update event_sources set payload=jsonb_set(payload,'{raw,updatedOn}','"invalid"') where id=(select s from fixture_ids where n=45);
update events set description='Existing copy' where id=(select e from fixture_ids where n=46);
insert into event_sources(id,event_id,source_slug,payload) select gen_random_uuid(),e,'other',
 '{"raw":{"jsonLd":{"description":"A fuller alternate source narrative already exists."}}}' from fixture_ids where n=47;
insert into event_sources select gen_random_uuid(),event_id,source_slug,source_entity_id,source_url,payload_hash,payload,last_seen_at
from event_sources where id=(select s from fixture_ids where n=48);
update event_quality_issues set resolution='A human editorial question' where id=(select i from fixture_ids where n=49);
update event_quality_issues set reviewed_at=now() where id=(select i from fixture_ids where n=50);
update event_quality_issues set reviewed_by=gen_random_uuid() where id=(select i from fixture_ids where n=51);
update event_quality_issues set severity='critical' where id=(select i from fixture_ids where n=52);
update events set start_date=now()+interval '1 day',end_date=now()+interval '2 days' where id=(select e from fixture_ids where n=53);
update event_sources set source_url='https://example.com/unknown' where id=(select s from fixture_ids where n=54);
update event_sources set payload=jsonb_set(payload,'{raw,start}','"2020-01-01"') where id=(select s from fixture_ids where n=55);
update event_sources set payload=jsonb_set(payload,'{raw,description}','"  "') where id=(select s from fixture_ids where n=56);
update event_sources set payload=jsonb_set(payload,'{raw,description}','null') where id=(select s from fixture_ids where n=57);
update event_sources set payload='{"raw":[]}' where id=(select s from fixture_ids where n=58);
update events set status='archived' where id=(select e from fixture_ids where n=59);
update events set duplicate_of_id=gen_random_uuid() where id=(select e from fixture_ids where n=60);
insert into event_sources(id,event_id,source_slug,payload) select gen_random_uuid(),e,'unparsed-provider','{}' from fixture_ids where n=61;
update event_sources set payload=jsonb_set(payload,'{raw,data,newField}','""') where id=(select s from fixture_ids where n=62);

do $absence_test$
declare r jsonb;before_data text;after_data text;
begin
 assert not has_function_privilege('anon','reconcile_historical_event_copy_absence(integer,boolean)','execute');
 assert not has_function_privilege('authenticated','reconcile_historical_event_copy_absence(integer,boolean)','execute');
 assert has_function_privilege('service_role','reconcile_historical_event_copy_absence(integer,boolean)','execute');
 select md5(jsonb_agg(to_jsonb(e) order by id)::text) into before_data from events e;
 r:=reconcile_historical_event_copy_absence(1000,true);assert (r->>'candidates')::int=4,r::text;
 assert not exists(select 1 from event_quality_issues i join fixture_ids f on f.i=i.id where f.n>=37 and i.status='accepted');
 r:=reconcile_historical_event_copy_absence(0,false);assert (r->>'accepted')::int=0;
 r:=run_event_quality_repairs(1000,false);assert (r#>>'{source_copy_absence,accepted}')::int=4,r::text;
 select md5(jsonb_agg(to_jsonb(e) order by id)::text) into after_data from events e;
 assert before_data=after_data,'Source omission changed event data or scores';
 assert not exists(select 1 from event_quality_issues i join fixture_ids f on f.i=i.id where f.n>=37 and i.status='accepted' and f.n not in(37,48,56,57));
 assert not exists(select 1 from event_quality_issues i join fixture_ids f on f.i=i.id where f.n>=37 and i.status='accepted'
  and (i.reviewed_by is not null or i.resolution not like 'auto-source-copy-absence:v1 %'));
 assert not exists(select 1 from event_quality_current where overall_score<>42);
 r:=reconcile_historical_event_copy_absence(1000,false);assert (r->>'accepted')::int=0;
 update event_sources set payload=jsonb_set(payload,'{raw,assets}','[]') where id=(select s from fixture_ids where n=37);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=37))='accepted';
 update event_sources set payload=jsonb_set(payload,'{raw,description}','"New factual narrative now needs enrichment"') where id=(select s from fixture_ids where n=37);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=37))='open';
 assert (select resolution like 'auto-source-copy-absence:invalidated:v1 %' from event_quality_issues where id=(select i from fixture_ids where n=37));
 assert (select 'DESCRIPTION_MISSING'=any(open_issue_codes) from event_quality_current where event_id=(select e from fixture_ids where n=37));
 r:=reconcile_historical_event_copy_absence(1000,false);assert (r->>'accepted')::int=0,'New narrative was ignored';
 update event_sources set payload=payload#-'{raw,description}' where id=(select s from fixture_ids where n=37);
 r:=reconcile_historical_event_copy_absence(1000,false);assert (r->>'accepted')::int=1,'Own invalidated source outcome did not converge';
 insert into event_sources(id,event_id,source_slug,payload) select gen_random_uuid(),e,'other',
 '{"raw":{"description":"New alternative source text requiring enrichment"}}' from fixture_ids where n=56;
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=56))='open';
 r:=reconcile_historical_event_copy_absence(1000,false);assert (r->>'accepted')::int=0;
 update events set title='Changed occurrence identity' where id=(select e from fixture_ids where n=57);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=57))='open';
 assert not exists(select 1 from event_quality_issues where issue_code='IMAGE_MISSING' and status<>'open');
 assert not exists(select 1 from event_quality_current where not('IMAGE_MISSING'=any(open_issue_codes)));
end $absence_test$;

-- Unknown schema additions invalidate the prior absence proof atomically.
do $schema_change$
declare r jsonb;
begin
 update event_sources set payload=jsonb_set(payload,'{raw,data,article}','"New provider narrative field"') where id=(select s from fixture_ids where n=37);
 assert (select status from event_quality_issues where id=(select i from fixture_ids where n=37))='open';
 r:=reconcile_historical_event_copy_absence(1000,false);assert (r->>'accepted')::int=0,'Unknown schema silently reaccepted';
end $schema_change$;

-- Interactive admin repairs retain their existing behavior; automatic outcome
-- helpers remain internal-only even when called directly by an admin.
do $admin_compatibility$
declare r jsonb; helper text; rejected boolean;
begin
 perform set_config('test.actor',gen_random_uuid()::text,true);
 r:=run_event_quality_repairs(10,true);
 assert r->>'dry_run'='true' and r->>'candidates'='0' and r->>'changed'='0';
 assert r#>>'{source_brevity,reason}'='internal_source_outcomes_only';
 assert r#>>'{source_copy_absence,reason}'='internal_source_outcomes_only';
 foreach helper in array array['reconcile_historical_event_brevity','reconcile_historical_event_copy_absence'] loop
  rejected:=false;
  begin
   execute format('select %I(10,true)',helper);
  exception when raise_exception then
   assert sqlerrm='Automatic source outcomes require an internal actor';
   rejected:=true;
  end;
  assert rejected,'Direct admin source outcome unexpectedly allowed';
 end loop;
 perform set_config('test.actor','',true);
end $admin_compatibility$;
