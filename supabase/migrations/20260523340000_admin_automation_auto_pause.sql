-- Self-defense for automations: auto-pause after N consecutive errors.
--
-- Adds a consecutive_failures counter on admin_automations + a
-- finalize_run() helper that every runner calls in its EXCEPTION block.
-- After 3 errors in a row, the rule is auto-disabled (enabled=false) and
-- written to the audit log with reason='auto_paused'.

ALTER TABLE public.admin_automations
  ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0;

ALTER TABLE public.admin_automations
  ADD COLUMN IF NOT EXISTS auto_pause_threshold int NOT NULL DEFAULT 3;

CREATE OR REPLACE FUNCTION public.admin_automation_record_success(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_automations
  SET consecutive_failures = 0,
      last_run_at = now(),
      last_run_status = 'success'
  WHERE id = p_id;
END;
$$;

-- Returns true if this failure tripped the auto-pause threshold.
CREATE OR REPLACE FUNCTION public.admin_automation_record_failure(p_id uuid, p_run_id bigint, p_error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_failures int;
  v_threshold int;
  v_tripped boolean := false;
BEGIN
  UPDATE public.admin_automations
  SET consecutive_failures = consecutive_failures + 1,
      last_run_at = now(),
      last_run_status = 'error'
  WHERE id = p_id
  RETURNING consecutive_failures, auto_pause_threshold
  INTO v_now_failures, v_threshold;

  IF v_now_failures >= v_threshold THEN
    UPDATE public.admin_automations
    SET enabled = false,
        last_run_status = 'auto_paused'
    WHERE id = p_id;

    v_tripped := true;

    -- Stamp the audit row with the auto-pause reason for visibility.
    UPDATE public.admin_automation_runs
    SET summary = COALESCE(summary, '{}'::jsonb)
                  || jsonb_build_object(
                       'auto_paused', true,
                       'reason', 'consecutive_failures >= ' || v_threshold,
                       'consecutive_failures', v_now_failures
                     )
    WHERE id = p_run_id;
  END IF;

  UPDATE public.admin_automation_runs
  SET finished_at = now(),
      status = 'error',
      error = p_error
  WHERE id = p_run_id;

  RETURN v_tripped;
END;
$$;

ALTER FUNCTION public.admin_automation_record_success(uuid) OWNER TO postgres;
ALTER FUNCTION public.admin_automation_record_failure(uuid, bigint, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_automation_record_success(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_automation_record_failure(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_automation_record_success(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_automation_record_failure(uuid, bigint, text) TO service_role;
-- These helpers are server-only — runners are SECURITY DEFINER and call
-- via PL/pgSQL. No grant to authenticated.

-- Trigger that wires the helpers into every run automatically — no runner
-- code changes needed. Fires BEFORE UPDATE so we can mutate NEW.summary
-- on the same row that tripped the threshold.

CREATE OR REPLACE FUNCTION public.admin_automation_runs_after_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_failures int;
  v_threshold int;
BEGIN
  IF NEW.finished_at IS NULL OR (OLD.finished_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'error' THEN
    UPDATE public.admin_automations
    SET consecutive_failures = consecutive_failures + 1
    WHERE id = NEW.automation_id
    RETURNING consecutive_failures, auto_pause_threshold
    INTO v_now_failures, v_threshold;

    IF v_now_failures IS NOT NULL AND v_now_failures >= v_threshold THEN
      UPDATE public.admin_automations
      SET enabled = false,
          last_run_status = 'auto_paused'
      WHERE id = NEW.automation_id;

      NEW.summary := COALESCE(NEW.summary, '{}'::jsonb)
                     || jsonb_build_object(
                          'auto_paused', true,
                          'reason', 'consecutive_failures >= ' || v_threshold,
                          'consecutive_failures', v_now_failures
                        );
    END IF;
  ELSIF NEW.status = 'success' THEN
    UPDATE public.admin_automations
    SET consecutive_failures = 0
    WHERE id = NEW.automation_id AND consecutive_failures > 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_automation_runs_after_finish_trg ON public.admin_automation_runs;
CREATE TRIGGER admin_automation_runs_after_finish_trg
  BEFORE UPDATE ON public.admin_automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_automation_runs_after_finish();

-- Toggle-enabled RPC resets the failure counter so admins can manually
-- "unstick" an auto-paused rule.
CREATE OR REPLACE FUNCTION public.admin_automation_set_enabled(p_slug text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  UPDATE public.admin_automations
  SET enabled = p_enabled,
      consecutive_failures = CASE WHEN p_enabled THEN 0 ELSE consecutive_failures END
  WHERE slug = p_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023';
  END IF;

  RETURN jsonb_build_object('slug', p_slug, 'enabled', p_enabled);
END;
$$;
