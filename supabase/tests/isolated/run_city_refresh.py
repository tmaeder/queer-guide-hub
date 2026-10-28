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
 seo_indexable boolean default true, updated_at timestamptz default now(),
 field_provenance jsonb default '{}', needs_attention boolean default false);
alter table public.cities add column private_city_note text default 'DO_NOT_EXPORT';
create table public.countries(id uuid,name text,code text,languages text[]);
create table public.venues(city_id uuid); create table public.events(city_id uuid);
create table public.city_aliases(city_id uuid,alias text check(alias<>'reject-alias'),locale text,
 alias_key text generated always as (lower(alias)) stored,unique(city_id,alias_key));
create table public.city_localities(country_id uuid,locality_name text,locality_qid text unique,kind text,
 municipality_name text,municipality_qid text,anchor_lat numeric,anchor_lng numeric,radius_m integer,
 source text,note text check(note<>'reject-locality'));
create table public.review_queue(entity_id uuid,entity_type text,review_type text,status text,
 details jsonb default '{}',resolved_by uuid);
grant select on public.review_queue to service_role;
grant select on public.cities to service_role;
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
insert into public.city_aliases(city_id,alias,locale) values(md5('hasalias')::uuid,'Existing','en');
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
create temp table replay_snapshot as
 select s as snapshot from public.get_city_factual_snapshots(array[md5('untouched')::uuid]) s;
select public.apply_city_factual_patch((snapshot->>'id')::uuid,snapshot->>'row_version',
 (snapshot->>'updated_at')::timestamptz,snapshot->'field_provenance',snapshot->'enrichment_status',
 '{"description":"One native update"}','[{"alias":"Only once","locale":"en"}]') from replay_snapshot;
do $$declare s jsonb;result jsonb;begin
 select snapshot into s from replay_snapshot;
 result:=public.apply_city_factual_patch((s->>'id')::uuid,s->>'row_version',(s->>'updated_at')::timestamptz,
  s->'field_provenance',s->'enrichment_status','{"description":"One native update"}',
  '[{"alias":"Only once","locale":"en"}]');
 if result->>'reason'<>'stale_snapshot'
 or(select count(*) from public.city_aliases where city_id=(s->>'id')::uuid and alias='Only once')<>1
 then raise exception 'Repeated receipt produced duplicate native writes';end if;
end$$;
do $$declare c public.cities;result jsonb;version text;snapshot jsonb;begin
 select * into c from public.cities where id=md5('old')::uuid;
 select s into snapshot from public.get_city_factual_snapshots(array[c.id]) s;
 version:=snapshot->>'row_version';
 if version is null or snapshot ? 'private_city_note' then raise exception 'Snapshot version/projection failed';end if;
 result:=public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,
  '{"description":"Sourced fixture description"}', '[{"alias":"Fixture alias","locale":"en"}]');
 if result->>'status'<>'updated' or (result->>'aliases_written')::int<>1
 then raise exception 'Guarded city/alias write failed: %',result;end if;
 if(select name from public.cities where id=c.id)<>c.name
 or(select slug from public.cities where id=c.id)<>c.slug
 or(select count(*) from public.city_aliases where city_id=c.id)<>1
 then raise exception 'Unrelated values changed or alias duplicated';end if;
 select * into c from public.cities where id=c.id;
 select xmin::text into version from public.cities where id=c.id;
 result:=public.apply_city_factual_patch(c.id,'0',c.updated_at,c.field_provenance,c.enrichment_status,
  '{"description":"Stale row version overwrite"}');
 if result->>'reason'<>'stale_snapshot' then raise exception 'Stale row version accepted';end if;
 result:=public.apply_city_factual_patch(c.id,version,c.updated_at-interval '1 second',c.field_provenance,c.enrichment_status,
  '{"description":"Stale overwrite"}');
 if result->>'reason'<>'stale_snapshot' then raise exception 'Stale timestamp accepted';end if;
 result:=public.apply_city_factual_patch(c.id,version,c.updated_at,'{"human":"changed"}',c.enrichment_status,
  '{"description":"Stale metadata overwrite"}');
 if result->>'reason'<>'stale_snapshot' then raise exception 'Stale provenance accepted';end if;
 insert into public.review_queue values(c.id,'city','manual','pending','{"manual_hold":true}',null);
 result:=public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,
  '{"description":"Held overwrite"}','[{"alias":"Held alias","locale":"en"}]');
 if result->>'reason'<>'human_hold'
 or(select description from public.cities where id=c.id)<>'Sourced fixture description'
 or(select count(*) from public.city_aliases where city_id=c.id)<>1
 then raise exception 'Human hold changed city or aliases';end if;
 if exists(select 1 from public.cities_due_for_refresh(100,'all') where id=c.id)
 then raise exception 'Human-held city selected';end if;
 delete from public.review_queue where entity_id=c.id;
 insert into public.review_queue values(c.id,'city','CITY_IDENTITY_AMBIGUOUS','pending',
  jsonb_build_object('source','city_quality_profile','city_name',c.name,'city_slug',c.slug,
   'publication_ready',false,'hard_blocker',true,'observed_at',now()),null);
 if not public.city_factual_research_allowed(c.id)
 then raise exception 'Native machine identity work was mistaken for a human hold';end if;
 update public.review_queue set details=details||'{"requires_confirm":true}' where entity_id=c.id;
 if public.city_factual_research_allowed(c.id)
 then raise exception 'Confirmation requirement ignored';end if;
 delete from public.review_queue where entity_id=c.id;
 insert into public.review_queue values(c.id,'city','manual','resolved','{}',md5('staff')::uuid);
 if public.city_factual_research_allowed(c.id)
 then raise exception 'Human decision ownership ignored';end if;
 delete from public.review_queue where entity_id=c.id;
 begin
  perform public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,'{"seo_indexable":false}');
  raise exception 'Publication patch accepted';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,
   '{"description":"Must roll back"}','[{"alias":"reject-alias","locale":"en"}]');
 exception when others then null;end;
 if(select description from public.cities where id=c.id)<>'Sourced fixture description'
 then raise exception 'Failed alias transaction left a city write';end if;
end$$;
do $$declare c public.cities;version text;result jsonb;proposal jsonb;begin
 select * into c from public.cities where id=md5('alias')::uuid;
 select xmin::text into version from public.cities where id=c.id;
 proposal:='{"locality_qid":"Q123","municipality_qid":"Q456","municipality_name":"Parent","anchor_lat":47,"anchor_lng":8,"note":"source"}';
 result:=public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,
  '{"description":"Locality evidence"}','[]',proposal);
 if (result->>'localities_written')::int<>1
 or not exists(select 1 from public.city_localities where locality_qid='Q123' and locality_name=c.name)
 then raise exception 'Guarded locality registration failed';end if;
 select xmin::text into version from public.cities where id=c.id;
 begin
  perform public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,
   '{"description":"Must roll back locality failure"}','[{"alias":"Locality rollback","locale":"en"}]',
   proposal||'{"locality_qid":"Q789","note":"reject-locality"}');
  raise exception 'Invalid locality unexpectedly accepted';
 exception when check_violation then null;end;
 if(select description from public.cities where id=c.id)<>'Locality evidence'
 or exists(select 1 from public.city_aliases where alias='Locality rollback')
 then raise exception 'Locality failure did not roll back city and alias';end if;
 insert into public.review_queue values(c.id,'city','manual','pending','{"manual_hold":true}',null);
 result:=public.apply_city_factual_patch(c.id,version,c.updated_at,c.field_provenance,c.enrichment_status,
  '{"description":"Held locality"}','[]',proposal||'{"locality_qid":"Q999"}');
 if result->>'reason'<>'human_hold' or exists(select 1 from public.city_localities where locality_qid='Q999')
 then raise exception 'Human-held city registered a locality';end if;
end$$;
set role authenticated;
do $$begin
 perform public.apply_city_factual_patch(null,null,null,null,null,'{}');
 raise exception 'Authenticated role reached service writer';
exception when insufficient_privilege then null;end$$;
reset role;
create temp table before_human_edit as
 select s as snapshot from public.get_city_factual_snapshots(array[md5('untouched')::uuid]) s;
-- Deliberately leave updated_at/provenance unchanged: xmin must still notice.
update public.cities set description='Human changed this between requests'
 where id=md5('untouched')::uuid;
do $$declare s jsonb;result jsonb;begin
 select snapshot into s from before_human_edit;
 result:=public.apply_city_factual_patch((s->>'id')::uuid,s->>'row_version',(s->>'updated_at')::timestamptz,
  s->'field_provenance',s->'enrichment_status','{"description":"Stale machine overwrite"}');
 if result->>'reason'<>'stale_snapshot'
 or(select description from public.cities where id=(s->>'id')::uuid)<>'Human changed this between requests'
 then raise exception 'Concurrent edit without timestamp change was overwritten';end if;
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
        print('PASS: fair bounded queues; scopes/ACL/view options; guarded city+alias transactions; xmin/provenance staleness and replay refusal; human decisions/holds; protected fields; rollback; manual pause refusal')
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
