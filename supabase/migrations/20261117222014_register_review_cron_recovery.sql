-- Persist the existing command so native cron synchronization can recreate a
-- Review job removed by auto-pause. Preserve the registry enable/disable switch.
do $recovery$
declare r public.admin_automations;before_row jsonb;after_row jsonb;
 old_job jsonb;new_job jsonb;desired jsonb;created boolean:=false;
 command text:='set statement_timeout=''90s''; select public.run_review_automatic_resolution(200,false);';
begin
 select * into r from public.admin_automations where slug='review_automatic_resolution' for update;
 if not found then raise exception 'Review automation is missing';end if;
 if r.action->>'fn' is distinct from 'run_review_automatic_resolution'
  or r.action->'args' is distinct from '{"p_batch":200,"p_dry_run":false}'::jsonb
  or coalesce(r.action->>'type','') not in ('rpc','cron')
  or (r.action->>'command' is not null and r.action->>'command'<>command)
  or (r.action->>'jobname' is not null and r.action->>'jobname'<>r.slug)
 then raise exception 'Custom Review automation action; inspect before replacing';end if;
 before_row:=to_jsonb(r);
 select jsonb_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'command',j.command,'active',active) into old_job
 from cron.job j where jobname=r.slug;
 desired:=r.action||jsonb_build_object('type','cron','jobname',r.slug,'command',command);
 if r.action is distinct from desired then
  update public.admin_automations set action=desired,updated_at=now() where id=r.id;
 end if;
 if r.enabled and old_job is null then
  if nullif(btrim(r.schedule),'') is null then raise exception 'Review schedule missing';end if;
  perform cron.schedule(r.slug,r.schedule,public.admin_automation_effective_command(r.slug,command));
  created:=true;
 end if;
 select to_jsonb(a) into after_row from public.admin_automations a where id=r.id;
 if after_row-array['action','updated_at'] is distinct from before_row-array['action','updated_at'] then raise exception 'Automation controls changed';end if;
 select jsonb_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'command',j.command,'active',active) into new_job from cron.job j where jobname=r.slug;
 if r.action is distinct from desired or created then
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
  values('automation',r.id,'codex_source_pass15_cron_recovery',jsonb_build_object('record',before_row,'cron',old_job),
   jsonb_build_object('record',after_row,'cron',new_job,'note','Register the existing bounded command for native cron recovery. Enable state, schedule, counters and other jobs preserved.'));
 end if;
end $recovery$;
