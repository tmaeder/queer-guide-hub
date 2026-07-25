-- ============================================================================
-- Brand review RPCs: restore authenticated EXECUTE behind a real gate
-- ----------------------------------------------------------------------------
-- A hardening pass revoked authenticated EXECUTE on marketplace_brands_pending
-- and run_marketplace_ownership_apply (neither self-gated, so the revoke was
-- correct at the time) — which left the new /admin/brands review queue getting
-- "permission denied for function". Fix: add assert_admin_or_internal() inside
-- both (admins + service_role + direct-DB cron all pass; ordinary users 42501)
-- and re-grant authenticated. approve/reject already self-gate and kept their
-- grants.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marketplace_brands_pending(p_limit int DEFAULT 50)
RETURNS SETOF public.marketplace_brands
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_admin_or_internal();
  RETURN QUERY
  SELECT * FROM public.marketplace_brands
  WHERE status = 'pending'
  ORDER BY (suggested_tags <> '{}'::text[]) DESC, product_count DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END; $$;
ALTER FUNCTION public.marketplace_brands_pending(int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.marketplace_brands_pending(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_brands_pending(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_marketplace_ownership_apply(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_applied int := 0; v_remaining int;
BEGIN
  PERFORM public.assert_admin_or_internal();
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'marketplace_ownership_apply';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'marketplace_ownership_apply', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;
  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;
  WITH target AS (
    SELECT l.id, b.ownership_tags AS want
    FROM public.marketplace_listings l
    JOIN public.marketplace_brands b
      ON b.brand_key = public.marketplace_normalize_brand(l.brand)
     AND b.status = 'approved'
    WHERE l.community_owned_tags IS DISTINCT FROM b.ownership_tags
    LIMIT GREATEST(1, LEAST(p_batch, 1000))
  )
  UPDATE public.marketplace_listings l SET community_owned_tags = t.want
  FROM target t WHERE l.id = t.id;
  GET DIAGNOSTICS v_applied = ROW_COUNT;
  SELECT count(*) INTO v_remaining
  FROM public.marketplace_listings l
  JOIN public.marketplace_brands b
    ON b.brand_key = public.marketplace_normalize_brand(l.brand) AND b.status='approved'
  WHERE l.community_owned_tags IS DISTINCT FROM b.ownership_tags;
  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_applied+v_remaining, items_changed=v_applied,
    summary=jsonb_build_object('applied',v_applied,'remaining',v_remaining) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('applied', v_applied, 'remaining', v_remaining);
END; $function$;
ALTER FUNCTION public.run_marketplace_ownership_apply(integer, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_marketplace_ownership_apply(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_marketplace_ownership_apply(integer, boolean) TO authenticated, service_role;
