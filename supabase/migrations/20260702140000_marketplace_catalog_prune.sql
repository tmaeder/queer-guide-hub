-- ============================================================
-- Hard catalog prune: reversible, batched archive of aggregator noise
--
-- ohmyfantasy (6.2k active rows, 28%) is a German aggregator reselling
-- mainstream wholesale — it drowns indie queer-owned brands. This archives
-- its low-relevance remainder (status='inactive') behind a dedicated,
-- per-wave reversible marker.
--
-- Marker: archived_reason/archived_at columns — NOT sensitivity_flags
-- (that jsonb drives the user-facing AdultContentGate; ops markers don't
-- belong in it) and supports multiple waves with one-line reversal.
--
-- Never archives: featured listings, wishlisted/favorited listings, or
-- brands with approved ownership tags in marketplace_brands.
--
-- PREREQUISITE (operator): run marketplace-relevance-rescore to completion
-- over the aggregator cohort first — pruning on stale scores would kill
-- queer fetish gear and keep candles. Automation ships DISABLED for this
-- reason; enable after the rescore, disable when remaining=0.
-- ============================================================

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_archived_reason
  ON public.marketplace_listings (archived_reason)
  WHERE archived_reason IS NOT NULL;

-- ── prune candidate predicate (single source of truth for run + count) ──
CREATE OR REPLACE FUNCTION public.marketplace_prune_candidates(
  p_domains text[] DEFAULT ARRAY['ohmyfantasy.com'],
  p_max_relevance numeric DEFAULT 0.60,
  p_limit int DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT l.id
  FROM public.marketplace_listings l
  WHERE l.status = 'active'
    AND l.merchant_domain = ANY (p_domains)
    AND coalesce(l.lgbti_relevance_score, 0) < p_max_relevance
    AND l.featured = false
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_brands b
      WHERE b.brand_key = public.marketplace_normalize_brand(l.brand)
        AND b.status = 'approved' AND b.ownership_tags <> '{}'
    )
    AND NOT EXISTS (SELECT 1 FROM public.wishlist_items w WHERE w.listing_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.marketplace_favorites f WHERE f.listing_id = l.id)
  ORDER BY coalesce(l.lgbti_relevance_score, 0) ASC
  LIMIT coalesce(p_limit, 2147483647);
$$;

-- ── storm-safe batched prune (automation lifecycle) ────────────────
CREATE OR REPLACE FUNCTION public.run_marketplace_catalog_prune(
  p_batch int DEFAULT 300, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_archived int := 0; v_remaining int;
  v_reason text := 'prune_aggregator_2026_07';
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'marketplace_catalog_prune';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'marketplace_catalog_prune', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  UPDATE public.marketplace_listings l
    SET status = 'inactive', archived_reason = v_reason, archived_at = now()
  WHERE l.id IN (SELECT public.marketplace_prune_candidates(
    ARRAY['ohmyfantasy.com'], 0.60, GREATEST(1, LEAST(p_batch, 1000))));
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_prune_candidates(ARRAY['ohmyfantasy.com'], 0.60, NULL);

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_archived+v_remaining, items_changed=v_archived,
    summary=jsonb_build_object('archived',v_archived,'remaining',v_remaining,'reason',v_reason) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('archived', v_archived, 'remaining', v_remaining, 'reason', v_reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_catalog_prune(int, boolean) TO service_role, authenticated;

-- ── one-line reversal, same batched shape ──────────────────────────
CREATE OR REPLACE FUNCTION public.revert_marketplace_catalog_prune(
  p_reason text, p_batch int DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_restored int := 0; v_remaining int;
BEGIN
  PERFORM public.assert_admin_or_internal();

  WITH target AS (
    SELECT id FROM public.marketplace_listings
    WHERE archived_reason = p_reason
    LIMIT GREATEST(1, LEAST(p_batch, 1000))
  )
  UPDATE public.marketplace_listings l
    SET status = 'active', archived_reason = NULL, archived_at = NULL
  FROM target t WHERE l.id = t.id;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_listings WHERE archived_reason = p_reason;

  RETURN jsonb_build_object('restored', v_restored, 'remaining', v_remaining);
END; $$;
GRANT EXECUTE ON FUNCTION public.revert_marketplace_catalog_prune(text, int) TO service_role, authenticated;

-- ── admin dashboard stats (RLS on inactive rows makes client counts blind) ──
CREATE OR REPLACE FUNCTION public.marketplace_prune_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role_jwt('admin') THEN jsonb_build_object(
    'archived_by_reason', coalesce((
      SELECT jsonb_object_agg(archived_reason, n)
      FROM (SELECT archived_reason, count(*) AS n
            FROM public.marketplace_listings
            WHERE archived_reason IS NOT NULL
            GROUP BY archived_reason) x), '{}'::jsonb),
    'remaining_candidates', (SELECT count(*) FROM public.marketplace_prune_candidates(ARRAY['ohmyfantasy.com'], 0.60, NULL)),
    'active_total', (SELECT count(*) FROM public.marketplace_listings WHERE status = 'active')
  ) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_prune_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_prune_stats() TO authenticated;

-- Registered DISABLED — enable only after the relevance rescore completes.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('marketplace_catalog_prune','Marketplace aggregator catalog prune',
   'Reversibly archives low-relevance aggregator listings (ohmyfantasy, <0.60 post-rescore, never featured/wishlisted/approved-ownership brands). Marker archived_reason=prune_aggregator_2026_07; revert via revert_marketplace_catalog_prune. PREREQ: run marketplace-relevance-rescore to completion first. Disable when remaining=0.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_catalog_prune"}'::jsonb, '*/15 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_catalog_prune') THEN
    PERFORM cron.unschedule('marketplace_catalog_prune');
  END IF;
  PERFORM cron.schedule('marketplace_catalog_prune', '*/15 * * * *',
    'SELECT public.run_marketplace_catalog_prune();');
END $$;

DO $$ BEGIN
  RAISE NOTICE 'catalog prune ready (automation disabled until rescore completes)';
END $$;
