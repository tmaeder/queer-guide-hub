#!/usr/bin/env python3
"""Test identical-source deduplication without approving or mutating news."""
import os,re
from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create role anon;create role authenticated;create role service_role;
create schema api_private;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create function auth.uid()returns uuid language sql as 'select null::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table admin_automations(slug text,enabled boolean);insert into admin_automations values('review_automatic_resolution',true);
create table content_revisions(source_table text,source_id uuid,actor_kind text);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table news_articles(id uuid primary key,url text unique,source_id uuid,published_at timestamptz,fingerprint text,
 content_hash text,media_type text default 'article',audio_url text,image_url text,duplicate_of_id uuid,
 quality_status text default 'passed',quality_decision jsonb,auto_publish_blocked_reasons text[]default '{}',
 content text default 'Keep cleaned catalogue body',title text default 'Cleaned headline',updated_at timestamptz default now(),
 archived_at timestamptz);
create table ingestion_staging(id uuid primary key,target_table text default 'news_articles',source_name text default 'rss-news',source_type text default 'rss-news',
 source_entity_id text,disposition text default 'pending',review_status text default 'pending_review',reviewed_by uuid,reviewed_at timestamptz,
 review_notes text,target_record_id uuid,dedup_status text default 'unique',dedup_match_id uuid,dedup_match_table text default 'news_articles',
 dedup_match_score numeric default 0,dedup_details jsonb default '{}',raw_data jsonb,normalized_data jsonb,enriched_data jsonb,
 created_at timestamptz default now(),updated_at timestamptz default now(),processed_at timestamptz);
create function news_compute_fingerprint(text,timestamptz,uuid,text)returns text language sql immutable as 'select md5($1||$2::text||$3::text||$4)';
create function api_private.run_review_automatic_resolution(p_batch integer,p_dry_run boolean)returns jsonb language plpgsql as $$
declare v_limit integer:=p_batch;begin return '{"source_event_formats":{}}'::jsonb||jsonb_build_object('dry_run',p_dry_run,'existing',1);end$$;
insert into news_articles(id,url,source_id,published_at,image_url,quality_decision)
 select md5(n::text)::uuid,'https://publisher.test/story-'||n,md5('source')::uuid,'2026-10-01T12:00:00Z','https://publisher.test/cover.jpg',
 '{"shouldPublish":true,"isRelevant":true,"isSatire":false,"isAdvertorial":false,"needsManualReview":false,"confidence":0.9,"relevanceScore":0.9,"qualityScoreAfter":0.8}'from generate_series(1,32)n;
update news_articles set fingerprint=news_compute_fingerprint('Original headline',published_at,source_id,url),content_hash=encode(extensions.digest(convert_to('Original publisher body with enough content','UTF8'),'sha256'),'hex');
insert into ingestion_staging(id,raw_data,normalized_data,enriched_data)
 select id,jsonb_build_object('url',url,'title','Original headline','source_id',source_id,'published_at',published_at,'content','Original publisher body with enough content','image_url',image_url),
 jsonb_build_object('name','Original headline','urls',jsonb_build_array(url),'content','Original publisher body with enough content',
 'metadata',jsonb_build_object('url',url,'source_id',source_id,'published_at',published_at)),
 jsonb_build_object('quality_status','review','auto_publish_blocked_reasons',jsonb_build_array('low_relevance'),
 'quality_decision',quality_decision)from news_articles;
update ingestion_staging set reviewed_by=md5('human')::uuid where id=md5('2')::uuid;
update ingestion_staging set review_notes='Human note'where id=md5('3')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,needsManualReview}','true')where id=md5('4')::uuid;
update ingestion_staging set enriched_data=enriched_data||'{"manual_hold":"TRUE"}'where id=md5('5')::uuid;
update ingestion_staging set dedup_details='{"manual_hold":true}'where id=md5('6')::uuid;
insert into content_revisions values('ingestion_staging',md5('7')::uuid,'human');
update news_articles set quality_status='rejected'where id=md5('8')::uuid;
update news_articles set quality_decision=jsonb_set(quality_decision,'{confidence}','0.5')where id=md5('9')::uuid;
update news_articles set auto_publish_blocked_reasons=array['manual_review_requested']where id=md5('10')::uuid;
update news_articles set duplicate_of_id=md5('1')::uuid where id=md5('11')::uuid;
update ingestion_staging set raw_data=jsonb_set(raw_data,'{content}','"New source content requires a new quality decision"')where id=md5('12')::uuid;
update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{content}','"Newly extracted source content must be retained for review"')where id=md5('13')::uuid;
update ingestion_staging set raw_data=jsonb_set(raw_data,'{title}','"Different headline"')where id=md5('14')::uuid;
update ingestion_staging set raw_data=jsonb_set(raw_data,'{source_id}','"bad"')where id=md5('15')::uuid;
update ingestion_staging set raw_data=jsonb_set(raw_data,'{published_at}','"bad"')where id=md5('16')::uuid;
update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{metadata,published_at}','"2026-10-02T12:00:00Z"')where id=md5('17')::uuid;
update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{urls}','["https://publisher.test/story-18","https://publisher.test/other"]')where id=md5('18')::uuid;
update ingestion_staging set raw_data=raw_data||'{"audio_url":"https://publisher.test/new.mp3"}'where id=md5('19')::uuid;
update ingestion_staging set raw_data=raw_data||'{"image_url":"https://publisher.test/new.jpg"}'where id=md5('20')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,isAdvertorial}','true')where id=md5('21')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{auto_publish_blocked_reasons}','["entity_links_pending_review"]')where id=md5('22')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,isSatire}','true')where id=md5('23')::uuid;
update ingestion_staging set target_record_id=md5('1')::uuid where id=md5('24')::uuid;
update ingestion_staging set dedup_status='merge_candidate',dedup_match_id=md5('1')::uuid where id=md5('25')::uuid;
update ingestion_staging set enriched_data=enriched_data||'{"manual_review_required":true}'where id=md5('26')::uuid;
update ingestion_staging set dedup_match_score=0.5 where id=md5('27')::uuid;
update ingestion_staging set review_status='approved'where id=md5('28')::uuid;
update ingestion_staging set dedup_details='[]'where id=md5('29')::uuid;
update news_articles set quality_decision=jsonb_set(quality_decision,'{needsManualReview}','true')where id=md5('30')::uuid;
update ingestion_staging set dedup_match_table='events'where id=md5('31')::uuid;
update ingestion_staging set enriched_data=enriched_data||'{"review_source_text_recovery":{"status":"running"}}'where id=md5('32')::uuid;
create table before_stages as select id,to_jsonb(s)value from ingestion_staging s;
create table before_articles as select id,to_jsonb(n)value from news_articles n;
"""
checks="""
do $$declare r jsonb;begin
 r:=api_private.reconcile_exact_news_source_duplicates(100,true);if(r->>'duplicate_sources')::int<>1 then raise exception 'Wrong dry candidates %',r;end if;
 if exists(select 1 from admin_review_repairs)or exists(select 1 from ingestion_staging s join before_stages b using(id)where to_jsonb(s)<>b.value)then raise exception 'Dry wrote';end if;
 r:=api_private.reconcile_exact_news_source_duplicates(0,false);if(r->>'duplicate_sources')::int<>0 then raise exception 'Zero batch';end if;
 update admin_automations set enabled=false;r:=api_private.reconcile_exact_news_source_duplicates(100,false);if r->>'skipped'<>'paused'then raise exception 'Pause';end if;update admin_automations set enabled=true;
 if has_function_privilege('authenticated','api_private.reconcile_exact_news_source_duplicates(integer,boolean)','execute')then raise exception 'Browser access';end if;
 r:=api_private.run_review_automatic_resolution(100,false);if(r#>>'{exact_news_source_duplicates,duplicate_sources}')::int<>1 or not(r?'source_event_formats')then raise exception 'Hook composition %',r;end if;
 if exists(select 1 from before_articles b join news_articles n using(id)where b.value<>to_jsonb(n))then raise exception 'Catalogue changed';end if;
 if exists(select 1 from before_stages b join ingestion_staging s using(id)where s.id<>md5('1')::uuid and b.value<>to_jsonb(s))then raise exception 'Refused source changed';end if;
 if not exists(select 1 from ingestion_staging where id=md5('1')::uuid and disposition='skipped'and review_status='pending_review'and dedup_status='duplicate'and target_record_id=id and reviewed_by is null and reviewed_at is null and enriched_data=(select value->'enriched_data'from before_stages where id=md5('1')::uuid))then raise exception 'Wrong disposition or verdict mutation';end if;
 if(select count(*)from admin_review_repairs)<>1 then raise exception 'Audit missing';end if;
 r:=api_private.reconcile_exact_news_source_duplicates(100,false);if(r->>'duplicate_sources')::int<>0 or(select count(*)from admin_review_repairs)<>1 then raise exception 'Not idempotent';end if;
end$$;
"""
repeat_checks="""
insert into news_articles(id,url,source_id)
 values(md5('sentidog article')::uuid,'https://www.sentidog.com/2026/10/14/story',md5('source')::uuid);
insert into ingestion_staging(id,source_entity_id,raw_data,enriched_data)
 select md5('sentidog '||n)::uuid,url,
  jsonb_build_object('url',url,'title','Headline','source_id',md5('source')::uuid,
   'content','This is a complete original RSS capture of more than fifty characters.'),
  '{"auto_publish_blocked_reasons":["manual_review_requested","low_confidence"],
    "quality_decision":{"isAdvertorial":false,"isSatire":false,"needsManualReview":true,"warnings":[]}}'
 from generate_series(14,21)n
 cross join lateral (select 'https://www.sentidog.com/2026/10/'||n||'/story' as url) x;
update ingestion_staging set disposition='inserted',review_status='auto',target_record_id=md5('sentidog article')::uuid
 where id=md5('sentidog 14')::uuid;
update ingestion_staging set enriched_data=enriched_data||'{"manual_hold":true}' where id=md5('sentidog 16')::uuid;
update ingestion_staging set raw_data=jsonb_set(raw_data,'{content}','"Different body with more than fifty characters of unique material."')
 where id=md5('sentidog 17')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_decision,warnings}','["Potential paywall"]')
 where id=md5('sentidog 18')::uuid;
insert into content_revisions values('ingestion_staging',md5('sentidog 19')::uuid,'human');
update ingestion_staging set dedup_status='merge_candidate',dedup_match_id=md5('sentidog article')::uuid where id=md5('sentidog 20')::uuid;
update ingestion_staging set dedup_status='merge_candidate',dedup_match_id=md5('other article')::uuid where id=md5('sentidog 21')::uuid;
insert into ingestion_staging(id,source_entity_id,raw_data,enriched_data,disposition,review_status,target_record_id)
 select md5('repeat ambiguity '||n)::uuid,url,
  jsonb_set(jsonb_set(raw_data,'{url}',to_jsonb(url)),'{content}',to_jsonb('Another complete original RSS capture of more than fifty characters.'::text)),
  enriched_data,case when n=24 then 'pending' else 'inserted' end,
  case when n=24 then 'pending_review' else 'auto' end,
  case when n=24 then null else md5('sentidog article')::uuid end
 from ingestion_staging cross join generate_series(22,24)n
 cross join lateral (select 'https://www.sentidog.com/2026/10/'||n||'/ambiguous' as url) x
 where id=md5('sentidog 15')::uuid;
create table repeat_before_stages as select id,to_jsonb(s) value from ingestion_staging s;
create table repeat_before_articles as select id,to_jsonb(a) value from news_articles a;
do $$declare r jsonb;begin
 r:=api_private.run_review_automatic_resolution(100,true);
 if (r#>>'{sentidog_repeat_captures,duplicate_sources}')::int<>2 or not(r?'exact_news_source_duplicates')
 then raise exception 'Wrong dry candidates or hook composition %',r;end if;
 if exists(select 1 from ingestion_staging s join repeat_before_stages b using(id) where to_jsonb(s)<>b.value)
 then raise exception 'Repeat dry run wrote';end if;
 if has_function_privilege('authenticated','api_private.reconcile_sentidog_repeat_captures(integer,boolean)','execute')
 then raise exception 'Repeat function browser access';end if;
 r:=api_private.run_review_automatic_resolution(100,false);
 if (r#>>'{sentidog_repeat_captures,duplicate_sources}')::int<>2 then raise exception 'Repeat apply %',r;end if;
 if (select count(*) from ingestion_staging s join repeat_before_stages b using(id)
  where s.id in(md5('sentidog 15')::uuid,md5('sentidog 20')::uuid)
   and s.disposition='skipped' and s.dedup_status='duplicate' and s.dedup_match_id=md5('sentidog article')::uuid
   and s.enriched_data=b.value->'enriched_data' and s.raw_data=b.value->'raw_data')<>2
 then raise exception 'Repeat disposition or evidence incorrect';end if;
 if exists(select 1 from ingestion_staging s join repeat_before_stages b using(id)
  where s.id not in(md5('sentidog 15')::uuid,md5('sentidog 20')::uuid) and to_jsonb(s)<>b.value)
 then raise exception 'Ineligible repeat changed';end if;
 if exists(select 1 from news_articles a join repeat_before_articles b using(id) where to_jsonb(a)<>b.value)
 then raise exception 'Repeat repair changed catalogue';end if;
 if (select count(*) from admin_review_repairs where reason='sentidog_exact_date_path_duplicate:v3')<>2
 then raise exception 'Repeat audit missing';end if;
 r:=api_private.reconcile_sentidog_repeat_captures(100,false);
 if (r->>'duplicate_sources')::int<>0 then raise exception 'Repeat repair not idempotent';end if;
end$$;
"""
repeat_migration=ROOT/'supabase/migrations/99991793933500_review_sentidog_repeat_captures.sql'
podcast_checks="""
insert into news_articles(id,url,source_id,published_at,image_url,quality_decision,media_type,audio_url)
 select md5('podcast-'||n)::uuid,'https://publisher.test/episode-'||n,source_id,published_at,image_url,
 quality_decision,'podcast','https://publisher.test/enclosure-'||n||'.mp3'
 from news_articles cross join generate_series(1,6)n where id=md5('1')::uuid;
update news_articles set fingerprint=news_compute_fingerprint('Publisher episode',published_at,source_id,url),
 content_hash=encode(extensions.digest(convert_to('Original episode notes with enough content','UTF8'),'sha256'),'hex')
 where media_type='podcast';
insert into ingestion_staging(id,raw_data,normalized_data,enriched_data)
 select id,jsonb_build_object('url',url,'title','Publisher episode','source_id',source_id,'published_at',published_at,
 'content','Original episode notes with enough content','image_url',image_url,'media_type','podcast','audio_url',audio_url),
 jsonb_build_object('name','Publisher episode','urls',jsonb_build_array(url),'description','Original episode notes with enough content',
 'metadata',jsonb_build_object('url',url,'source_id',source_id,'published_at',published_at,'media_type','podcast','audio_url',audio_url)),
 jsonb_build_object('quality_status','review','auto_publish_blocked_reasons',jsonb_build_array('low_relevance','manual_review_requested'),
 'quality_decision',quality_decision||'{"needsManualReview":true,"isRelevant":false,"shouldPublish":false}'::jsonb)
 from news_articles where media_type='podcast';
update ingestion_staging set enriched_data=enriched_data||'{"manual_hold":true}'where id=md5('podcast-2')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{auto_publish_blocked_reasons}',
 '["low_relevance","manual_review_requested","entity_links_pending_review"]')where id=md5('podcast-3')::uuid;
update ingestion_staging set raw_data=jsonb_set(raw_data,'{audio_url}','"https://publisher.test/changed.mp3"')where id=md5('podcast-4')::uuid;
update ingestion_staging set normalized_data=normalized_data||'{"content":"New publisher notes require a separate verdict."}'
 where id=md5('podcast-5')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{auto_publish_blocked_reasons}',
 '["manual_review_requested"]')where id=md5('podcast-6')::uuid;
create table before_podcasts as select id,to_jsonb(n)value from news_articles n where media_type='podcast';
create table before_podcast_stages as select s.id,to_jsonb(s)value from ingestion_staging s join before_podcasts p using(id);
do $$
declare r jsonb;
begin
 r:=api_private.reconcile_exact_news_source_duplicates(100,true);
 if r->'staging_ids'<>jsonb_build_array(md5('podcast-1')::uuid) then raise exception 'Wrong podcast candidates %',r;end if;
 r:=api_private.run_review_automatic_resolution(100,false);
 if r#>'{exact_news_source_duplicates,staging_ids}'<>jsonb_build_array(md5('podcast-1')::uuid)
 then raise exception 'Wrong automatic podcast disposition %',r;end if;
 if exists(select 1 from before_podcasts b join news_articles n using(id)where b.value<>to_jsonb(n))
 then raise exception 'Published episode changed';end if;
 if exists(select 1 from before_podcast_stages b join ingestion_staging s using(id)
  where s.id<>md5('podcast-1')::uuid and b.value<>to_jsonb(s))
 then raise exception 'Refused podcast capture changed';end if;
 if not exists(select 1 from ingestion_staging s join before_podcast_stages b using(id)
  where s.id=md5('podcast-1')::uuid and s.disposition='skipped' and s.review_status='pending_review'
   and s.dedup_status='duplicate' and s.reviewed_by is null and s.enriched_data=b.value->'enriched_data')
 then raise exception 'Podcast verdict changed or duplicate was not cleared';end if;
 r:=api_private.reconcile_exact_news_source_duplicates(100,false);
 if (r->>'duplicate_sources')::integer<>0 then raise exception 'Podcast disposition was not idempotent';end if;
end $$;
"""
technical_checks="""
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{auto_publish_blocked_reasons}',
 '["truncated_body","image_unusable"]') where id in (md5('podcast-2')::uuid,md5('podcast-3')::uuid,md5('podcast-6')::uuid);
update news_articles set auto_publish_blocked_reasons=array['truncated_body'] where id=md5('podcast-6')::uuid;
update news_articles set archived_at=now() where id=md5('podcast-3')::uuid;
create table technical_before_articles as select id,to_jsonb(n)value from news_articles n where media_type='podcast';
create table technical_before_stages as select s.id,to_jsonb(s)value from ingestion_staging s join technical_before_articles p using(id);
do $$
declare r jsonb;
begin
 r:=api_private.reconcile_exact_news_source_duplicates(100,true);
 if r->'staging_ids'<>jsonb_build_array(md5('podcast-6')::uuid)
 then raise exception 'Technical duplicate candidates %',r;end if;
 r:=api_private.run_review_automatic_resolution(100,false);
 if r#>'{exact_news_source_duplicates,staging_ids}'<>jsonb_build_array(md5('podcast-6')::uuid)
 then raise exception 'Technical duplicate disposition %',r;end if;
 if exists(select 1 from technical_before_articles b join news_articles n using(id) where b.value<>to_jsonb(n))
 then raise exception 'Canonical episode or its flags changed';end if;
 if exists(select 1 from technical_before_stages b join ingestion_staging s using(id)
  where s.id<>md5('podcast-6')::uuid and b.value<>to_jsonb(s))
 then raise exception 'Protected or changed capture was modified';end if;
end $$;
"""
policy=(ROOT/'supabase/migrations/20261022180826_review_automatic_resolution.sql').read_text()
policy=re.search(r'create function api_private.review_news_machine_outcome[\s\S]*?end \$\$;',policy).group(0)
paths=list((ROOT/'supabase/migrations').glob('*_review_exact_news_source_duplicates.sql'));assert len(paths)==1
podcast_migration=ROOT/'supabase/migrations/99991793933580_review_exact_podcast_source_replays.sql'
technical_migration=ROOT/'supabase/migrations/99991794050184_review_podcast_technical_replays.sql'
with tempfile.TemporaryDirectory(prefix='qg-news-source-dedup-')as tmp:
 data=Path(tmp)/'data';subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55499 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  result=subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55499','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+policy+paths[0].read_text()+checks+repeat_migration.read_text()+repeat_checks+podcast_migration.read_text()+podcast_checks+technical_migration.read_text()+technical_checks,text=True,capture_output=True)
  if result.returncode:raise RuntimeError(result.stderr)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: source and editorial protections, scheduled duplicate cleanup, audit history and unchanged catalogue')
