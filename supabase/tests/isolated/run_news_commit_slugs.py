#!/usr/bin/env python3
"""Run the native news committer against multilingual slugs and unchanged gates."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else Path(shutil.which('pg_ctl') or '/missing').parent
source = (ROOT/'supabase/migrations/20261216114700_news_commit_requires_a_verdict.sql').read_text()
native = re.search(r'CREATE OR REPLACE FUNCTION public.news_commit_staging_batch[\s\S]*?\$function\$;', source).group()
patches = list((ROOT/'supabase/migrations').glob('*_news_commit_valid_nonlatin_slugs.sql'))
assert len(patches) == 1
patch = patches[0].read_text()
schema = r"""
create schema extensions;create extension pgcrypto with schema extensions;
create role anon;create role authenticated;create role service_role;
create table ingestion_staging(id uuid primary key,job_id uuid,target_table text default 'news_articles',disposition text default 'pending',
 dedup_status text,ai_validation_status text,review_status text default 'auto',enrichment_status text,created_at timestamptz default now(),
 normalized_data jsonb,enriched_data jsonb,raw_data jsonb,source_name text,target_record_id uuid,processed_at timestamptz,error_message text);
create table news_quality_settings(id integer,enabled boolean);insert into news_quality_settings values(1,true);
create table news_articles(id uuid primary key default gen_random_uuid(),source_id uuid,title text,content text,excerpt text,url text,image_url text,
 image_attribution text,image_hash text,author text,published_at timestamptz,category text,tags text[],country_ids uuid[],city_ids uuid[],content_language text,
 media_type text,audio_url text,duration_seconds integer,fingerprint text,content_hash text,ingestion_run_id uuid,ingestion_staging_id uuid,
 slug text check(slug is null or slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' or slug ~ '^[a-z0-9]$'),publisher_name text,
 first_seen_at timestamptz,last_seen_at timestamptz,seen_count integer,quality_status text,relevance_score numeric,quality_score numeric,
 quality_score_before numeric,sentiment text,quality_decision jsonb,quality_pipeline_version text,last_quality_run_at timestamptz,
 auto_publish_blocked_reasons text[],updated_at timestamptz);
create table news_article_countries(article_id uuid,country_id uuid,unique(article_id,country_id));
create table news_article_cities(article_id uuid,city_id uuid,unique(article_id,city_id));
create table entity_link_review(article_id uuid,entity_type text,candidate_name text,score numeric,context_snippet text);
create function news_compute_fingerprint(text,timestamptz,uuid,text)returns text language sql immutable as 'select md5($1||$4)';
insert into ingestion_staging(id,job_id,normalized_data,enriched_data)
select md5(i::text)::uuid,md5('job')::uuid,jsonb_build_object('title',title,'source_id',md5('source')::uuid,
 'url','https://publisher.test/'||i,'content','Preserve publisher text','published_at','2026-11-01T12:00:00Z'),
 '{"quality_status":"passed","auto_publish":true,"auto_publish_blocked_reasons":[],"quality_decision":{"needsManualReview":false,"isRelevant":true,"isSatire":false,"isAdvertorial":false,"confidence":0.9,"relevanceScore":0.9,"qualityScoreAfter":0.9}}'::jsonb
from (values(1,'English headline'),(2,'Википедию оштрафовали'),(3,'Δικαστήριο ακύρωσε νόμο'),(4,'සමරිසි සබඳතා නීතිගත වෙයි'),
 (5,'新聞報道'),(6,'Invalid supplied slug'),(7,'Valid supplied slug'),(8,'...'),(9,'Held review'),(10,'Quality review'),(11,'Unjudged'))v(i,title);
update ingestion_staging set normalized_data=normalized_data||'{"slug":"-bad-source-slug"}'where id=md5('6')::uuid;
update ingestion_staging set normalized_data=normalized_data||'{"slug":"keep-this-slug"}'where id=md5('7')::uuid;
update ingestion_staging set review_status='pending_review'where id=md5('9')::uuid;
update ingestion_staging set enriched_data=jsonb_set(enriched_data,'{quality_status}','"review"')where id=md5('10')::uuid;
update ingestion_staging set enriched_data='{}'where id=md5('11')::uuid;
create table staged_before as select id,to_jsonb(s)value from ingestion_staging s;
"""
before = r"""
revoke all on function news_commit_staging_batch(uuid,uuid,integer)from public,anon,authenticated;
grant execute on function news_commit_staging_batch(uuid,uuid,integer)to service_role;
create table security_before as select proowner,proacl,proconfig,prosecdef from pg_proc where oid='news_commit_staging_batch(uuid,uuid,integer)'::regprocedure;
begin;
do $$declare r record;begin
 select * into r from news_commit_staging_batch(md5('job')::uuid,null,50);
 if r.errors<>6 then raise exception 'Expected six original slug failures, got %',to_jsonb(r);end if;
end$$;
rollback;
"""
checks = r"""
do $$declare r record;begin
 select * into r from news_commit_staging_batch(md5('job')::uuid,null,50);
 if r.errors<>0 or r.inserted<>8 or jsonb_array_length(r.details)<>8 then raise exception 'Multilingual commit failed: %',to_jsonb(r);end if;
 if exists(select 1 from news_articles where title in('Википедию оштрафовали','Δικαστήριο ακύρωσε νόμο','සමරිසි සබඳතා නීතිගත වෙයි','新聞報道','...')and slug not like 'article-%')then raise exception 'Empty ASCII stem not handled';end if;
 if(select slug from news_articles where title='Valid supplied slug')<>'keep-this-slug'then raise exception 'Valid supplied slug changed';end if;
 if(select slug from news_articles where title='English headline')is distinct from 'english-headline-'||left(md5('English headlinehttps://publisher.test/1'),8)then raise exception 'ASCII slug changed';end if;
 if exists(select 1 from news_articles where content<>'Preserve publisher text')then raise exception 'Publisher content changed';end if;
 if exists(select 1 from staged_before b join ingestion_staging s using(id)where b.id in(md5('9')::uuid,md5('10')::uuid,md5('11')::uuid)and b.value is distinct from to_jsonb(s))then raise exception 'Review or verdict gate bypassed';end if;
 if exists((select proowner,proacl,proconfig,prosecdef from pg_proc where oid='news_commit_staging_batch(uuid,uuid,integer)'::regprocedure except select * from security_before))then raise exception 'Commit security changed';end if;
 select * into r from news_commit_staging_batch(md5('job')::uuid,null,50);
 if r.inserted<>0 or r.updated<>0 or r.errors<>0 or(select count(*)from news_articles)<>8 then raise exception 'Repeated commit changed data';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-news-slugs-') as tmp:
    data = str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55491 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55491','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+native+before+patch+patch+checks,text=True,check=True)
        print('PASS: six original slug failures reproduced; eight native commits pass; valid/ASCII slugs and source content preserved; review/verdict gates and security unchanged; idempotent')
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
