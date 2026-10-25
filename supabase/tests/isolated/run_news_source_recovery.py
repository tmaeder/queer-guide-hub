#!/usr/bin/env python3
"""Exercise source recovery leases and unchanged publication gates in PostgreSQL."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create role anon;create role authenticated;create role service_role;
create schema api_private;create schema auth;create schema vault;
create function auth.uid()returns uuid language sql as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table ingestion_staging(id uuid primary key,normalized_data jsonb,enriched_data jsonb,target_table text default 'news_articles',
 disposition text default 'pending',review_status text default 'pending_review',reviewed_by uuid,reviewed_at timestamptz,
 enrichment_status text default 'enriched',dedup_status text default 'unique',created_at timestamptz default now(),updated_at timestamptz default now(),review_notes text);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table admin_automations(slug text,enabled boolean);insert into admin_automations values('review_automatic_resolution',true);
create table news_quality_settings(id int,enabled boolean);insert into news_quality_settings values(1,true);
create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('legacy_anon_key','fixture-anon'),('internal_invoke_secret','fixture-internal');
create table http_requests(id bigint generated always as identity,url text,headers jsonb,body jsonb,timeout_milliseconds int);
create function automation_http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int)returns bigint language sql as
 'insert into public.http_requests(url,headers,body,timeout_milliseconds)values($1,$2,$3,$4)returning id';
create function api_private.reconcile_publisher_event_copy(integer,boolean)returns jsonb language sql as 'select ''{"publisher_description_findings":0}''::jsonb';
create function api_private.run_review_automatic_resolution(p_batch int,p_dry_run boolean)returns jsonb language plpgsql as $body$
declare v_limit integer:=greatest(0,least(p_batch,500));
begin
 return api_private.reconcile_publisher_event_copy(v_limit,p_dry_run) || jsonb_build_object('dry_run',p_dry_run);
end $body$;
insert into ingestion_staging(id,normalized_data,enriched_data)
select md5(i::text)::uuid,jsonb_build_object('title','Community source','content','RSS summary','urls',jsonb_build_array('https://example.org/article')),
 '{"quality_status":"review","auto_publish":false,"auto_publish_blocked_reasons":["truncated_body"],
 "quality_input_version":"original","quality_attempts":1,"keep_existing":"yes","quality_decision":{"needsManualReview":false,
 "shouldPublish":true,"isRelevant":true,"isSatire":false,"isAdvertorial":false,"confidence":0.9,"relevanceScore":0.9,"qualityScoreAfter":0.9}}'::jsonb
from generate_series(1,22)i;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,needsManualReview}','true')where id=md5('2')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,confidence}','0.69')where id=md5('3')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{auto_publish_blocked_reasons}','["truncated_body","image_unusable"]')where id=md5('4')::uuid;
update ingestion_staging set reviewed_at=now()where id=md5('5')::uuid;
update ingestion_staging set disposition='inserted'where id=md5('6')::uuid;
update ingestion_staging set normalized_data=normalized_data||'{"extraction_meta":{"applied":false}}'where id=md5('7')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{auto_publish}','true')where id=md5('8')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_status}','"passed"')where id=md5('9')::uuid;
update ingestion_staging set enrichment_status='failed'where id=md5('10')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,confidence}','"0.9"')where id=md5('11')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,isSatire}','true')where id=md5('12')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,isRelevant}','false')where id=md5('13')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,shouldPublish}','false')where id=md5('14')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,qualityScoreAfter}','0.65')where id=md5('15')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,relevanceScore}','0.7')where id=md5('16')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,needsManualReview}','"false"')where id=md5('17')::uuid;
update ingestion_staging set target_table='venues'where id=md5('18')::uuid;
update ingestion_staging set dedup_status='duplicate'where id=md5('22')::uuid;
create table original_staging as select id,to_jsonb(s)value from ingestion_staging s;
"""
checks="""
do $check$
declare result jsonb;proposal jsonb;claim record;token uuid;old_token uuid;old_count int;
begin
 select count(*)into old_count from public.claim_review_news_source_recovery(100,true);
 if old_count<>4 or exists(select 1 from original_staging o join ingestion_staging s using(id)where o.value<>to_jsonb(s))then raise exception 'Dry claim wrote or exceeded its bound: %',old_count;end if;
 perform api_private.run_review_automatic_resolution(4,true);
 if exists(select 1 from http_requests)then raise exception 'Dry dispatcher sent a request';end if;
 perform api_private.run_review_automatic_resolution(0,false);
 if exists(select 1 from http_requests)then raise exception 'Zero batch sent a request';end if;
 update admin_automations set enabled=false;
 if exists(select 1 from public.claim_review_news_source_recovery(4,false))then raise exception 'Claim ignored pause';end if;
 perform api_private.run_review_automatic_resolution(4,false);
 if exists(select 1 from http_requests)then raise exception 'Dispatcher ignored pause';end if;
 update admin_automations set enabled=true;
 perform api_private.run_review_automatic_resolution(4,false);
 if(select count(*)from http_requests)<>1 or not exists(select 1 from http_requests where body='{"repair_truncated":true,"batch_size":4}'::jsonb)then raise exception 'Source request not bounded';end if;
 perform *from public.claim_review_news_source_recovery(100,false);
 if(select count(*)from ingestion_staging where enriched_data#>>'{review_source_text_recovery,status}'='running')<>4 then raise exception 'Claim bound wrong';end if;
 if exists(select 1 from public.claim_review_news_source_recovery(4,false))then raise exception 'Active lease was claimed twice';end if;
 if exists(select 1 from original_staging o join ingestion_staging s using(id)where o.value<>to_jsonb(s)and s.id not in(md5('1')::uuid,md5('19')::uuid,md5('20')::uuid,md5('21')::uuid))then raise exception 'A refused row changed';end if;
 select (enriched_data#>>'{review_source_text_recovery,lease_token}')::uuid,normalized_data into token,proposal from ingestion_staging where id=md5('1')::uuid;
 update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{content}','"A newer source capture"')where id=md5('1')::uuid;
 if(public.finish_review_news_source_recovery(md5('1')::uuid,token,proposal)->>'saved')<>'false'then raise exception 'Source fingerprint race overwritten';end if;
 update ingestion_staging set normalized_data=proposal where id=md5('1')::uuid;
 update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{keep_existing}','"A newer quality capture"')where id=md5('1')::uuid;
 if(public.finish_review_news_source_recovery(md5('1')::uuid,token,proposal)->>'saved')<>'false'then raise exception 'Quality fingerprint race overwritten';end if;
 update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{keep_existing}','"yes"')where id=md5('1')::uuid;
 proposal:=proposal||jsonb_build_object('content',repeat('Recovered source paragraph. ',30),'extraction_meta',
  jsonb_build_object('recovery_contract','news_source_text_recovery.v1','applied',true,'url','https://example.org/article',
   'page_title','Community source','matched_title','Community source','method','fixture'));
 begin
  perform public.finish_review_news_source_recovery(md5('1')::uuid,token,proposal||'{"title":"Unrelated"}');
  raise exception 'Immutable headline changed';
 exception when raise_exception then if sqlerrm='Immutable headline changed'then raise;end if;end;
 begin
  perform public.finish_review_news_source_recovery(md5('1')::uuid,token,jsonb_set(proposal,'{content}','"Still short"'));
  raise exception 'Short text passed';
 exception when raise_exception then if sqlerrm='Short text passed'then raise;end if;end;
 begin
  perform public.finish_review_news_source_recovery(md5('1')::uuid,token,jsonb_set(proposal,'{extraction_meta,matched_title}','"Wrong"'));
  raise exception 'Unconfirmed identity passed';
 exception when raise_exception then if sqlerrm='Unconfirmed identity passed'then raise;end if;end;
 result:=public.finish_review_news_source_recovery(md5('1')::uuid,token,proposal);
 if result<>'{"saved":true,"recovered":true}'::jsonb then raise exception 'Recovery failed %',result;end if;
 if not exists(select 1 from ingestion_staging where id=md5('1')::uuid and review_status='pending_review'and disposition='pending'
  and enriched_data->'quality_status'is null and enriched_data->'quality_decision'is null and enriched_data->'auto_publish'='false'::jsonb
  and enriched_data->>'keep_existing'='yes'and normalized_data->>'content'=repeat('Recovered source paragraph. ',30))then raise exception 'Fresh quality required gate was bypassed';end if;
 if(public.finish_review_news_source_recovery(md5('1')::uuid,token,proposal)->>'saved')<>'false'then raise exception 'Completion was not idempotent';end if;
 -- Human review wins even after a source worker claimed the old state.
 select(enriched_data#>>'{review_source_text_recovery,lease_token}')::uuid,normalized_data into token,proposal from ingestion_staging where id=md5('19')::uuid;
 update ingestion_staging set reviewed_at=now()where id=md5('19')::uuid;
 if(public.finish_review_news_source_recovery(md5('19')::uuid,token,proposal)->>'saved')<>'false'then raise exception 'Human race overwritten';end if;
 -- A real no-gain attempt retains the old quality verdict and source body.
 select(enriched_data#>>'{review_source_text_recovery,lease_token}')::uuid,normalized_data into token,proposal from ingestion_staging where id=md5('20')::uuid;
 proposal:=proposal||jsonb_build_object('extraction_meta',jsonb_build_object('recovery_contract','news_source_text_recovery.v1','applied',false,'url','https://example.org/article','method','fetch_failed'));
 begin
  perform public.finish_review_news_source_recovery(md5('20')::uuid,token,proposal||'{"markdown":"An unconfirmed replacement"}');
  raise exception 'Failed extraction replaced markdown';
 exception when raise_exception then if sqlerrm='Failed extraction replaced markdown'then raise;end if;end;
 result:=public.finish_review_news_source_recovery(md5('20')::uuid,token,proposal);
 if result<>'{"saved":true,"recovered":false}'::jsonb or not exists(select 1 from ingestion_staging where id=md5('20')::uuid
  and enriched_data->>'quality_status'='review'and enriched_data->'quality_decision'is not null and normalized_data->>'content'='RSS summary')then raise exception 'Failed fetch changed quality or body';end if;
 -- A crashed worker gets only one retry; an expired token cannot write.
 select(enriched_data#>>'{review_source_text_recovery,lease_token}')::uuid into old_token from ingestion_staging where id=md5('21')::uuid;
 update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{review_source_text_recovery,lease_expires_at}',to_jsonb(now()-interval '1 minute'))where id=md5('21')::uuid;
 select *into claim from public.claim_review_news_source_recovery(4,false);
 if claim.id<>md5('21')::uuid or claim.lease_token=old_token then raise exception 'Expired lease retry wrong';end if;
 if(public.finish_review_news_source_recovery(md5('21')::uuid,old_token,proposal)->>'saved')<>'false'then raise exception 'Expired worker overwrote retry';end if;
 update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{review_source_text_recovery,lease_expires_at}',to_jsonb(now()-interval '1 minute'))where id=md5('21')::uuid;
 if exists(select 1 from public.claim_review_news_source_recovery(4,false))then raise exception 'Lease retry cap ignored';end if;
 perform api_private.run_review_automatic_resolution(4,false);
 if not exists(select 1 from http_requests where url like '%pipeline-quality-enhance'and body='{"batch_size":4,"concurrency":4}'::jsonb)then raise exception 'Recovered text never reached native quality';end if;
 if(select count(*)from admin_review_repairs)<>2 or not exists(select 1 from admin_review_repairs where reason='news_source_text_recovered_for_fresh_quality'and previous_value#>>'{enriched_data,quality_status}'='review'and next_value#>'{enriched_data,quality_status}'is null)then raise exception 'Recovery audit incomplete';end if;
 if has_function_privilege('anon','public.claim_review_news_source_recovery(integer,boolean)','execute')
  or has_function_privilege('authenticated','public.finish_review_news_source_recovery(uuid,uuid,jsonb)','execute')then raise exception 'Browser execution granted';end if;
end $check$;
"""
paths=list((ROOT/'supabase/migrations').glob('*_review_news_source_text_recovery.sql'))
assert len(paths)==1
sql=schema+paths[0].read_text()+checks
with tempfile.TemporaryDirectory(prefix='qg-news-source-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55494 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55494','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: source eligibility, bounded claims, dry run, pause, leases, human race, immutable fields, fresh quality, no-gain, audit and permissions')
