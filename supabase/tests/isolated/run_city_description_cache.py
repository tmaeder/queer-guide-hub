#!/usr/bin/env python3
"""Prove assessment equivalence/call counts in a disposable PostgreSQL cluster.

The assessment and all 43 output expressions come from the applied contract;
upstream relationship joins are represented by typed synthetic facts. Native
scorecard/sync bodies are exercised, but this is not a production sync benchmark. No application/server is contacted.
"""
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
MIGRATION = ROOT / 'supabase/migrations/99991793340066_city_quality_description_fact_cache.sql'
CONTRACT = (ROOT / 'supabase/migrations/99991790194100_city_quality_contract.sql').read_text()
REFRESH = (ROOT / 'supabase/migrations/99991793214974_city_refresh_fair_bounded_drain.sql').read_text()
PREDICATE = re.search(r'create or replace function public\.city_description_is_wrong_subject\(p_description text\).*?\$predicate\$;', REFRESH, re.S).group()
ASSESSMENT = CONTRACT.split('assessed as (', 1)[1].split('from assessed a;', 1)[0] + 'from assessed a;'
LEGACY = """f.description ~* '(^|[[:space:]])(may refer to|refers to multiple|disambiguation)([[:space:]]|$)'
             or f.description ~* '(as an ai|i cannot provide|provided sources do not contain|sources do not provide)'"""
assert ASSESSMENT.count(LEGACY) == 1
ASSESSMENT = ASSESSMENT.replace(LEGACY, 'public.city_description_is_wrong_subject(f.description)')
VIEW = """create or replace view public.city_quality_profile
with (security_barrier=true, security_invoker=true) as
with base as materialized (select * from public.facts_input),
facts as materialized (
 select b.*, encode(digest(coalesce(b.description,''), 'sha256'),'hex') as current_description_hash
 from base b
), assessed as (""" + ASSESSMENT

SCORECARD = 'create or replace function public._city_quality_scorecard()' + CONTRACT.split('create or replace function public._city_quality_scorecard()',1)[1].split('revoke all on function public._city_quality_scorecard()',1)[0]
SYNC = (ROOT / 'supabase/migrations/99991792000966_feedback_city_quality_materialize.sql').read_text()
SUPPORT = """
create view public.cities as select f.*,null::uuid as duplicate_of_id from facts_input f;
create table public.venues(id uuid,city_id uuid,duplicate_of_id uuid,category text);
create table public.events(id uuid,city_id uuid,duplicate_of_id uuid,event_type text);
create table public.admin_automations(id uuid primary key,slug text,last_run_at timestamptz,last_run_status text);
insert into public.admin_automations values(md5('automation')::uuid,'city_quality_issue_sync',null,null);
create table public.admin_automation_runs(
 id bigserial primary key,automation_id uuid,automation_slug text,status text,
 started_at timestamptz,finished_at timestamptz,items_examined integer,items_changed integer,
 summary jsonb,error text);
create table public.review_queue(
 entity_type text,entity_id uuid,review_type text,status text,details jsonb,
 created_at timestamptz default now(),resolved_at timestamptz);
create unique index city_pending on public.review_queue(entity_type,entity_id,review_type)
 where entity_type='city' and status='pending' and left(review_type,5)='CITY_';
create table public.city_quality_snapshots(snapshot_date date primary key,captured_at timestamptz,scorecard jsonb);
-- Category classification is upstream and unchanged by this migration.
create function public.run_city_category_review_sync(integer) returns jsonb language sql
 as $$select '{}'::jsonb$$;
"""

SCHEMA = """
create extension pgcrypto;
create role anon; create role authenticated; create role service_role; create role quality_owner;
create table public.facts_input (
 id uuid primary key, name text, slug text, country_id uuid, shell_status text,
 seo_indexable boolean, wikidata_qid text, wikipedia_title text,
 latitude numeric, longitude numeric, timezone text,
 description text, description_i18n jsonb default '{}', editorial_hook text,
 local_customs text, best_time_to_visit text, lgbt_friendly_rating numeric,
 image_flagged boolean default false, curated_image_url text, image_url text,
 field_provenance jsonb default '{}', last_verified_at timestamptz,
 last_refreshed_at timestamptz, updated_at timestamptz default now()-interval '20 days',
 completeness_score smallint default 50, trust_score smallint default 50,
 selected_image_url text, lifecycle_cohort text, translation_count integer default 0,
 duplicate_image_count integer default 0, duplicate_image_country_count integer default 0,
 duplicate_description_count integer default 0, duplicate_description_country_count integer default 0,
 verified_image boolean default false, image_has_provenance boolean default false,
 registry_flagged boolean default false, registry_active boolean default false,
 duplicate_phash_count integer default 0, duplicate_phash_country_count integer default 0,
 venue_count integer default 0, event_count integer default 0,
 relationship_country_mismatches integer default 0, category_other_count integer default 0,
 categorized_entity_count integer default 0, category_average_confidence numeric default 0,
 category_disagreement_count integer default 0, category_evidence_count integer default 0,
 unlinked_venue_candidates integer default 0, unlinked_event_candidates integer default 0,
 wrong_namesake_events integer default 0, wrong_country_evidence integer default 0,
 pending_duplicate_reviews integer default 0, pending_image_reviews integer default 0
);
insert into public.facts_input (
 id,name,slug,country_id,shell_status,seo_indexable,description,lifecycle_cohort,
 latitude,longitude,timezone,wikidata_qid,wikipedia_title,selected_image_url,
 verified_image,registry_flagged,image_flagged,duplicate_image_count,
 duplicate_image_country_count,duplicate_description_count,duplicate_description_country_count,
 venue_count,event_count,category_other_count,categorized_entity_count,
 wrong_namesake_events,relationship_country_mismatches,unlinked_venue_candidates,
 pending_duplicate_reviews,pending_image_reviews,description_i18n,field_provenance)
select md5(n::text)::uuid,'City '||n,'fixture-'||n,md5('country')::uuid,
 case when n%7=0 then 'ghost' when n%7=1 then 'placeholder' else 'real' end,
 case when n%5=0 then false when n%5=1 then null else true end,
 case n%12 when 0 then null when 1 then '' when 2 then '   '
 when 3 then 'Sion has an airfield for civilian and military use.'
 when 4 then 'When disambiguation was needed, it was referred to as Interamna Nahars.'
 when 5 then 'The town name may refer to its position on the road.'
 when 6 then 'Ephrata may refer to: Places and people.'
 when 7 then 'Milton can also refer to: several places.'
 when 8 then 'Milton is a disambiguation page.'
 when 9 then 'As an AI language model, I cannot provide this.'
 when 10 then 'Provided sources do not contain enough detail.'
 else repeat('A sourced history of a real settlement. ',40) end,
 case when n%7=0 then 'archived_non_place' when n%7=1 then 'unresolved_placeholder'
 when n%7=2 then 'internal_record' else 'publishable_place' end,
 case when n%8=0 then 0 else 42 end,case when n%8=0 then 0 else 8 end,
 case when n%9=0 then null else 'Europe/Zurich' end,
 case when n%4=0 then null else 'Q'||n end,
 case when n%4=0 then null else 'Title '||n end,
 case when n%3=0 then null else 'https://example.org/image.jpg' end,
 n%4=0,n%10=0,n%8=0,n%4,n%3,n%4,n%3,n%3,n%4,n%3,n%5,
 n%2,n%2,n%2,n%2,n%2,
 case when n%2=0 then '{"de":"Übersetzung"}'::jsonb else '{}'::jsonb end,
 case when n%2=0 then '{"description":{"source_url":"https://example.org","source_identity":"fixture","retrieved_at":"2026-10-01","source_hash":"old","language":"en","confidence":0.99}}'::jsonb else '{}'::jsonb end
from generate_series(1,1200)n;
create table untouched_facts as select to_jsonb(f) as row from public.facts_input f;
"""

with tempfile.TemporaryDirectory(prefix='city-description-cache-pg-') as tmp:
    data, sock = Path(tmp)/'data', Path(tmp)/'sock'
    sock.mkdir()
    subprocess.run([str(PG/'initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'), '-D', str(data), '-l', str(Path(tmp)/'pg.log'), '-o', f'-k {sock} -p 55479 -h "" -c track_functions=all', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        command = [str(PG/'psql'), '-X', '-h', str(sock), '-p', '55479', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']
        def sql(text):
            result = subprocess.run(command, input=text, text=True, capture_output=True)
            if result.returncode:
                raise AssertionError(result.stderr)
            return result.stdout.strip()
        def calls():
            return int(sql("select coalesce((select calls from pg_stat_user_functions where funcid='public.city_description_is_wrong_subject(text)'::regprocedure),0);"))
        def reset():
            sql('select pg_stat_reset();')
        def snapshot(name, condition='', relation='public.city_quality_profile'):
            reset()
            started = time.monotonic()
            sql(f'create table {name} as select id,to_jsonb(q) as row from {relation} q {condition};')
            return {'calls': calls(), 'seconds': round(time.monotonic()-started, 4)}
        sql(SCHEMA + PREDICATE + VIEW + SUPPORT + SCORECARD + SYNC + """
grant usage on schema public to quality_owner;
grant select on public.facts_input to quality_owner,authenticated,service_role;
alter view public.city_quality_profile owner to quality_owner;
grant select on public.city_quality_profile to authenticated,service_role;
revoke all on function public._city_quality_scorecard(),public.run_city_quality_issue_sync(integer) from public,authenticated;
grant execute on function public._city_quality_scorecard(),public.run_city_quality_issue_sync(integer) to service_role;
create function public.city_quality_scorecard() returns jsonb language sql stable security definer
set search_path to public,pg_temp as $$select public._city_quality_scorecard()$$;
create table before_access as select relacl,reloptions,relowner from pg_class where oid='public.city_quality_profile'::regclass;
create table before_predicate as select pg_get_functiondef('public.city_description_is_wrong_subject(text)'::regprocedure) as definition;
create table before_consumers as select oid,pg_get_functiondef(oid) as definition,to_jsonb(p)-'prosrc'-'prosqlbody' as metadata
from pg_proc p where oid in('public._city_quality_scorecard()'::regprocedure,'public.run_city_quality_issue_sync(integer)'::regprocedure);
create table before_wrapper as select pg_get_functiondef('public.city_quality_scorecard()'::regprocedure) as definition;
create table before_view as select pg_get_viewdef('public.city_quality_profile'::regclass,true) as definition;
create table baseline_scorecard as select public._city_quality_scorecard()-'generated_at' as value;
""")
        before = snapshot('baseline')
        before_filtered = snapshot('baseline_filtered', "where id=md5('42')::uuid")
        sql(MIGRATION.read_text())
        after = snapshot('candidate', relation='public._city_quality_full_profile()')
        after_filtered = snapshot('candidate_filtered', "where id=md5('42')::uuid")
        eligible = int(sql("select count(*) from facts_input where seo_indexable and nullif(btrim(description),'') is not null;"))
        assert after['calls'] == eligible, (after, eligible)
        assert before['calls'] > after['calls'], (before, after)
        assert before_filtered['calls'] == after_filtered['calls'] == 3
        sql("""
do $$declare consumer record;begin
 if exists(select 1 from baseline b full join candidate c using(id) where b.row is distinct from c.row)
 or exists(select 1 from baseline_filtered b full join candidate_filtered c using(id) where b.row is distinct from c.row)
 then raise exception 'Full JSON projection changed';end if;
 if exists(select 1 from before_access a join pg_class c on c.oid='public.city_quality_profile'::regclass
 where c.relacl is distinct from a.relacl or c.reloptions is distinct from a.reloptions or c.relowner<>a.relowner)
 or (select definition from before_view) is distinct from pg_get_viewdef('public.city_quality_profile'::regclass,true)
 then raise exception 'Public view definition/access changed';end if;
 if (select definition from before_predicate) is distinct from pg_get_functiondef('public.city_description_is_wrong_subject(text)'::regprocedure)
 then raise exception 'Detector implementation changed';end if;
 if (select definition from before_wrapper) is distinct from pg_get_functiondef('public.city_quality_scorecard()'::regprocedure)
 then raise exception 'Public wrapper changed';end if;
 for consumer in select * from before_consumers loop
  if consumer.definition is distinct from replace(pg_get_functiondef(consumer.oid),'public._city_quality_full_profile()','public.city_quality_profile')
  or consumer.metadata is distinct from(select to_jsonb(p)-'prosrc'-'prosqlbody' from pg_proc p where oid=consumer.oid)
  then raise exception 'Original consumer changed beyond full-scan reference substitution';end if;
 end loop;
 if has_function_privilege('authenticated','public._city_quality_full_profile()','execute')
 or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public._city_quality_full_profile()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
 or not has_function_privilege('service_role','public._city_quality_full_profile()','execute')
 then raise exception 'Helper execute boundary incorrect';end if;
 if not exists(select 1 from pg_proc where oid='public._city_quality_full_profile()'::regprocedure
  and proretset and prorettype='public.city_quality_profile'::regtype and provolatile='s' and not prosecdef
  and proconfig=array['search_path=public, pg_temp'])
 then raise exception 'Helper shape/invoker/inlining fence changed';end if;
 if (select value from baseline_scorecard) is distinct from (public._city_quality_scorecard()-'generated_at')
 then raise exception 'Native scorecard output changed';end if;
 if exists((select row from untouched_facts except select to_jsonb(f) from facts_input f)
 union all (select to_jsonb(f) from facts_input f except select row from untouched_facts))
 then raise exception 'Facts changed';end if;
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='city_quality_profile')<>43
 then raise exception 'Public projection changed';end if;
end$$;
""")
        # Both row-level permission checks and exact native sync compilation are local.
        allowed = sql('set role service_role;select count(*) from public._city_quality_full_profile();')
        assert allowed == '1200'
        denied = subprocess.run(command,input='set role authenticated;select count(*) from public._city_quality_full_profile();',text=True,capture_output=True)
        assert denied.returncode != 0 and 'permission denied' in denied.stderr
        sql('select public.run_city_quality_issue_sync(100);')
        assert int(sql('select count(*) from public.review_queue;')) > 0
        definition = sql("select pg_get_functiondef('public._city_quality_full_profile()'::regprocedure);")
        sql(MIGRATION.read_text())
        assert definition == sql("select pg_get_functiondef('public._city_quality_full_profile()'::regprocedure);")
        # Reject an independently changed helper atomically, leaving consumers untouched.
        sql("alter function public._city_quality_full_profile() volatile;")
        refused_helper = subprocess.run(command,input=MIGRATION.read_text(),text=True,capture_output=True)
        assert refused_helper.returncode != 0 and 'Existing city full-profile helper changed' in refused_helper.stderr
        assert sql("select provolatile from pg_proc where oid='public._city_quality_full_profile()'::regprocedure;") == 'v'
        sql("alter function public._city_quality_full_profile() stable;")
        assert definition == sql("select pg_get_functiondef('public._city_quality_full_profile()'::regprocedure);")
        # Refuse unexpected source shape; the failed statement must not change the view.
        sql(VIEW.replace('public.city_description_is_wrong_subject(f.description)', 'false'))
        refused = subprocess.run(command, input=MIGRATION.read_text(), text=True, capture_output=True)
        assert refused.returncode != 0 and 'Expected one city description assessment predicate' in refused.stderr
        print(json.dumps({'rows_equal':1200,'columns_equal':43,'eligible_rows':eligible,
              'full_scan':{'before':before,'after':after},
              'single_id_scan':{'before':before_filtered,'after':after_filtered},
              'public_view_wrapper_access_detector_unchanged':True,'native_scorecard_equal':True,'native_sync_executed':True,'service_only_helper':True,'idempotent':True,'unexpected_shape_refused':True,'changed_helper_refused':True,
              'limits':'Synthetic upstream facts only, not production wall-clock proof. Three full-profile evaluations and upstream joins remain; public narrow reads unchanged.'},indent=2))
    finally:
        subprocess.run([str(PG/'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
