-- Aggregate dry-run across every enabled automation in one round-trip.
-- Used by the 'Dry-run all automations' Cmd-K action and the same-named
-- header button on /admin/automation. Lets admins answer "what's the
-- system going to change tonight?" without N HTTP calls.

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_result jsonb;
  v_total int := 0;
  v_count int := 0;
  v_per_slug jsonb := '{}'::jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  FOR v_rec IN
    SELECT slug FROM public.admin_automations WHERE enabled = true ORDER BY slug
  LOOP
    BEGIN
      v_result := public.admin_automation_dry_run(v_rec.slug);
      v_per_slug := v_per_slug || jsonb_build_object(
        v_rec.slug, (v_result->>'would_change')::int
      );
      v_total := v_total + COALESCE((v_result->>'would_change')::int, 0);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_per_slug := v_per_slug || jsonb_build_object(
        v_rec.slug, jsonb_build_object('error', SQLERRM)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'automations_examined', v_count,
    'total_would_change', v_total,
    'per_slug', v_per_slug
  );
END;
$$;

ALTER FUNCTION public.admin_automation_dry_run_all() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_automation_dry_run_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_automation_dry_run_all() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_dry_run_all() TO authenticated;
