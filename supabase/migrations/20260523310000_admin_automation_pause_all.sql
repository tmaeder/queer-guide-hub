-- Phase γ: pause-all kill switch.
-- Admin-only RPC that flips enabled=p_enabled across all admin_automations.
-- Returns the count of rows flipped (and the new state). Used by the
-- 'Pause all automations' / 'Resume all automations' Cmd-K actions for
-- emergency situations (suspected data corruption, hot-fix in progress).

CREATE OR REPLACE FUNCTION public.admin_automation_pause_all(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  WITH upd AS (
    UPDATE public.admin_automations
    SET enabled = p_enabled
    WHERE enabled <> p_enabled
    RETURNING id
  )
  SELECT count(*) INTO v_changed FROM upd;

  RETURN jsonb_build_object('changed', v_changed, 'enabled', p_enabled);
END;
$$;

ALTER FUNCTION public.admin_automation_pause_all(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_automation_pause_all(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_automation_pause_all(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_pause_all(boolean) TO authenticated;
