"""Real PostgreSQL contracts; Unix socket only, no application DB or providers."""
import os
import subprocess
import tempfile
from pathlib import Path

PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
ROOT = Path(__file__).resolve().parents[3]
MIGRATION = next((ROOT / 'supabase/migrations').glob('*_weekly_registered_source_sync.sql'))

SCHEMA = r'''
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema api_private;create schema pgmq;
grant usage on schema public,api_private,auth to service_role,authenticated,anon;
create type public.app_role as enum ('admin');
create function auth.uid() returns uuid language sql as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.has_role(uuid,public.app_role) returns boolean language sql as $$
 select $1='11111111-1111-4111-8111-111111111111'::uuid $$;
create table public.pipeline_node_types (
 id uuid default gen_random_uuid(),slug text unique,category text,display_name text,description text,
 icon text,color text,edge_function text,config_schema jsonb,is_enabled boolean default true);
create table public.workflow_definitions(name text unique,display_name text,description text,edge_function text,
 queue_name text,max_concurrency int,timeout_seconds int,max_retries int,is_enabled boolean);
create table public.pipeline_definitions (
 id uuid primary key default gen_random_uuid(),name text unique,display_name text,description text,
 nodes jsonb,edges jsonb,default_context jsonb,max_concurrency int,timeout_seconds int,schedule text,
 is_enabled boolean,version int default 1);
create table public.pipeline_runs (
 id uuid primary key default gen_random_uuid(),pipeline_id uuid references public.pipeline_definitions(id),
 pipeline_name text,status text,node_states jsonb,context jsonb,started_at timestamptz,
 completed_at timestamptz,triggered_by text,pipeline_snapshot jsonb,pipeline_version int,
 items_total int default 0,items_processed int default 0,items_succeeded int default 0,
 items_failed int default 0,error_message text,updated_at timestamptz default now(),created_at timestamptz default now());
create table public.scrape_sources (
 id uuid primary key default gen_random_uuid(),name text,slug text unique,is_enabled boolean);
create table public.ingestion_sources (
 id uuid primary key default gen_random_uuid(),name text,slug text unique,source_type text,target_table text,
 edge_function text,config jsonb,schedule text,is_enabled boolean);
create table public.news_sources (
 id uuid primary key default gen_random_uuid(),name text,is_active boolean,auto_paused boolean default false,
 backoff_until timestamptz);
create table public.admin_automations (
 slug text primary key,name text,description text,managed_by text,enabled boolean,trigger jsonb,
 conditions jsonb,action jsonb,schedule text,lifecycle_state text default 'active',updated_at timestamptz default now());
create table public.fixture_queue(id bigserial primary key,queue text,message jsonb,delay int);
create view pgmq.q_pipeline_steps as select id as msg_id,message from public.fixture_queue where queue='pipeline_steps';
create function public.pgmq_send(p_queue text,p_msg jsonb,p_delay int default 0)
 returns bigint language sql as $$
 insert into public.fixture_queue(queue,message,delay) values($1,$2,$3) returning id $$;
create function public.pgmq_archive(p_queue text,p_msg_id bigint) returns boolean language plpgsql as $$
begin delete from public.fixture_queue where queue=p_queue and id=p_msg_id;return found;end $$;
'''

CHECKS = r'''
create function public.fixture_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end $$;

insert into public.scrape_sources(name,slug,is_enabled) values('Enabled scraper','mirror',true),('Disabled','disabled',false);
insert into public.ingestion_sources(name,slug,edge_function,is_enabled) values
 ('Mirror','mirror','scrape-web-sources',true),('Feed umbrella','news-feeds','source-rss-news',true);
insert into public.news_sources(name,is_active,auto_paused)
 select 'Feed '||i,true,false from generate_series(1,1205) i;
insert into public.news_sources(name,is_active,auto_paused,backoff_until) values
 ('Disabled',false,false,null),('Paused',true,true,null),('Backoff',true,false,now()+interval '1 hour');

do $$
declare d uuid;r jsonb;r2 jsonb;rid uuid;j uuid;claim jsonb;ok jsonb;total int;
begin
 select id into d from public.pipeline_definitions where name='weekly-data-source-sync';
 r:=public.start_weekly_source_sync(d,'{"batch_size":50,"secret":"MUST_NOT_PERSIST"}');rid:=(r->>'run_id')::uuid;
 select (select count(*) from public.scrape_sources)+(select count(*) from public.ingestion_sources)+
   (select count(*) from public.news_sources) into total;
 perform public.fixture_assert(total>1000,'fixture exceeds API row limit');
 perform public.fixture_assert((select count(*)=total from public.weekly_source_sync_jobs where run_id=rid),'complete three-registry inventory');
 perform public.fixture_assert((select count(*)=3 from public.weekly_source_sync_jobs where run_id=rid and status='queued'),'bounded initial concurrency');
 perform public.fixture_assert((select count(*)=6 from public.weekly_source_sync_jobs where run_id=rid and status='skipped'),'disabled/paused/backoff and aliases skipped');
 perform public.fixture_assert((select context::text not like '%MUST_NOT_PERSIST%' from public.pipeline_runs where id=rid),'context allowlist');
 r2:=public.start_weekly_source_sync(d,'{}');
 perform public.fixture_assert(r2->>'run_id'=rid::text and (r2->>'reused')::boolean,'one active parent run');
 j:=(r->'job_ids'->>0)::uuid;claim:=public.claim_weekly_source_sync_job(rid,j);
 perform public.fixture_assert(claim is not null,'claim queued job');
 perform public.fixture_assert(public.claim_weekly_source_sync_job(rid,j) is null,'duplicate claim rejected');
 ok:=public.finish_weekly_source_sync_job(rid,j,gen_random_uuid(),'{"outcome":"succeeded","staged":5}');
 perform public.fixture_assert(not (ok->>'accepted')::boolean,'wrong token rejected');
 ok:=public.finish_weekly_source_sync_job(rid,j,(claim->>'token')::uuid,
   '{"outcome":"succeeded","fetched":8,"staged":5,"skipped":3}');
 perform public.fixture_assert((ok->>'accepted')::boolean,'outcome persisted');
 ok:=public.finish_weekly_source_sync_job(rid,j,(claim->>'token')::uuid,'{"outcome":"succeeded","staged":5}');
 perform public.fixture_assert(not (ok->>'accepted')::boolean,'duplicate completion rejected');
 perform public.fixture_assert((select items_staged=5 from public.weekly_source_sync_jobs where id=j),'no double counting');
 perform public.fixture_assert((select count(*)<=3 from public.weekly_source_sync_jobs where run_id=rid and status in ('queued','running')),'concurrency after completion');
 update public.pipeline_runs set status='cancelled' where id=rid;
 select id into j from public.weekly_source_sync_jobs where run_id=rid and status='queued' limit 1;
 perform public.fixture_assert(public.claim_weekly_source_sync_job(rid,j) is null,'cancelled run cannot execute queued source');
 perform public.fixture_assert(not exists(select 1 from public.weekly_source_sync_jobs where run_id=rid and status in('pending','queued','running','waiting')),'cancel clears all outstanding outcomes');
 perform public.fixture_assert((select items_processed=total and completed_at is not null and context->'weekly_summary'->>'skipped'=(total-1)::text from public.pipeline_runs where id=rid),'cancellation reconciles source counters and summary');
end $$;

-- Compact inventory exercises every terminal state and lease transition.
delete from public.scrape_sources;delete from public.ingestion_sources;delete from public.news_sources;
insert into public.news_sources(name,is_active) values('First',true),('Second',true),('Third',true);
do $$
declare d uuid;r jsonb;rid uuid;ids uuid[];a jsonb;b jsonb;c jsonb;again jsonb;ok jsonb;job_id uuid;
begin
 select id into d from public.pipeline_definitions where name='weekly-data-source-sync';
 r:=public.start_weekly_source_sync(d,'{"dry_run":true}');rid:=(r->>'run_id')::uuid;
 select array_agg(id order by id) into ids from public.weekly_source_sync_jobs where run_id=rid;
 a:=public.claim_weekly_source_sync_job(rid,ids[1]);b:=public.claim_weekly_source_sync_job(rid,ids[2]);c:=public.claim_weekly_source_sync_job(rid,ids[3]);
 perform public.finish_weekly_source_sync_job(rid,ids[1],(a->>'token')::uuid,
   '{"outcome":"failed","retryable":true,"reason":"HTTP 503"}');
 perform public.fixture_assert((select status='queued' and attempts=1 from public.weekly_source_sync_jobs where id=ids[1]),'retry durably scheduled');
 update public.weekly_source_sync_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=ids[1];
 again:=public.claim_weekly_source_sync_job(rid,ids[1]);
 perform public.fixture_assert((again->>'attempts')::int=2 and again->>'token'<>a->>'token','retry receives a fresh lease');
 ok:=public.finish_weekly_source_sync_job(rid,ids[1],(a->>'token')::uuid,'{"outcome":"succeeded"}');
 perform public.fixture_assert(not (ok->>'accepted')::boolean,'stale attempt cannot commit');
 perform public.finish_weekly_source_sync_job(rid,ids[1],(again->>'token')::uuid,'{"outcome":"succeeded","fetched":4,"staged":2}');
 perform public.finish_weekly_source_sync_job(rid,ids[2],(b->>'token')::uuid,
   '{"outcome":"blocked","reason":"Missing setting","required_settings":["PROVIDER_API_KEY"]}');
 perform public.fixture_assert((select status='running' from public.pipeline_runs where id=rid),'blocked source does not abort unrelated jobs');
 perform public.finish_weekly_source_sync_job(rid,ids[3],(c->>'token')::uuid,'{"outcome":"succeeded","fetched":3,"staged":1}');
 perform public.fixture_assert((select status='failed' and items_total=3 and items_processed=3 and items_succeeded=2 and items_failed=1
   from public.pipeline_runs where id=rid),'partial failure is not reported as success');
 perform public.fixture_assert((select context->'weekly_summary'->>'records_staged'='3' from public.pipeline_runs where id=rid),'reported record totals');

 r:=public.start_weekly_source_sync(d,'{}');rid:=(r->>'run_id')::uuid;
 select id into job_id from public.weekly_source_sync_jobs where run_id=rid and status='queued' limit 1;
 ids[1]:=job_id;
 a:=public.claim_weekly_source_sync_job(rid,ids[1]);
 update public.weekly_source_sync_jobs set lease_until=clock_timestamp()-interval '1 second' where id=ids[1];
 perform public.recover_weekly_source_sync_jobs();
 again:=public.claim_weekly_source_sync_job(rid,ids[1]);
 perform public.fixture_assert((again->>'attempts')::int=2,'expired lease is recovered');
 perform public.fixture_assert((select interrupted_attempts=1 from public.weekly_source_sync_jobs where id=ids[1]),'interrupted counts are disclosed');
 ok:=public.finish_weekly_source_sync_job(rid,ids[1],(a->>'token')::uuid,'{"outcome":"succeeded"}');
 perform public.fixture_assert(not (ok->>'accepted')::boolean,'expired worker cannot overwrite recovery');
 update public.pipeline_runs set status='cancelled' where id=rid;
end $$;

-- Waiting children retain a slot, polling does not consume import attempts,
-- and a colliding queue sequence cannot archive somebody else's delivery.
do $$
declare d uuid;rid uuid;j uuid;child uuid;claim jsonb;v_message bigint;
begin
 select id into d from public.pipeline_definitions where name='weekly-data-source-sync';
 rid:=(public.start_weekly_source_sync(d,'{}')->>'run_id')::uuid;
 select id,delivery_msg_id into j,v_message from public.weekly_source_sync_jobs where run_id=rid and status='queued' limit 1;
 update public.fixture_queue set message='{"workflow":"unrelated"}' where id=v_message;
 claim:=public.claim_weekly_source_sync_job(rid,j);
 perform public.fixture_assert(exists(select 1 from public.fixture_queue where id=v_message),'unrelated delivery is retained');
 insert into public.pipeline_runs(pipeline_name,status) values('source-child','running') returning id into child;
 perform public.finish_weekly_source_sync_job(rid,j,(claim->>'token')::uuid,
   jsonb_build_object('outcome','succeeded','waiting',true,'child_run_id',child,'child_pipeline','source-child'));
 perform public.fixture_assert((select status='waiting' and attempts=1 and completed_at is null from public.weekly_source_sync_jobs where id=j),'child wait is not terminal success');
 update public.weekly_source_sync_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=j;
 claim:=public.claim_weekly_source_sync_job(rid,j);
 perform public.fixture_assert((claim->>'attempts')::int=1 and claim->>'child_run_id'=child::text,'poll preserves attempt and child identity');
 perform public.finish_weekly_source_sync_job(rid,j,(claim->>'token')::uuid,'{"outcome":"succeeded","staged":5}');
 perform public.fixture_assert((select status='succeeded' and items_staged=5 from public.weekly_source_sync_jobs where id=j),'terminal child result is recorded once');
 update public.pipeline_runs set started_at=now()-interval '3 days' where id=rid;
 perform public.recover_weekly_source_sync_jobs();
 perform public.fixture_assert((select status='failed' and completed_at is not null from public.pipeline_runs where id=rid),'parent timeout terminates honestly');
end $$;

-- Worker-level suspension recovers when enabled, while human pauses remain off.
do $$
declare d uuid;rid uuid;
begin
 select id into d from public.pipeline_definitions where name='weekly-data-source-sync';
 update public.workflow_definitions set is_enabled=false where name='weekly-source-sync-worker';
 rid:=(public.start_weekly_source_sync(d,'{}')->>'run_id')::uuid;
 perform public.fixture_assert((select status='paused' from public.pipeline_runs where id=rid),'disabled worker suspends parent');
 update public.workflow_definitions set is_enabled=true where name='weekly-source-sync-worker';
 perform public.start_weekly_source_sync(d,'{}');
 perform public.fixture_assert((select status='running' from public.pipeline_runs where id=rid),'manual start resumes system suspension after worker enable');
 update public.pipeline_runs set status='paused',error_message='Manually paused' where id=rid;
 perform public.recover_weekly_source_sync_jobs();
 perform public.fixture_assert((select status='paused' from public.pipeline_runs where id=rid),'human pause is preserved');
 update public.pipeline_runs set status='cancelled' where id=rid;
end $$;

do $$
begin
 perform public.fixture_assert((select action->>'jobname'='pipeline-weekly-data-source-sync' and schedule='0 6 * * 0'
   and conditions='[]'::jsonb from public.admin_automations where slug='weekly_data_source_sync'),'native automation registration');
 update public.admin_automations set enabled=false where slug='weekly_data_source_sync';
 update public.pipeline_definitions set schedule='0 8 * * 1' where name='weekly-data-source-sync';
 perform public.fixture_assert((select not enabled and schedule='0 8 * * 1' from public.admin_automations where slug='weekly_data_source_sync'),'schedule edit preserves automation pause');
 update public.pipeline_definitions set is_enabled=false where name='weekly-data-source-sync';
 update public.pipeline_definitions set is_enabled=true where name='weekly-data-source-sync';
 perform public.fixture_assert((select enabled from public.admin_automations where slug='weekly_data_source_sync'),'explicit enable restores schedule');
 perform public.fixture_assert(not has_function_privilege('anon','public.start_weekly_source_sync(uuid,jsonb)','EXECUTE'),'anon cannot start worker RPC');
 perform public.fixture_assert(not has_function_privilege('authenticated','public.finish_weekly_source_sync_job(uuid,uuid,uuid,jsonb)','EXECUTE'),'browser cannot forge outcomes');
 perform public.fixture_assert(has_function_privilege('service_role','public.claim_weekly_source_sync_job(uuid,uuid)','EXECUTE'),'service worker can claim');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.fixture_assert((select count(*)=0 from public.weekly_source_sync_jobs),'non-admin cannot read source results');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.fixture_assert((select count(*)>1000 from public.weekly_source_sync_jobs),'admin can read complete source audit');
reset role;
'''

def main():
    with tempfile.TemporaryDirectory(prefix='qg-weekly-', dir='/tmp') as tmp:
        data, sock = Path(tmp) / 'data', Path(tmp) / 'sock'
        sock.mkdir()
        subprocess.run([str(PG / 'initdb'), '-D', str(data), '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, stdout=subprocess.DEVNULL)
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'pg.log'), '-o', f'-k {sock} -p 55481 -h ""', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
        try:
            psql = [str(PG / 'psql'), '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-h', str(sock), '-p', '55481', '-U', 'postgres', '-d', 'postgres']
            subprocess.run(psql, input=SCHEMA, text=True, check=True)
            subprocess.run(psql + ['-f', str(MIGRATION)], check=True)
            subprocess.run(psql, input=CHECKS, text=True, check=True)
            print('Weekly source sync: inventory, leases, retries, completion, scheduling and authorization passed.')
        finally:
            subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)

if __name__ == '__main__':
    main()
