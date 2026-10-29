-- Restore a bounded drain after taxonomy validation. Count actual native
-- outcomes: rejected/error rows must never be reported as committed listings.
create or replace function public.run_marketplace_commit_drain(p_batch integer default 400)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_automation_id uuid;v_run_id bigint;v_enabled boolean;
 v_started_at timestamptz:=clock_timestamp();v_committed integer:=0;v_failed integer:=0;
 v_noop integer:=0;v_examined integer:=0;v_pending integer:=0;v_status text;
begin
 p_batch:=least(50,greatest(0,coalesce(p_batch,50)));
 if not pg_try_advisory_xact_lock(hashtext('marketplace_commit_drain')) then
  return jsonb_build_object('skipped',true,'reason','already_running');end if;
 select id,enabled into v_automation_id,v_enabled from public.admin_automations where slug='marketplace_commit_drain';
 insert into public.admin_automation_runs(automation_id,automation_slug,started_at,status,items_examined,items_changed)
 values(v_automation_id,'marketplace_commit_drain',v_started_at,'success',0,0) returning id into v_run_id;
 if v_enabled is distinct from true then
  update public.admin_automation_runs set finished_at=clock_timestamp(),summary=jsonb_build_object('skipped',true,'reason','paused') where id=v_run_id;
  return jsonb_build_object('skipped',true,'reason','paused');end if;
 with outcomes as materialized(select * from public.commit_marketplace_staging_batch(p_batch,null))
 select count(*) filter(where action in('inserted','updated')),count(*) filter(where action in('error','rejected')),
  count(*) filter(where action='noop'),count(*) into v_committed,v_failed,v_noop,v_examined from outcomes;
 select count(*) into v_pending from public.ingestion_staging s where s.target_table='marketplace_listings' and s.disposition='pending'
  and s.ai_validation_status='approved' and s.classification_result @> '{"lgbti_relevant":true}'::jsonb
  and (s.dedup_status in('unique','duplicate') or s.dedup_status is null or(s.dedup_status='merge_candidate' and s.dedup_match_id is not null))
  and s.review_status in('auto','approved');
 v_status:=case when v_failed>0 and v_committed=0 then 'error' else 'success' end;
 update public.admin_automation_runs set finished_at=clock_timestamp(),status=v_status,items_examined=v_examined,items_changed=v_committed,
  summary=jsonb_build_object('committed',v_committed,'failed',v_failed,'noop',v_noop,'pending',v_pending,'batch',p_batch)
 where id=v_run_id;
 update public.admin_automations set last_run_at=v_started_at,last_run_status=v_status where id=v_automation_id;
 return jsonb_build_object('committed',v_committed,'failed',v_failed,'noop',v_noop,'examined',v_examined,'pending',v_pending,'batch',p_batch);
exception when others then
 update public.admin_automation_runs set finished_at=clock_timestamp(),status='error',error=sqlerrm where id=v_run_id;
 update public.admin_automations set last_run_at=v_started_at,last_run_status='error' where id=v_automation_id;
 return jsonb_build_object('error',sqlerrm);
end $$;
