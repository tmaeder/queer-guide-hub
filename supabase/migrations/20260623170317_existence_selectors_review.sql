-- Existence Truth Engine — M3 selectors + review/reopen RPCs (2026-06-23)
--
-- Work-list selectors for the collectors, plus the admin-facing approve / reject /
-- reopen / batch RPCs. Terminal application + reopen are factored into two internal
-- helpers so the engine, the admin actions, and batch-approve all behave identically.

-- ---------- internal helpers ----------
CREATE OR REPLACE FUNCTION public._existence_apply_archive(
  p_entity_type text, p_entity_id uuid, p_reason text,
  p_signals jsonb DEFAULT '{}'::jsonb, p_actor uuid DEFAULT NULL
) RETURNS bigint
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_prev jsonb; v_aid bigint;
BEGIN
  IF p_entity_type = 'venue' THEN
    SELECT jsonb_build_object('closed_at', null, 'seo_indexable', seo_indexable)
      INTO v_prev FROM public.venues WHERE id=p_entity_id;
    UPDATE public.venues SET closed_at=now(), needs_attention=true, updated_at=now()
      WHERE id=p_entity_id AND closed_at IS NULL;
  ELSIF p_entity_type = 'event' THEN
    SELECT jsonb_build_object('status', status, 'liveness_status', liveness_status, 'seo_indexable', seo_indexable)
      INTO v_prev FROM public.events WHERE id=p_entity_id;
    UPDATE public.events SET status='cancelled', liveness_status='dead_link',
      seo_indexable=false, needs_attention=true, updated_at=now()
      WHERE id=p_entity_id AND status <> 'cancelled';
  ELSIF p_entity_type = 'marketplace' THEN
    SELECT jsonb_build_object('status', status, 'deprecated_at', deprecated_at)
      INTO v_prev FROM public.marketplace_listings WHERE id=p_entity_id;
    UPDATE public.marketplace_listings SET status='inactive', updated_at=now()
      WHERE id=p_entity_id AND status IN ('active','sold_out');
  ELSE
    RAISE EXCEPTION 'invalid entity_type %', p_entity_type;
  END IF;

  INSERT INTO public.entity_existence_audit (entity_type, entity_id, action, reason, signals, prev_state, created_by)
  VALUES (p_entity_type, p_entity_id, 'archive', p_reason, p_signals, v_prev, p_actor)
  RETURNING id INTO v_aid;
  RETURN v_aid;
END; $function$;

CREATE OR REPLACE FUNCTION public._existence_apply_reopen(
  p_entity_type text, p_entity_id uuid, p_actor uuid DEFAULT NULL
) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_aid bigint; v_prev jsonb;
BEGIN
  SELECT id, prev_state INTO v_aid, v_prev
  FROM public.entity_existence_audit
  WHERE entity_type=p_entity_type AND entity_id=p_entity_id AND action='archive' AND reverted_at IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF v_aid IS NULL THEN RETURN false; END IF;

  IF p_entity_type = 'venue' THEN
    UPDATE public.venues SET closed_at=NULL, needs_attention=true, updated_at=now() WHERE id=p_entity_id;
  ELSIF p_entity_type = 'event' THEN
    UPDATE public.events SET
      status=coalesce(v_prev->>'status','active'),
      liveness_status=coalesce(v_prev->>'liveness_status','unknown'),
      seo_indexable=coalesce((v_prev->>'seo_indexable')::boolean, true),
      needs_attention=true, updated_at=now() WHERE id=p_entity_id;
  ELSIF p_entity_type = 'marketplace' THEN
    UPDATE public.marketplace_listings SET
      status=coalesce(v_prev->>'status','active'), deprecated_at=NULL, updated_at=now()
      WHERE id=p_entity_id;
  END IF;

  UPDATE public.entity_existence_audit SET reverted_at=now(), reverted_by=p_actor WHERE id=v_aid;
  INSERT INTO public.entity_existence_signals (entity_type, entity_id, signal_kind, verdict, weight, source, details)
  VALUES (p_entity_type, p_entity_id, 'admin', 'alive', 1.0, 'existence_reopen',
          jsonb_build_object('actor', p_actor));
  RETURN true;
END; $function$;

-- ---------- selectors (collectors call these) ----------
  UPDATE public.entity_existence_audit SET reverted_at=now(), reverted_by=p_actor WHERE id=v_aid;
  INSERT INTO public.entity_existence_signals (entity_type, entity_id, signal_kind, verdict, weight, source, details)
  VALUES (p_entity_type, p_entity_id, 'admin', 'alive', 1.0, 'existence_reopen', jsonb_build_object('actor', p_actor));
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.venues_due_for_existence_check(p_limit int DEFAULT 50)
 RETURNS TABLE(id uuid, website text, latitude numeric, longitude numeric, check_reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  WITH last_chk AS (
    SELECT entity_id, max(observed_at) seen,
           bool_or(verdict IN ('dead','dying')) has_dead
    FROM public.entity_existence_signals WHERE entity_type='venue' GROUP BY entity_id
  )
  SELECT v.id, v.website, v.latitude, v.longitude,
    CASE WHEN lc.entity_id IS NULL THEN 'never_checked'
         WHEN lc.has_dead THEN 'dead_signal'
         ELSE 'oldest' END
    SELECT entity_id, max(observed_at) seen, bool_or(verdict IN ('dead','dying')) has_dead
    FROM public.entity_existence_signals WHERE entity_type='venue' GROUP BY entity_id
  )
  SELECT v.id, v.website, v.latitude, v.longitude,
    CASE WHEN lc.entity_id IS NULL THEN 'never_checked' WHEN lc.has_dead THEN 'dead_signal' ELSE 'oldest' END
  FROM public.venues v
  LEFT JOIN last_chk lc ON lc.entity_id=v.id
  WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL
    AND (v.website IS NOT NULL OR (v.latitude IS NOT NULL AND v.longitude IS NOT NULL))
  ORDER BY (lc.seen IS NOT NULL), (NOT coalesce(lc.has_dead,false)), lc.seen ASC NULLS FIRST
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

CREATE OR REPLACE FUNCTION public.events_due_for_existence_check(p_limit int DEFAULT 50)
 RETURNS TABLE(id uuid, website text, check_reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  WITH last_chk AS (
    SELECT entity_id, max(observed_at) seen,
           bool_or(verdict IN ('dead','dying')) has_dead
    FROM public.entity_existence_signals WHERE entity_type='event' GROUP BY entity_id
  )
  SELECT e.id, e.website,
    CASE WHEN lc.entity_id IS NULL THEN 'never_checked'
         WHEN lc.has_dead THEN 'dead_signal' ELSE 'oldest' END
  FROM public.events e
  LEFT JOIN last_chk lc ON lc.entity_id=e.id
  WHERE e.duplicate_of_id IS NULL AND e.status NOT IN ('cancelled','completed')
    AND e.website IS NOT NULL
    SELECT entity_id, max(observed_at) seen, bool_or(verdict IN ('dead','dying')) has_dead
    FROM public.entity_existence_signals WHERE entity_type='event' GROUP BY entity_id
  )
  SELECT e.id, e.website,
    CASE WHEN lc.entity_id IS NULL THEN 'never_checked' WHEN lc.has_dead THEN 'dead_signal' ELSE 'oldest' END
  FROM public.events e
  LEFT JOIN last_chk lc ON lc.entity_id=e.id
  WHERE e.duplicate_of_id IS NULL AND e.status NOT IN ('cancelled','completed') AND e.website IS NOT NULL
  ORDER BY (lc.seen IS NOT NULL), (NOT coalesce(lc.has_dead,false)), lc.seen ASC NULLS FIRST
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_due_for_existence_check(p_limit int DEFAULT 50)
 RETURNS TABLE(id uuid, external_url text, check_reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  WITH last_chk AS (
    SELECT entity_id, max(observed_at) seen,
           bool_or(verdict IN ('dead','dying')) has_dead
    FROM public.entity_existence_signals WHERE entity_type='marketplace' GROUP BY entity_id
  )
  SELECT m.id, coalesce(m.external_url, m.affiliate_url),
    CASE WHEN lc.entity_id IS NULL THEN 'never_checked'
         WHEN lc.has_dead THEN 'dead_signal' ELSE 'oldest' END
    SELECT entity_id, max(observed_at) seen, bool_or(verdict IN ('dead','dying')) has_dead
    FROM public.entity_existence_signals WHERE entity_type='marketplace' GROUP BY entity_id
  )
  SELECT m.id, coalesce(m.external_url, m.affiliate_url),
    CASE WHEN lc.entity_id IS NULL THEN 'never_checked' WHEN lc.has_dead THEN 'dead_signal' ELSE 'oldest' END
  FROM public.marketplace_listings m
  LEFT JOIN last_chk lc ON lc.entity_id=m.id
  WHERE m.duplicate_of_id IS NULL AND m.status IN ('active','sold_out')
    AND coalesce(m.external_url, m.affiliate_url) IS NOT NULL
  ORDER BY (lc.seen IS NOT NULL), (NOT coalesce(lc.has_dead,false)), lc.seen ASC NULLS FIRST
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

-- ---------- admin review / reopen ----------
CREATE OR REPLACE FUNCTION public.existence_approve_archive(p_audit_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
CREATE OR REPLACE FUNCTION public.existence_approve_archive(p_audit_id bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_type text; v_id uuid; v_sig jsonb; v_actor uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_actor,'admin'::app_role) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT entity_type, entity_id, signals INTO v_type, v_id, v_sig
    FROM public.entity_existence_audit
    WHERE id=p_audit_id AND action='flag' AND reverted_at IS NULL FOR UPDATE;
    FROM public.entity_existence_audit WHERE id=p_audit_id AND action='flag' AND reverted_at IS NULL FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'no open flag audit %', p_audit_id; END IF;
  PERFORM public._existence_apply_archive(v_type, v_id, 'admin_approved', v_sig, v_actor);
  UPDATE public.entity_existence_audit SET reverted_at=now(), reverted_by=v_actor WHERE id=p_audit_id;
  RETURN jsonb_build_object('archived', true, 'entity_type', v_type, 'entity_id', v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.existence_reject_archive(p_audit_id bigint, p_reason text DEFAULT 'admin_says_alive')
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_type text; v_id uuid; v_actor uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_actor,'admin'::app_role) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT entity_type, entity_id INTO v_type, v_id
    FROM public.entity_existence_audit
    WHERE id=p_audit_id AND action='flag' AND reverted_at IS NULL FOR UPDATE;
    FROM public.entity_existence_audit WHERE id=p_audit_id AND action='flag' AND reverted_at IS NULL FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'no open flag audit %', p_audit_id; END IF;
  INSERT INTO public.entity_existence_signals (entity_type, entity_id, signal_kind, verdict, weight, source, details)
  VALUES (v_type, v_id, 'admin', 'alive', 1.0, 'existence_reject', jsonb_build_object('reason', p_reason, 'actor', v_actor));
  IF v_type='venue' THEN UPDATE public.venues SET needs_attention=false WHERE id=v_id;
  ELSIF v_type='event' THEN UPDATE public.events SET needs_attention=false WHERE id=v_id;
  END IF;
  UPDATE public.entity_existence_audit SET reverted_at=now(), reverted_by=v_actor, reason=p_reason WHERE id=p_audit_id;
  RETURN jsonb_build_object('dismissed', true, 'entity_type', v_type, 'entity_id', v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.existence_reopen(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_ok boolean; v_actor uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_actor,'admin'::app_role) THEN RAISE EXCEPTION 'admin only'; END IF;
  v_ok := public._existence_apply_reopen(p_entity_type, p_entity_id, v_actor);
  RETURN jsonb_build_object('reopened', v_ok);
END; $function$;

-- Batch-approve only the GUARDED-but-2-strong flags (the engine withheld them for
-- safety, not because the evidence is weak). Single-signal flags stay human-gated.
CREATE OR REPLACE FUNCTION public.batch_approve_safe_existence(
  p_entity_type text, p_limit int DEFAULT 100, p_dry_run boolean DEFAULT false
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
CREATE OR REPLACE FUNCTION public.batch_approve_safe_existence(
  p_entity_type text, p_limit int DEFAULT 100, p_dry_run boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_n int := 0; r record;
BEGIN
  IF NOT public.has_role(v_actor,'admin'::app_role) THEN RAISE EXCEPTION 'admin only'; END IF;
  SET LOCAL statement_timeout = 0;
  FOR r IN
    SELECT id, entity_id, signals FROM public.entity_existence_audit
    WHERE entity_type=p_entity_type AND action='flag' AND reverted_at IS NULL
      AND coalesce((signals->>'strong_dead')::int,0) >= 2
    ORDER BY created_at ASC LIMIT greatest(1, least(p_limit, 300))
  LOOP
    v_n := v_n + 1;
    IF NOT p_dry_run THEN
      PERFORM public._existence_apply_archive(p_entity_type, r.entity_id, 'admin_batch_approved', r.signals, v_actor);
      UPDATE public.entity_existence_audit SET reverted_at=now(), reverted_by=v_actor WHERE id=r.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('dry_run', p_dry_run, 'entity_type', p_entity_type, 'approved', v_n);
END; $function$;

-- grants
REVOKE ALL ON FUNCTION public._existence_apply_archive(text,uuid,text,jsonb,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._existence_apply_reopen(text,uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venues_due_for_existence_check(int) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.events_due_for_existence_check(int) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_due_for_existence_check(int) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.existence_approve_archive(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.existence_reject_archive(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.existence_reopen(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_approve_safe_existence(text, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_approve_safe_existence(text, int, boolean) TO authenticated;;
