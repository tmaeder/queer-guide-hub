-- Marketplace Tagging Truth Engine — P0: brand-grain ownership registry.
-- Design: docs/plans/2026-06-08-marketplace-tagging-design.md §2.
--
-- community_owned_tags (queer/trans/bipoc/women/disabled-owned, nonprofit) is a
-- property of the BRAND, not the product. Aggregator sources (ohmyfantasy=214
-- brands, misterb=80) resell mainstream wholesalers (Orion, Dreamlove, Pipedream)
-- that are NOT queer-owned, so ownership must be resolved per-brand (312 distinct),
-- not per-source or per-product. This migration adds a brand registry + a human
-- review gate (asserting/erasing queer ownership is trust-sensitive) + a storm-safe
-- batched applier.
--
-- Storm note: trg_search_documents_marketplace fires on EVERY listings UPDATE (not
-- column-scoped). Approving a brand does NOT fan out eagerly — a single brand has up
-- to 1664 products. Fan-out is a capped, batched cron (run_marketplace_ownership_apply).
-- Idempotent; no CONCURRENTLY (runs in a txn).

-- ===== 0. brand-name normaliser (IMMUTABLE → usable in a functional index) =====
CREATE OR REPLACE FUNCTION public.marketplace_normalize_brand(p_brand text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT nullif(regexp_replace(lower(btrim(p_brand)), '\s+', ' ', 'g'), '');
$$;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_brand_key
  ON public.marketplace_listings (public.marketplace_normalize_brand(brand))
  WHERE brand IS NOT NULL;

-- ===== 1. marketplace_brands — the per-brand ownership registry =====
CREATE TABLE IF NOT EXISTS public.marketplace_brands (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key        text NOT NULL UNIQUE,          -- normalized join key (= marketplace_normalize_brand(brand))
  display_name     text NOT NULL,                 -- most common original casing
  ownership_tags   text[] NOT NULL DEFAULT '{}'::text[],   -- APPROVED labels, fanned out to products
  suggested_tags   text[] NOT NULL DEFAULT '{}'::text[],   -- name-signal hints for the reviewer (never published)
  confidence       numeric(3,2),
  evidence         text,                          -- why these labels (citation / self-identification)
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  detection_source text NOT NULL DEFAULT 'registry'
                     CHECK (detection_source IN ('registry','name_signal','curated_seed','llm','admin')),
  product_count    integer NOT NULL DEFAULT 0,
  top_source       text,                          -- dominant source_type (aggregator vs single-brand)
  sample_url       text,
  reviewer_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note    text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Each label in ownership_tags / suggested_tags must be from the fixed vocabulary.
ALTER TABLE public.marketplace_brands
  DROP CONSTRAINT IF EXISTS marketplace_brands_ownership_vocab;
ALTER TABLE public.marketplace_brands
  ADD CONSTRAINT marketplace_brands_ownership_vocab CHECK (
    ownership_tags <@ ARRAY['queer_owned','trans_owned','bipoc_owned','women_owned','disabled_owned','nonprofit']::text[]
    AND suggested_tags <@ ARRAY['queer_owned','trans_owned','bipoc_owned','women_owned','disabled_owned','nonprofit']::text[]
  );
CREATE INDEX IF NOT EXISTS idx_marketplace_brands_pending
  ON public.marketplace_brands (product_count DESC)
  WHERE status = 'pending' AND suggested_tags <> '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_marketplace_brands_approved
  ON public.marketplace_brands (brand_key)
  WHERE status = 'approved' AND ownership_tags <> '{}'::text[];

ALTER TABLE public.marketplace_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_brands_admin_all ON public.marketplace_brands;
CREATE POLICY marketplace_brands_admin_all ON public.marketplace_brands
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
-- Public read of approved labels (powers a future "brands we support" surface; harmless metadata).
DROP POLICY IF EXISTS marketplace_brands_public_read ON public.marketplace_brands;
CREATE POLICY marketplace_brands_public_read ON public.marketplace_brands
  FOR SELECT USING (status = 'approved');
GRANT SELECT ON TABLE public.marketplace_brands TO anon, authenticated;
GRANT ALL ON TABLE public.marketplace_brands TO service_role;

-- ===== 2. name-signal suggester (deterministic, conservative — hints only) =====
CREATE OR REPLACE FUNCTION public.marketplace_brand_name_signal(p_text text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN lower(coalesce(p_text,'')) ~ '\m(queer|gay|lesbian|sapphic|dyke|lgbtq?|pride|homo)\M' THEN 'queer_owned' END,
    CASE WHEN lower(coalesce(p_text,'')) ~ '\m(trans|transgender|nonbinary|enby)\M' THEN 'trans_owned' END
  ], NULL);
$$;

-- ===== 3. marketplace_register_brands() — populate/refresh registry from listings =====
-- Upserts one row per distinct active brand with product_count + dominant source +
-- a name-signal suggestion. Never touches status/ownership_tags of existing rows
-- (preserves admin decisions). Bounded aggregate write — safe to re-run.
CREATE OR REPLACE FUNCTION public.marketplace_register_brands()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  WITH agg AS (
    SELECT
      public.marketplace_normalize_brand(brand) AS brand_key,
      (array_agg(brand ORDER BY length(brand)))[1] AS display_name,
      count(*)::int AS product_count,
      mode() WITHIN GROUP (ORDER BY source_type) AS top_source,
      (array_agg(external_url ORDER BY external_url) FILTER (WHERE external_url IS NOT NULL))[1] AS sample_url,
      public.marketplace_brand_name_signal(
        string_agg(DISTINCT brand, ' ') || ' ' || coalesce(mode() WITHIN GROUP (ORDER BY source_type),'')
      ) AS suggested
    FROM public.marketplace_listings
    WHERE status = 'active' AND public.marketplace_normalize_brand(brand) IS NOT NULL
    GROUP BY 1
  )
  INSERT INTO public.marketplace_brands
    (brand_key, display_name, product_count, top_source, sample_url, suggested_tags, detection_source, status)
  SELECT brand_key, display_name, product_count, top_source, sample_url,
         coalesce(suggested,'{}'::text[]),
         CASE WHEN coalesce(suggested,'{}'::text[]) <> '{}' THEN 'name_signal' ELSE 'registry' END,
         'pending'
  FROM agg
  ON CONFLICT (brand_key) DO UPDATE SET
    display_name  = EXCLUDED.display_name,
    product_count = EXCLUDED.product_count,
    top_source    = EXCLUDED.top_source,
    sample_url    = coalesce(public.marketplace_brands.sample_url, EXCLUDED.sample_url),
    -- refresh suggestions only while still pending; never clobber a decided row
    suggested_tags = CASE WHEN public.marketplace_brands.status = 'pending'
                          THEN EXCLUDED.suggested_tags ELSE public.marketplace_brands.suggested_tags END,
    updated_at    = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('brands', v_count);
END; $$;
GRANT EXECUTE ON FUNCTION public.marketplace_register_brands() TO service_role, authenticated;

-- ===== 4. review selector — highest-impact pending brands first =====
CREATE OR REPLACE FUNCTION public.marketplace_brands_pending(p_limit int DEFAULT 50)
RETURNS SETOF public.marketplace_brands
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.marketplace_brands
  WHERE status = 'pending'
  ORDER BY (suggested_tags <> '{}'::text[]) DESC, product_count DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.marketplace_brands_pending(int) TO service_role, authenticated;

-- ===== 5. approve / reject (admin-only, trust-gated, audited) =====
-- Asserting queer/trans/bipoc ownership requires p_confirm=true (mirrors the city
-- safety-notes invariant). Does NOT fan out — the batched cron applies to products.
CREATE OR REPLACE FUNCTION public.approve_marketplace_brand(
  p_brand_id uuid, p_tags text[], p_confirm boolean DEFAULT false, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.marketplace_brands%ROWTYPE;
  v_sensitive boolean;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM public.marketplace_brands WHERE id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'brand not found' USING ERRCODE='22023'; END IF;

  IF NOT (coalesce(p_tags,'{}') <@ ARRAY['queer_owned','trans_owned','bipoc_owned','women_owned','disabled_owned','nonprofit']::text[]) THEN
    RAISE EXCEPTION 'ownership tag outside vocabulary' USING ERRCODE='22023'; END IF;

  v_sensitive := coalesce(p_tags,'{}') && ARRAY['queer_owned','trans_owned','bipoc_owned']::text[];
  IF v_sensitive AND NOT p_confirm THEN
    RAISE EXCEPTION 'asserting queer/trans/BIPOC ownership requires explicit confirmation (p_confirm=true)'
      USING ERRCODE='22023'; END IF;

  UPDATE public.marketplace_brands SET
    ownership_tags = coalesce(p_tags,'{}'::text[]),
    status = 'approved', detection_source = 'admin',
    confidence = 1.0, reviewer_id = auth.uid(), reviewer_note = p_note,
    reviewed_at = now(), updated_at = now()
  WHERE id = p_brand_id;

  RETURN jsonb_build_object('approved', true, 'brand_id', p_brand_id,
    'tags', coalesce(p_tags,'{}'::text[]), 'product_count', b.product_count,
    'note', 'labels apply to products on the next run_marketplace_ownership_apply pass');
END; $$;
ALTER FUNCTION public.approve_marketplace_brand(uuid, text[], boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_marketplace_brand(uuid, text[], boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_marketplace_brand(uuid, text[], boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_marketplace_brand(p_brand_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.marketplace_brands%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM public.marketplace_brands WHERE id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'brand not found' USING ERRCODE='22023'; END IF;

  UPDATE public.marketplace_brands SET
    ownership_tags = '{}'::text[], status = 'rejected', detection_source = 'admin',
    reviewer_id = auth.uid(), reviewer_note = p_note, reviewed_at = now(), updated_at = now()
  WHERE id = p_brand_id;
  RETURN jsonb_build_object('rejected', true, 'brand_id', p_brand_id);
END; $$;
ALTER FUNCTION public.reject_marketplace_brand(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_marketplace_brand(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_marketplace_brand(uuid, text) TO authenticated, service_role;

-- ===== 6. storm-safe batched applier (cron) =====
-- Fans approved brand ownership_tags onto products in capped batches. Ownership is
-- purely brand-derived → overwrite (authoritative, idempotent). Also CLEARS tags on
-- products whose brand was rejected/un-approved. Each UPDATE re-indexes via the
-- search trigger, so the batch cap protects the disk-constrained sync.
CREATE OR REPLACE FUNCTION public.run_marketplace_ownership_apply(
  p_batch int DEFAULT 300, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_applied int := 0; v_remaining int;
BEGIN
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
  UPDATE public.marketplace_listings l
    SET community_owned_tags = t.want
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
END; $$;
GRANT EXECUTE ON FUNCTION public.run_marketplace_ownership_apply(int, boolean) TO service_role, authenticated;

-- ===== 7. register automation (ENABLED — writes are bounded & desirable) + dispatch + cron =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('marketplace_ownership_apply','Marketplace brand-ownership apply',
   'Daily batched fan-out of approved brand community_owned_tags onto products (and clears un-approved). Capped per run to protect the search sync.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_marketplace_ownership_apply"}'::jsonb, '20 4 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace_ownership_apply') THEN
    PERFORM cron.unschedule('marketplace_ownership_apply');
  END IF;
  PERFORM cron.schedule('marketplace_ownership_apply', '20 4 * * *',
    'SELECT public.run_marketplace_ownership_apply();');
END $$;
