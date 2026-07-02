-- ============================================================
-- Marketplace affiliate truth (v2 of the backfill, per prod reality)
--
-- Prod check (2026-07-02) falsified two assumptions behind 20260702100000:
--   * there are NO source_type='awin' rows (source_type is per-merchant
--     slugs: ohmyfantasy, misterb, fetchshop, …), so the v1 batch matched
--     an empty set;
--   * affiliate_url IS populated on 6,524 rows — but 6,521 are verbatim
--     copies of external_url (legacy import artifact, no network, no tag),
--     so the UI labels unmonetized links "Sponsored" (and rel=sponsored
--     costs SEO for nothing).
--
-- v2 per batch: (1) NULL fake copies (value is derivable — affiliate_url ==
-- external_url — so the clear is losslessly reversible); (2) keep the Awin
-- cread-move for whenever a real Awin feed lands (0 rows today), without
-- the source_type filter. Same storm-safe capped-batch lifecycle.
-- Automation flips to ENABLED: the clear is pure correctness with zero
-- monetary risk, and the cread clause only fires on links users were
-- already being sent to via external_url.
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_marketplace_affiliate_backfill(
  p_batch int DEFAULT 300, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_cleared int := 0; v_applied int := 0; v_remaining int;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'marketplace_affiliate_backfill';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'marketplace_affiliate_backfill', v_started, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- 1. clear fake affiliate_url copies (affiliate_url == external_url)
  WITH fake AS (
    SELECT id FROM public.marketplace_listings
    WHERE affiliate_url IS NOT NULL AND affiliate_url = external_url
    LIMIT GREATEST(1, LEAST(p_batch, 1000))
  )
  UPDATE public.marketplace_listings l
    SET affiliate_url = NULL
  FROM fake f WHERE l.id = f.id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- 2. move real awin cread links into affiliate_url (bounded by the same batch)
  IF v_cleared < p_batch THEN
    WITH target AS (
      SELECT id, external_url
      FROM public.marketplace_listings
      WHERE affiliate_url IS NULL
        AND external_url ~* 'awin1\.com/(cread|pclick)'
      LIMIT GREATEST(1, LEAST(p_batch - v_cleared, 1000))
    )
    UPDATE public.marketplace_listings l
      SET affiliate_url = t.external_url,
          external_url  = coalesce(public.awin_merchant_url(t.external_url), t.external_url),
          merchant_domain = coalesce(
            lower(regexp_replace((regexp_match(public.awin_merchant_url(t.external_url), '^https?://([^/]+)'))[1], '^www\.', '')),
            l.merchant_domain)
    FROM target t WHERE l.id = t.id;
    GET DIAGNOSTICS v_applied = ROW_COUNT;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_listings
  WHERE (affiliate_url IS NOT NULL AND affiliate_url = external_url)
     OR (affiliate_url IS NULL AND external_url ~* 'awin1\.com/(cread|pclick)');

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_cleared+v_applied+v_remaining, items_changed=v_cleared+v_applied,
    summary=jsonb_build_object('cleared',v_cleared,'applied',v_applied,'remaining',v_remaining) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('cleared', v_cleared, 'applied', v_applied, 'remaining', v_remaining);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_affiliate_backfill(int, boolean) TO service_role, authenticated;

UPDATE public.admin_automations
SET enabled = true,
    name = 'Marketplace affiliate-url truth backfill',
    description = 'Batched: (1) NULLs fake affiliate_url copies (== external_url, legacy import artifact, ~6.5k rows) so unmonetized links stop rendering as Sponsored; (2) moves real Awin cread links from external_url to affiliate_url. Capped per run to protect the search sync. Disable when remaining=0.'
WHERE slug = 'marketplace_affiliate_backfill';

DO $$ BEGIN
  RAISE NOTICE 'affiliate truth backfill v2: fake-copy clear enabled';
END $$;
