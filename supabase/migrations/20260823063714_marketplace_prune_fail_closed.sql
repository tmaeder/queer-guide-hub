-- INCIDENT 2026-08-22: generalizing the catalog prune past ohmyfantasy.com
-- archived 638 live listings from the queer retailers this site exists to
-- promote — Mister B (41), DeMask (52), RodeoH (19), Spectrum Boutique (17),
-- fetchshop (157), Marek Richard (78), teamm8, jockstraps.com, garconmodel.
-- All 638 were restored to status='active'.
--
-- Two assumptions were wrong, and the SECOND is the load-bearing one:
--
-- (1) A 45-day "verdict freshness" guard does not separate good verdicts from
--     bad ones. The old miscalibrated scorer was still running right up to the
--     cutover, so a recent classified_at is no evidence of a trustworthy score.
--     Measured: misterb.com and fetchshop.co.uk rows classified the SAME DAY
--     still scored 0.06-0.2. Freshness was never the variable that mattered.
--
-- (2) `lgbti_relevance_score` is not fit to drive deletion at all for this
--     corpus. It scores a plain black jockstrap from a gay leather retailer
--     near zero because the TITLE carries no queer vocabulary — the queerness
--     is in the merchant, not the product noun. The `ownership_tags` escape
--     hatch that was supposed to protect such brands is empty on virtually
--     every row, so it protected nothing.
--
-- Therefore the prune now FAILS CLOSED: no explicit domain allowlist means it
-- archives NOTHING. A deletion tool whose default argument means "the entire
-- catalog" is the defect, independent of how good the score is.
SET statement_timeout = '120s';

DROP FUNCTION IF EXISTS public.marketplace_prune_candidates(text[], numeric, integer, interval);

CREATE FUNCTION public.marketplace_prune_candidates(
  p_domains text[] DEFAULT NULL,
  p_max_relevance numeric DEFAULT 0.60,
  p_limit integer DEFAULT NULL,
  p_max_age interval DEFAULT interval '45 days'
)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
AS $function$
  -- Fail closed: NULL/empty domain list selects NOTHING (never "everything").
  SELECT l.id
  FROM public.marketplace_listings l
  WHERE p_domains IS NOT NULL
    AND cardinality(p_domains) > 0
    AND l.merchant_domain = ANY (p_domains)
    AND l.status = 'active'
    AND coalesce(l.lgbti_relevance_score, 0) < p_max_relevance
    AND l.classified_at IS NOT NULL
    AND l.classified_at > now() - p_max_age
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
$function$;

REVOKE ALL ON FUNCTION public.marketplace_prune_candidates(text[], numeric, integer, interval) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_marketplace_catalog_prune(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean; v_domains text[];
  v_started timestamptz := now(); v_archived int := 0; v_remaining int := 0;
  v_reason text := 'prune_low_relevance_2026_08';
BEGIN
  SELECT id, enabled,
         (SELECT array_agg(value::text) FROM jsonb_array_elements_text(coalesce(conditions->'domains','[]'::jsonb)) AS value)
    INTO v_automation_id, v_enabled, v_domains
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

  -- No allowlist => archive nothing. This is the incident guard; do not
  -- "fix" it by defaulting to all domains.
  IF v_domains IS NULL OR cardinality(v_domains) = 0 THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','no_domain_allowlist',
        'hint','set admin_automations.conditions.domains to an explicit JSON array of merchant_domain values')
      WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','no_domain_allowlist');
  END IF;

  UPDATE public.marketplace_listings l
    SET status = 'inactive', archived_reason = v_reason, archived_at = now()
  WHERE l.id IN (SELECT public.marketplace_prune_candidates(
    v_domains, 0.60, GREATEST(1, LEAST(p_batch, 1000))));
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_prune_candidates(v_domains, 0.60, NULL);

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_archived+v_remaining, items_changed=v_archived,
    summary=jsonb_build_object('archived',v_archived,'remaining',v_remaining,
                               'domains',to_jsonb(v_domains),'reason',v_reason) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('archived', v_archived, 'remaining', v_remaining, 'domains', to_jsonb(v_domains));
END; $function$;

CREATE OR REPLACE FUNCTION public.marketplace_prune_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role_jwt('admin') THEN jsonb_build_object(
    'archived_by_reason', coalesce((
      SELECT jsonb_object_agg(archived_reason, n)
      FROM (SELECT archived_reason, count(*) AS n
            FROM public.marketplace_listings
            WHERE archived_reason IS NOT NULL
            GROUP BY archived_reason) x), '{}'::jsonb),
    'remaining_candidates', (
      SELECT count(*) FROM public.marketplace_prune_candidates(
        (SELECT (SELECT array_agg(value::text)
                 FROM jsonb_array_elements_text(coalesce(conditions->'domains','[]'::jsonb)) AS value)
         FROM public.admin_automations WHERE slug='marketplace_catalog_prune'),
        0.60, NULL)),
    'active_total', (SELECT count(*) FROM public.marketplace_listings WHERE status = 'active')
  ) ELSE NULL END;
$function$;
