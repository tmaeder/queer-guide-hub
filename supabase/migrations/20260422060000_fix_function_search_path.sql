-- Pin search_path on functions flagged by Supabase advisor (rule 0011).
-- Functions with mutable search_path are a SECURITY DEFINER / injection risk.

ALTER FUNCTION public.commit_venue_staging_item(uuid, text)
  SET search_path = public, pg_catalog, extensions;

ALTER FUNCTION public.commit_village_staging_batch(int)
  SET search_path = public, pg_catalog, extensions;

ALTER FUNCTION public.tg_close_feedback_on_alert_resolve()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.fn_pipeline_run_failure_handler()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.fn_pipeline_run_success_handler()
  SET search_path = public, pg_catalog;
