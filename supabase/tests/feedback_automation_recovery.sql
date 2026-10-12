-- Run after feedback_automation_recovery migration; all fixture work rolls back.
BEGIN;
DO $test$
DECLARE a uuid; r bigint; c uuid;
BEGIN
  SELECT id INTO a FROM public.admin_automations WHERE slug='pipeline_geo_validate';
  INSERT INTO public.admin_automation_runs(automation_id,automation_slug,status,started_at,finished_at,error)
    VALUES(a,'pipeline_geo_validate','error',now(),now()+interval '1 second','feedback recovery rollback test') RETURNING id INTO r;
  SELECT id INTO c FROM public.community_submissions WHERE fingerprint='automation:pipeline_geo_validate' AND content_type='api_error';
  IF c IS NULL THEN RAISE EXCEPTION 'Failure did not produce feedback'; END IF;
  INSERT INTO public.admin_automation_runs(automation_id,automation_slug,status,started_at,finished_at)
    VALUES(a,'pipeline_geo_validate','success',now()+interval '1 minute',now()+interval '2 minutes');
  IF NOT EXISTS(SELECT 1 FROM public.community_submissions WHERE id=c AND feedback_status='done' AND resolution='fixed') THEN RAISE EXCEPTION 'Later success did not resolve'; END IF;
  INSERT INTO public.admin_automation_runs(automation_id,automation_slug,status,started_at,finished_at,error)
    VALUES(a,'pipeline_geo_validate','error',now()+interval '3 minutes',now()+interval '4 minutes','recurrence rollback test');
  IF EXISTS(SELECT 1 FROM public.community_submissions WHERE id=c AND feedback_status='done') THEN RAISE EXCEPTION 'Recurrence did not reopen'; END IF;
  INSERT INTO public.admin_automation_runs(automation_id,automation_slug,status,started_at,finished_at)
    VALUES(a,'pipeline_geo_validate','success',now()+interval '150 seconds',now()+interval '5 minutes');
  IF EXISTS(SELECT 1 FROM public.community_submissions WHERE id=c AND feedback_status='done') THEN RAISE EXCEPTION 'Late old success incorrectly resolved newer failure'; END IF;
END $test$;
SELECT 'Automation recovery, recurrence, and out-of-order success assertions passed' AS result;
ROLLBACK;
