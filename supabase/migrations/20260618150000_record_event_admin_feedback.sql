-- Admin feedback signal for events. The trust composite reserves a 10%
-- admin_feedback dimension that is "present iff a signal exists" (migration
-- 20260618130000) — but nothing wrote that signal, so it never activated. This
-- RPC lets an admin record a verify/flag verdict from /admin/events: it appends
-- an admin_feedback signal (the next nightly run_event_trust_recompute folds it
-- in), and on a positive verdict clears needs_attention + stamps verification.
CREATE OR REPLACE FUNCTION public.record_event_admin_feedback(
  p_event_id uuid,
  p_value numeric DEFAULT 1.0,
  p_clear_attention boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_val numeric := greatest(0.0, least(1.0, coalesce(p_value, 1.0)));
BEGIN
  PERFORM public.assert_admin_or_internal();

  INSERT INTO public.event_quality_signals (event_id, signal_type, value, source, details)
  VALUES (p_event_id, 'admin_feedback', v_val, 'admin', jsonb_build_object('at', now()));

  UPDATE public.events SET
    needs_attention = CASE WHEN p_clear_attention AND v_val >= 0.5 THEN false ELSE needs_attention END,
    verification_status = CASE WHEN v_val >= 0.8 THEN 'verified' ELSE verification_status END,
    last_verified_at = now()
  WHERE id = p_event_id AND duplicate_of_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_event_admin_feedback(uuid, numeric, boolean) TO authenticated, service_role;
