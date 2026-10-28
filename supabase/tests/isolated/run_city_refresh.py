#!/usr/bin/env python3
"""Exercise the real queue migration in an ephemeral PostgreSQL cluster only."""
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
MIGRATION = ROOT / 'supabase/migrations/99991793214974_city_refresh_fair_bounded_drain.sql'
SCHEMA = """
create role anon; create role authenticated; create role service_role;
create schema cron;
create table public.cities(
 id uuid primary key, name text, slug text, latitude numeric, longitude numeric,
 country_id uuid, description text, official_website text, completeness_score smallint,
 shell_status text default 'real', last_refreshed_at timestamptz, wikidata_qid text,
 population bigint, duplicate_of_id uuid, enrichment_status jsonb default '{}',
 seo_indexable boolean default true);
create table public.venues(city_id uuid); create table public.events(city_id uuid);
create table public.city_aliases(city_id uuid);
create view public.city_quality_profile with(security_barrier=true) as
 select f.id,case when f.description ~* '(^|[[:space:]])(may refer to|refers to multiple|disambiguation)([[:space:]]|$)'
 or f.description ~* '(as an ai|i cannot provide|provided sources do not contain|sources do not provide)'
 then 'CITY_DESCRIPTION_WRONG_SUBJECT'::text end as issue from public.cities f
 cross join (values(null::text)) other(description);
grant select on public.city_quality_profile to service_role;
create table public.admin_automations(id uuid,slug text,enabled boolean,
 last_run_status text,consecutive_failures integer,schedule text,action jsonb,description text);
create table cron.job(jobname text primary key,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language sql as $$
 insert into cron.job values($1,$2,$3) on conflict(jobname) do update
 set schedule=excluded.schedule,command=excluded.command returning 1::bigint $$;
create function public.admin_automation_effective_command(text,text) returns text language sql as $$
 select 'tracked:'||$1||':'||$2 $$;
insert into public.admin_automations
select md5(slug)::uuid,slug,slug<>'city_alias_harvest',
 case when slug='city_alias_harvest' then 'auto_paused' else 'success' end,
 case when slug='city_alias_harvest' then 3 else 0 end,'10 2 * * *',
 jsonb_build_object('command','select net.http_post(url := ''https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/city-factual-backfill'',body := ''{"batch_limit":60}''::jsonb)'),''
from unnest(array['city_qid_gap_link','city_alias_harvest','city_factual_sparql']) slug;
insert into public.cities(id,name,slug,population,last_refreshed_at,seo_indexable,wikidata_qid,enrichment_status)
values
 (md5('fresh')::uuid,'Fresh','fresh',999999999,now(),true,null,'{}'),
 (md5('untouched')::uuid,'Untouched','untouched',1,null,true,null,'{}'),
 (md5('old')::uuid,'Old','old',100,now()-interval '4 days',true,null,'{}'),
 (md5('hidden')::uuid,'Hidden','hidden',999999999,null,false,null,'{}'),
 (md5('terminal')::uuid,'Terminal','terminal',999999999,null,true,null,'{"wikidata_link":{"state":"data_unavailable"}}'),
 (md5('notcity')::uuid,'Not a city','notcity',999999999,null,true,null,'{"disposition":{"state":"not_a_city"}}'),
 (md5('alias')::uuid,'Alias','alias',10,null,true,'Q1','{}'),
 (md5('hasalias')::uuid,'Has alias','hasalias',20,null,true,'Q2','{}');
insert into public.city_aliases values(md5('hasalias')::uuid);
insert into public.events values(md5('old')::uuid);
insert into public.venues values(md5('hidden')::uuid);
"""
CHECKS = """
do $$declare ids uuid[];begin
 select array_agg(id) into ids from public.cities_due_for_refresh(20,'qid_gap');
 if ids<>array[md5('untouched')::uuid,md5('old')::uuid,md5('hidden')::uuid]
 then raise exception 'Unvisited/indexable fairness or terminal guards failed: %',ids;end if;
 if(select id from public.cities_due_for_refresh(1,'qid_gap'))<>md5('untouched')::uuid
 then raise exception 'High-population fresh head still starves untouched city';end if;
 if(select id from public.cities_due_for_refresh(20,'alias_gap'))<>md5('alias')::uuid
 then raise exception 'Alias membership selection failed';end if;
 if not(select has_content from public.cities_due_for_refresh(20,'qid_gap') where id=md5('old')::uuid)
 then raise exception 'Event membership lost';end if;
 if(select count(*) from public.cities_due_for_refresh(20,'content_only'))<>2
 then raise exception 'Content-only membership changed';end if;
 if(select id from public.cities_due_for_refresh(1,'content_first'))<>md5('hidden')::uuid
 then raise exception 'Content-first order changed';end if;
 if not exists(select 1 from public.cities_due_for_refresh(20,'all') where id=md5('fresh')::uuid)
 then raise exception 'Gap cooldown leaked into all scope';end if;
 if exists(select 1 from public.cities_due_for_refresh(20,null))
 then raise exception 'NULL scope contract changed';end if;
 if(select count(*) from public.cities_due_for_refresh(0,'qid_gap'))<>1
 then raise exception 'Minimum limit guard changed';end if;
 if exists(select 1 from public.admin_automations where not enabled)
 then raise exception 'Automatic alias pause was not repaired';end if;
 if exists(select 1 from cron.job where command not like 'tracked:%')
 then raise exception 'Native tracking wrapper bypassed';end if;
 if(select count(*) from cron.job)<>3 then raise exception 'Wrong scheduling scope';end if;
 if(select schedule from cron.job where jobname='city_qid_gap_link')<>'*/10 * * * *'
 then raise exception 'Identity drain cadence incorrect';end if;
 if exists(select 1 from public.admin_automations where slug<>'city_factual_sparql'
  and action->>'command' not like '%"batch_limit":20%')
 then raise exception 'Link/alias batch not bounded';end if;
 if(select consecutive_failures from public.admin_automations where slug='city_alias_harvest')<>3
 then raise exception 'Historical failure counter was forged';end if;
 if exists(select 1 from (values
  ('Sion has an airfield for civilian and military use.',false),
  ('Middenmeer has an airfield for light airplanes.',false),
  ('Eldorado has an airport.',false),
  ('When disambiguation was needed, it was referred to as Interamna Nahars.',false),
  ('The town name may refer to its position on the road.',false),
  ('Ephrata may refer to: Places and people.',true),
  ('Milton can also refer to: several places.',true),
  ('Milton is a disambiguation page.',true),
  ('As an AI language model, I cannot provide this.',true),
  ('Provided sources do not contain enough detail.',true)
 ) cases(description,expected)
 where public.city_description_is_wrong_subject(description) is distinct from expected)
 then raise exception 'Description detector regression';end if;
 if not(select reloptions @> array['security_barrier=true'] from pg_class where oid='public.city_quality_profile'::regclass)
 then raise exception 'View security options lost';end if;
 if has_function_privilege('authenticated','public.cities_due_for_refresh(integer,text)','EXECUTE')
 then raise exception 'Selector service-only boundary lost';end if;
end$$;
"""

with tempfile.TemporaryDirectory(prefix='city-refresh-pg-') as tmp:
    data, sock = Path(tmp) / 'data', Path(tmp) / 'sock'
    sock.mkdir()
    subprocess.run([str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'pg.log'), '-o', f'-k {sock} -p 55447 -h ""', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        command = [str(PG / 'psql'), '-h', str(sock), '-p', '55447', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        try:
            subprocess.run(command, input=SCHEMA + MIGRATION.read_text() + CHECKS, text=True, check=True, stdout=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            subprocess.run(command + ['-c', "select pg_get_viewdef('public.city_quality_profile'::regclass,true)"], check=True)
            raise
        # A human-disabled automation must refuse the whole scheduling repair.
        refusal = "update public.admin_automations set enabled=false,last_run_status='disabled' where slug='city_alias_harvest';\n" + MIGRATION.read_text()
        result = subprocess.run([str(PG / 'psql'), '-h', str(sock), '-p', '55447', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=refusal, text=True, capture_output=True)
        if result.returncode == 0 or 'refuses to override a manually disabled job' not in result.stderr:
            raise AssertionError('Manual pause protection was not enforced')
        print('PASS: queue fairness, cooldown, scopes, terminal guards, content membership, limits, tracked bounded schedules, historical counters and manual pause refusal')
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
