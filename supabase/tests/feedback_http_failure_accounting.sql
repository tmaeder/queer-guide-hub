BEGIN;
DO $$ DECLARE a uuid; r bigint; BEGIN
  SELECT id INTO a FROM public.admin_automations WHERE slug='pipeline_geo_validate';
  INSERT INTO public.admin_automation_runs(automation_id,automation_slug,status,started_at) VALUES(a,'pipeline_geo_validate','running',now()) RETURNING id INTO r;
  INSERT INTO public.admin_automation_run_requests(request_id,run_id,url,timeout_ms) VALUES(-487999,r,'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-geo-validate',60000);
  INSERT INTO net._http_response(id,status_code,content,timed_out) VALUES(-487999,200,'{"success":false,"errors":3}',false);
  PERFORM public.admin_automation_reap_runs(120);
  IF NOT EXISTS(SELECT 1 FROM public.admin_automation_runs WHERE id=r AND status='error') THEN RAISE EXCEPTION 'HTTP 200 logical failure was counted as success'; END IF;
  IF private.automation_response_failed('bad json') THEN RAISE EXCEPTION 'Non-JSON parsing failed'; END IF;
END $$;
SELECT 'HTTP 200 logical failures correctly recorded as errors' result;
ROLLBACK;
