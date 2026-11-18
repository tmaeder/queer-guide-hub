update public.pipeline_definitions set timeout_seconds=86400 where name='outxout-catalogue-sync';
create or replace function public.outxout_claim(p_run uuid,p_token uuid) returns jsonb language plpgsql set search_path=public as $$
declare r outxout_sync_runs%rowtype; jobs jsonb;run_state text;
begin
 select * into r from outxout_sync_runs where id=p_run for update;
 if not found then raise exception 'run_not_found';end if;
 select status into run_state from pipeline_runs where id=p_run;
 if run_state in('cancelled','failed') then
  update outxout_sync_runs set phase='failed',error='pipeline_'||run_state,lease_until=null where id=p_run and phase in('collect','process');
  return jsonb_build_object('phase',run_state,'jobs','[]'::jsonb);
 end if;
 if run_state='paused' then return jsonb_build_object('phase','paused','jobs','[]'::jsonb);end if;
 if r.phase not in('collect','process') then return jsonb_build_object('phase',r.phase,'jobs','[]'::jsonb);end if;
 if r.lease_until>now() and r.lease_token is distinct from p_token then return jsonb_build_object('busy',true);end if;
 update outxout_sync_runs set lease_token=p_token,lease_until=now()+interval '110 seconds',heartbeat_at=now() where id=p_run;
 update pipeline_runs set updated_at=now() where id=p_run and status='running';
 -- Catalogue/API observations supersede redundant detail downloads, not missing pages.
 update outxout_sync_work w set status='done',completed_at=now() where w.run_id=p_run and w.status='pending' and w.kind='detail'
 and exists(select 1 from outxout_sync_entities e where e.last_seen_run=p_run and 'https://outxout.com/'||e.source_entity_id=w.url);
 select coalesce(jsonb_agg(to_jsonb(w)),'[]') into jobs from(select * from outxout_sync_work where run_id=p_run and status='pending' and retry_at<=now() order by priority,id limit 12)w;
 if jobs='[]' and not exists(select 1 from outxout_sync_work where run_id=p_run and status='pending') then
  if exists(select 1 from outxout_sync_work where run_id=p_run and status='failed') then
   update outxout_sync_runs set phase='failed',error='source_work_failed_after_retries',lease_until=null where id=p_run;
   update pipeline_runs set status='failed',error_message='Out x Out source work failed; inspect outxout_sync_work',completed_at=now(),updated_at=now() where id=p_run;
   return jsonb_build_object('phase','failed','jobs','[]'::jsonb);
  end if;
  update outxout_sync_runs set phase='process' where id=p_run;r.phase:='process';
 end if;
 return jsonb_build_object('phase',r.phase,'jobs',jobs,'scope',r.scope);
end $$;

create or replace function public.outxout_tick(p_start boolean default false) returns bigint language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare rid uuid;local_now timestamp;due timestamp;request_id bigint;
begin
 perform pg_advisory_xact_lock(hashtext('outxout-sync-tick'));
 update outxout_sync_runs r set phase='failed',error='pipeline_'||p.status,lease_until=null from pipeline_runs p where r.id=p.id and r.phase in('collect','process') and p.status in('cancelled','failed');
 select id into rid from outxout_sync_runs where phase in('collect','process') limit 1;
 local_now:=now() at time zone 'Europe/Zurich';due:=date_trunc('week',local_now)+interval '2 days 8 hours';
 if rid is null and p_start and local_now>=due and not exists(select 1 from outxout_sync_runs where scope='catalogue' and created_at>=due at time zone 'Europe/Zurich') then rid:=outxout_open_run('cron');end if;
 if rid is null then return null;end if;
 if not exists(select 1 from pipeline_runs where id=rid and status='running') then return null;end if;
 if exists(select 1 from outxout_sync_runs where id=rid and lease_until>now()) then return null;end if;
 select net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-outxout',headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),body:=jsonb_build_object('run_id',rid),timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;