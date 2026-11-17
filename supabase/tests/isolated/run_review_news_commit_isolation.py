#!/usr/bin/env python3
"""Exercise native row errors alongside successful Review work and publication gates."""
import ast
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else Path(shutil.which('pg_ctl') or '/missing').parent
MIGRATIONS = ROOT/'supabase/migrations'
tree = ast.parse((Path(__file__).parent/'run_news_commit_slugs.py').read_text())
schema = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name)and t.id=='schema'for t in n.targets))
source = (MIGRATIONS/'20261216114700_news_commit_requires_a_verdict.sql').read_text()
native = re.search(r'CREATE OR REPLACE FUNCTION public.news_commit_staging_batch[\s\S]*?\$function\$;',source).group()
source = (MIGRATIONS/'20261022180826_review_automatic_resolution.sql').read_text()
policy = re.search(r'create function api_private.review_news_machine_outcome[\s\S]*?end \$\$;',source).group()
reconciler = re.search(r'create function api_private.run_review_automatic_resolution[\s\S]*?end \$\$;',source).group()
slug_patch = next(MIGRATIONS.glob('*_news_commit_valid_nonlatin_slugs.sql')).read_text()
patch = next(MIGRATIONS.glob('*_isolate_review_news_commit_errors.sql')).read_text()
schema += r"""
create schema api_private;
alter table ingestion_staging add review_notes text,add reviewed_by uuid,add reviewed_at timestamptz,add updated_at timestamptz;
update ingestion_staging set review_status='pending_review'where id in(select md5(i::text)::uuid from generate_series(1,9)i);
update ingestion_staging set normalized_data=jsonb_set(normalized_data,'{title}','"Poison row"')where id=md5('2')::uuid;
update ingestion_staging set enriched_data=enriched_data||jsonb_build_object('city_ids',jsonb_build_array(md5('missing-city')::uuid))where id=md5('3')::uuid;
insert into ingestion_staging select md5('human')::uuid,job_id,target_table,disposition,dedup_status,ai_validation_status,'pending_review',enrichment_status,
 created_at,normalized_data||'{"title":"Human held"}',enriched_data,raw_data,source_name,target_record_id,processed_at,error_message,
 'Keep human note',md5('staff')::uuid,now(),updated_at from ingestion_staging where id=md5('9')::uuid;
update ingestion_staging set source_name='rss-news';
create table cities(id uuid primary key,shell_status text,seo_indexable boolean,duplicate_of_id uuid);
alter table news_article_cities add foreign key(city_id)references cities(id);
create function poison_article()returns trigger language plpgsql as $$begin
 if new.title='Poison row'then raise check_violation using message='fixture article refusal';end if;return new;
end$$;
create trigger poison before insert on news_articles for each row execute function poison_article();
create table geo_cms_verifications(place_id uuid primary key,status text,checked_at timestamptz,fingerprint text,checks jsonb);
create function geo_cms_fingerprint(uuid)returns text language sql as 'select md5($1::text)';
create function api_private.review_inactive_city_unlinked(uuid)returns boolean language sql as 'select false';
create table admin_automations(slug text primary key,enabled boolean,last_run_at timestamptz,last_run_status text);
insert into admin_automations values('review_automatic_resolution',true,null,null);
create table review_queue(id uuid primary key,status text,resolved_by uuid,review_type text,details jsonb,resolved_at timestamptz);
insert into review_queue values(md5('proposal')::uuid,'pending',null,'date_mismatch','{"source":"event-agentic-enrich","page":"https://publisher.test/"}',null);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table before_stages as select id,to_jsonb(s)value from ingestion_staging s;
"""
before = r"""
revoke all on function api_private.run_review_automatic_resolution(integer,boolean)from public,anon,authenticated;
grant execute on function api_private.run_review_automatic_resolution(integer,boolean)to service_role;
create table security_before as select proowner,proacl,proconfig,prosecdef from pg_proc where oid='api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure;
do $$begin
 begin
  perform api_private.run_review_automatic_resolution(50,false);
  raise exception 'Expected original native row failure';
 exception when raise_exception then
  if sqlerrm not like 'Native news commit failed:%'then raise;end if;
 end;
 if exists(select 1 from news_articles)or exists(select 1 from admin_review_repairs)
  or exists(select 1 from before_stages b join ingestion_staging s using(id)where b.value<>to_jsonb(s))then raise exception 'Original failure should reproduce whole-batch rollback';end if;
end$$;
"""
checks = r"""
do $$declare r jsonb;n integer;begin
 r:=api_private.run_review_automatic_resolution(50,true);
 if r->>'news_passed'<>'9'or r->>'news_commit_errors'<>'0'or exists(select 1 from admin_review_repairs)
  or exists(select 1 from before_stages b join ingestion_staging s using(id)where b.value<>to_jsonb(s))then raise exception 'Dry run changed data or verdicts: %',r;end if;
 update admin_automations set enabled=false;
 r:=api_private.run_review_automatic_resolution(50,false);
 if r->>'skipped'<>'paused'or exists(select 1 from admin_review_repairs)then raise exception 'Pause bypassed';end if;
 update admin_automations set enabled=true;
 r:=api_private.run_review_automatic_resolution(50,false);
 if r->>'news_passed'<>'9'or r->>'news_commit_errors'<>'2'or r->>'news_committed'<>'7'
  or r#>>'{news_commit_failed_jobs,0,errors}'<>'2'or r->>'homepage_date_proposals'<>'1'
  then raise exception 'Native error isolation/counting failed: %',r;end if;
 if(select count(*)from news_articles)<>7 or(select count(*)from ingestion_staging where disposition='error'and error_message is not null)<>2
  then raise exception 'Successful articles or durable diagnostics lost';end if;
 if(select status from review_queue where id=md5('proposal')::uuid)<>'rejected'
  or(select last_run_status from admin_automations)<>'partial'then raise exception 'Independent repair/partial reporting lost';end if;
 if exists(select 1 from before_stages b join ingestion_staging s using(id)where b.id in(md5('10')::uuid,md5('11')::uuid,md5('human')::uuid)and b.value<>to_jsonb(s))
  then raise exception 'Quality/verdict/human hold bypassed';end if;
 select count(*)into n from admin_review_repairs;
 r:=api_private.run_review_automatic_resolution(50,false);
 if r->>'news_committed'<>'0'or r->>'news_commit_errors'<>'0'or(select count(*)from admin_review_repairs)<>n
  or(select count(*)from ingestion_staging where disposition='error'and error_message is not null)<>2
  or(select last_run_status from admin_automations)<>'success'then raise exception 'Repeated pass retried a poison row or lost diagnostics: %',r;end if;
 if exists((select proowner,proacl,proconfig,prosecdef from pg_proc where oid='api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure except select * from security_before))then raise exception 'Reconciler security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-news-isolation-') as tmp:
    data = str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55492 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55492','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+native+slug_patch+policy+reconciler+before+patch+patch+checks,text=True,check=True)
        print('PASS: whole-run rollback reproduced; native early/late row errors preserved; seven successful articles and independent repair survive; actual success count, partial state, pause/dry/repeat and quality/human/security contracts pass')
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
