-- Keep one automation run record per postal drain invocation. Preserve an
-- incident pause and the configured batch size while removing an old duplicate
-- admin_automation_run_begin call from the cron command and registry.
DO $$
DECLARE
  v_job record;
  v_admin_command text;
  v_command text;
  v_call_count integer;
  v_duplicate constant text := 'SELECT public.admin_automation_run_begin(''geo_address_drain'', 1); SELECT public.admin_automation_run_begin(''geo_address_drain'', 1);';
  v_single constant text := 'SELECT public.admin_automation_run_begin(''geo_address_drain'', 1);';
BEGIN
  SELECT jobid, schedule, command, active
    INTO v_job
    FROM cron.job
   WHERE jobname = 'geo_address_drain';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'geo_address_drain cron is missing';
  END IF;

  SELECT action->>'command'
    INTO v_admin_command
    FROM public.admin_automations
   WHERE slug = 'geo_address_drain'
     AND enabled = v_job.active
     AND lifecycle_state = CASE WHEN v_job.active THEN 'active' ELSE 'paused' END;
  IF NOT FOUND OR v_admin_command IS DISTINCT FROM v_job.command THEN
    RAISE EXCEPTION 'geo_address_drain admin command or pause state differs from cron';
  END IF;

  SELECT count(*) INTO v_call_count
    FROM regexp_matches(v_job.command, 'admin_automation_run_begin', 'g');
  IF v_call_count = 1 THEN
    RETURN;
  END IF;
  IF v_call_count <> 2 OR position(v_duplicate IN v_job.command) = 0 THEN
    RAISE EXCEPTION 'Unexpected geo_address_drain run-begin command';
  END IF;

  v_command := replace(v_job.command, v_duplicate, v_single);
  SELECT count(*) INTO v_call_count
    FROM regexp_matches(v_command, 'admin_automation_run_begin', 'g');
  IF v_call_count <> 1 THEN
    RAISE EXCEPTION 'geo_address_drain still has multiple run-begin calls';
  END IF;

  PERFORM cron.alter_job(
    job_id := v_job.jobid,
    command := v_command,
    active := v_job.active
  );

  UPDATE public.admin_automations
     SET action = jsonb_set(action, '{command}', to_jsonb(v_command), true),
         updated_at = now()
   WHERE slug = 'geo_address_drain'
     AND action->>'command' = v_job.command
     AND enabled = v_job.active
     AND lifecycle_state = CASE WHEN v_job.active THEN 'active' ELSE 'paused' END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'geo_address_drain admin command was not updated';
  END IF;
END;
$$;
