-- ============================================================
-- Marketplace affiliate activation: backfill awin deep links
--
-- source-awin used to put the Awin cread link into urls[0], so the commit
-- RPC stored it as external_url and affiliate_url stayed NULL forever
-- ($0 attribution). The adapter now stamps metadata.aw_deep_link /
-- merchant_deep_link (commit RPC already maps those). This backfills the
-- EXISTING rows: move the cread link to affiliate_url and restore the
-- clean merchant URL from its `ued` param.
--
-- Storm safety: every UPDATE fires trg_search_documents_marketplace, so
-- this runs as a capped-batch automation (run_marketplace_ownership_apply
-- template), 300 rows / 15 min.
-- Registered DISABLED: operator must first verify the feed's awinaffid is
-- ours (wrong id = links earn someone else money; note the links are
-- already live in external_url today, so this is a fix, not new exposure).
-- ============================================================

-- ── tiny percent-decoding helper (no built-in in PG) ──────────────
CREATE OR REPLACE FUNCTION public.url_decode(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE
  buf bytea := ''::bytea;
  i int := 1;
  n int := length(p);
BEGIN
  WHILE i <= n LOOP
    IF substr(p, i, 1) = '%' AND substr(p, i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
      buf := buf || decode(substr(p, i + 1, 2), 'hex');
      i := i + 3;
    ELSIF substr(p, i, 1) = '+' THEN
      buf := buf || convert_to(' ', 'utf8');
      i := i + 1;
    ELSE
      buf := buf || convert_to(substr(p, i, 1), 'utf8');
      i := i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(buf, 'utf8');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- malformed encodings must never abort the backfill batch
END; $$;

-- Extract + decode the `ued` param from an awin cread/pclick URL.
-- Returns NULL when absent or when the decoded value is not http(s).
CREATE OR REPLACE FUNCTION public.awin_merchant_url(p text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE WHEN dec ~* '^https?://' THEN dec END
  FROM (
    SELECT public.url_decode((regexp_match(p, '[?&]ued=([^&]+)'))[1]) AS dec
  ) x;
$$;

-- ── storm-safe batched backfill (automation) ──────────────────────
CREATE OR REPLACE FUNCTION public.run_marketplace_affiliate_backfill(
  p_batch int DEFAULT 300, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_applied int := 0; v_remaining int;
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

  WITH target AS (
    SELECT id, external_url
    FROM public.marketplace_listings
    WHERE source_type = 'awin'
      AND affiliate_url IS NULL
      AND external_url ~* 'awin1\.com/(cread|pclick)'
    LIMIT GREATEST(1, LEAST(p_batch, 1000))
  )
  UPDATE public.marketplace_listings l
    SET affiliate_url = t.external_url,
        external_url  = coalesce(public.awin_merchant_url(t.external_url), t.external_url),
        merchant_domain = coalesce(
          lower(regexp_replace((regexp_match(public.awin_merchant_url(t.external_url), '^https?://([^/]+)'))[1], '^www\.', '')),
          l.merchant_domain)
  FROM target t WHERE l.id = t.id;
  GET DIAGNOSTICS v_applied = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_listings
  WHERE source_type = 'awin'
    AND affiliate_url IS NULL
    AND external_url ~* 'awin1\.com/(cread|pclick)';

  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=v_applied+v_remaining, items_changed=v_applied,
    summary=jsonb_build_object('applied',v_applied,'remaining',v_remaining) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('applied', v_applied, 'remaining', v_remaining);
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_affiliate_backfill(int, boolean) TO service_role, authenticated;

-- Registered DISABLED — operator flips after verifying the feed awinaffid.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('marketplace_affiliate_backfill','Marketplace affiliate-url backfill',
   'Batched move of Awin cread links from external_url to affiliate_url (restores clean merchant URL from ued param). Capped per run to protect the search sync. Enable after verifying feed awinaffid ownership; disable when remaining=0.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_affiliate_backfill"}'::jsonb, '*/15 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_affiliate_backfill') THEN
    PERFORM cron.unschedule('marketplace_affiliate_backfill');
  END IF;
  PERFORM cron.schedule('marketplace_affiliate_backfill', '*/15 * * * *',
    'SELECT public.run_marketplace_affiliate_backfill();');
END $$;

-- ── affiliate_click_summary gains a vertical filter ───────────────
-- New optional param changes the signature → drop the old one first so
-- CREATE doesn't leave an ambiguous overload (news RPC 42P13 lesson).
DROP FUNCTION IF EXISTS public.affiliate_click_summary(int);
CREATE OR REPLACE FUNCTION public.affiliate_click_summary(p_days int DEFAULT 30, p_vertical text DEFAULT NULL)
RETURNS TABLE (
  surface     text,
  partner     text,
  vertical    text,
  clicks      bigint,
  impressions bigint,
  ctr         numeric,
  last_click  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    surface,
    partner,
    vertical,
    count(*) FILTER (WHERE kind = 'click')                                   AS clicks,
    count(*) FILTER (WHERE kind = 'impression')                             AS impressions,
    round(
      count(*) FILTER (WHERE kind = 'click')::numeric
      / NULLIF(count(*) FILTER (WHERE kind = 'impression'), 0), 4
    )                                                                        AS ctr,
    max(clicked_at) FILTER (WHERE kind = 'click')                           AS last_click
  FROM public.affiliate_clicks
  WHERE clicked_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
    AND (p_vertical IS NULL OR vertical = p_vertical)
    AND public.has_role_jwt('admin')
  GROUP BY surface, partner, vertical
  ORDER BY clicks DESC;
$$;
REVOKE ALL ON FUNCTION public.affiliate_click_summary(int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.affiliate_click_summary(int, text) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE 'marketplace affiliate backfill registered (disabled); affiliate_click_summary(p_days,p_vertical)';
END $$;
