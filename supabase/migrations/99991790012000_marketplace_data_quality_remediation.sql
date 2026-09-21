-- Marketplace listings data-quality remediation (2026-09-21).
--
-- Operational principles:
--   * workers claim small, indexed batches and report actual progress;
--   * semantic changes are versioned and reversible, never destructive;
--   * image_assets is the only image-processing state machine;
--   * quality is measured by dimension instead of inferred from one score.

SET statement_timeout = '15min';

-- ---------------------------------------------------------------------------
-- 1. Indexed, concurrent-safe variant extraction work list
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS marketplace_listings_variant_work_idx
  ON public.marketplace_listings (attributes_extracted_at NULLS FIRST, updated_at, id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketplace_listing_sources_listing_seen_idx
  ON public.marketplace_listing_sources (listing_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_variant_extract_claims (
  listing_id uuid PRIMARY KEY REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  claim_token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0)
);
CREATE INDEX IF NOT EXISTS marketplace_variant_extract_claims_token_idx
  ON public.marketplace_variant_extract_claims (claim_token);
CREATE INDEX IF NOT EXISTS marketplace_variant_extract_claims_expiry_idx
  ON public.marketplace_variant_extract_claims (claimed_at);
ALTER TABLE public.marketplace_variant_extract_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_variant_extract_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketplace_variant_extract_claims TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_due_for_variant_extract(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id
  FROM public.marketplace_listings l
  WHERE l.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_variant_extract_claims c
      WHERE c.listing_id = l.id AND c.claimed_at >= now() - interval '20 minutes'
    )
    AND (
      l.attributes_extracted_at IS NULL
      OR EXISTS (
        SELECT 1 FROM public.marketplace_listing_sources s
        WHERE s.listing_id = l.id
          AND s.last_seen_at > l.attributes_extracted_at
      )
    )
  ORDER BY l.attributes_extracted_at ASC NULLS FIRST, l.updated_at, l.id
  LIMIT GREATEST(1, LEAST(p_limit, 125));
$$;

CREATE OR REPLACE FUNCTION public.marketplace_claim_variant_extract(
  p_limit integer DEFAULT 50,
  p_claim_token uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.marketplace_variant_extract_claims
  WHERE claimed_at < now() - interval '20 minutes';

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT l.id
    FROM public.marketplace_listings l
    WHERE l.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.marketplace_variant_extract_claims c
        WHERE c.listing_id = l.id
      )
      AND (
        l.attributes_extracted_at IS NULL
        OR EXISTS (
          SELECT 1 FROM public.marketplace_listing_sources s
          WHERE s.listing_id = l.id
            AND s.last_seen_at > l.attributes_extracted_at
        )
      )
    ORDER BY l.attributes_extracted_at ASC NULLS FIRST, l.updated_at, l.id
    LIMIT GREATEST(1, LEAST(p_limit, 125))
    FOR UPDATE OF l SKIP LOCKED
  ), claimed AS (
    INSERT INTO public.marketplace_variant_extract_claims (listing_id, claim_token)
    SELECT candidates.id, p_claim_token FROM candidates
    ON CONFLICT (listing_id) DO NOTHING
    RETURNING listing_id
  )
  SELECT claimed.listing_id FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_release_variant_extract_claims(
  p_claim_token uuid,
  p_listing_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.marketplace_variant_extract_claims
  WHERE claim_token = p_claim_token
    AND (p_listing_ids IS NULL OR listing_id = ANY(p_listing_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_due_for_variant_extract(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_claim_variant_extract(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_release_variant_extract_claims(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_due_for_variant_extract(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_claim_variant_extract(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_release_variant_extract_claims(uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Durable link validation and image state-machine hygiene
-- ---------------------------------------------------------------------------

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS link_broken_streak smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS image_assets_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS marketplace_listings_link_work_idx
  ON public.marketplace_listings (link_checked_at NULLS FIRST, id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.marketplace_link_check_claims (
  listing_id uuid PRIMARY KEY REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  claim_token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_link_check_claims_expiry_idx
  ON public.marketplace_link_check_claims (claimed_at);
ALTER TABLE public.marketplace_link_check_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_link_check_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketplace_link_check_claims TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_claim_link_checks(
  p_limit integer DEFAULT 75,
  p_stale_days integer DEFAULT 30,
  p_claim_token uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE(id uuid, external_url text, affiliate_url text, link_health text, link_broken_streak smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.marketplace_link_check_claims WHERE claimed_at < now() - interval '20 minutes';
  RETURN QUERY
  WITH preeligible AS MATERIALIZED (
    SELECT l.id,l.link_checked_at,
      coalesce(nullif(l.merchant_domain,''),nullif(l.source_type,''),'unknown') domain_key
    FROM public.marketplace_listings l
    WHERE l.status='active'
      AND (l.link_checked_at IS NULL OR l.link_checked_at < now()-make_interval(days=>greatest(1,p_stale_days)))
      -- A current source feed sighting is positive existence evidence and is
      -- credited without spending an HTTP probe.
      AND (l.last_seen_at IS NULL OR l.last_seen_at < now()-make_interval(days=>greatest(1,p_stale_days)))
      AND NOT EXISTS (SELECT 1 FROM public.marketplace_link_check_claims c WHERE c.listing_id=l.id)
    ORDER BY l.link_checked_at ASC NULLS FIRST,l.id
    LIMIT greatest(500,least(p_limit*20,4000))
    FOR UPDATE OF l SKIP LOCKED
  ), eligible AS MATERIALIZED (
    SELECT p.id,p.link_checked_at,row_number() OVER(
      PARTITION BY p.domain_key ORDER BY p.link_checked_at ASC NULLS FIRST,p.id) domain_rank
    FROM preeligible p
  ), candidates AS MATERIALIZED (
    SELECT e.id FROM eligible e
    WHERE e.domain_rank<=10
    ORDER BY e.link_checked_at ASC NULLS FIRST,e.id
    LIMIT GREATEST(1, LEAST(p_limit, 200))
  ), claimed AS (
    INSERT INTO public.marketplace_link_check_claims(listing_id,claim_token)
    SELECT candidates.id,p_claim_token FROM candidates ON CONFLICT DO NOTHING
    RETURNING listing_id
  )
  SELECT l.id,l.external_url,l.affiliate_url,l.link_health,l.link_broken_streak
  FROM claimed c JOIN public.marketplace_listings l ON l.id=c.listing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_release_link_check_claims(p_claim_token uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.marketplace_link_check_claims WHERE claim_token=p_claim_token;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_claim_link_checks(integer,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketplace_release_link_check_claims(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_claim_link_checks(integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_release_link_check_claims(uuid) TO service_role;

ALTER TABLE public.image_assets DROP CONSTRAINT IF EXISTS image_assets_alt_provenance_check;
ALTER TABLE public.image_assets ADD CONSTRAINT image_assets_alt_provenance_check
  CHECK (alt_provenance IS NULL OR alt_provenance IN
    ('human', 'ai-generated', 'imported', 'none', 'derived:listing_title', 'derived:listing_context'));

CREATE OR REPLACE FUNCTION public.marketplace_fill_image_alt_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alt text;
BEGIN
  IF NEW.entity_type <> 'marketplace_listing' THEN RETURN NEW; END IF;
  SELECT concat_ws(' — ', nullif(btrim(l.brand), ''), btrim(l.title))
         || CASE WHEN NEW.role = 'gallery' THEN ' — product image ' || (NEW.sort_order + 1)::text ELSE '' END
  INTO v_alt
  FROM public.marketplace_listings l WHERE l.id = NEW.entity_id;

  UPDATE public.image_assets
  SET alt_text = left(v_alt, 240), alt_provenance = 'derived:listing_context'
  WHERE id = NEW.asset_id AND coalesce(btrim(alt_text), '') = '' AND coalesce(v_alt, '') <> '';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketplace_fill_image_alt_text_trg ON public.image_asset_links;
CREATE TRIGGER marketplace_fill_image_alt_text_trg
AFTER INSERT OR UPDATE OF entity_id, role, sort_order ON public.image_asset_links
FOR EACH ROW EXECUTE FUNCTION public.marketplace_fill_image_alt_text();

CREATE OR REPLACE FUNCTION public.tg_marketplace_listings_sync_image_assets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_url text; v_position integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.images IS NOT DISTINCT FROM OLD.images
     AND OLD.image_assets_synced_at IS NOT NULL THEN RETURN NEW; END IF;
  DELETE FROM public.image_asset_links ial USING public.image_assets ia
  WHERE ial.asset_id=ia.id AND ial.entity_type='marketplace_listing' AND ial.entity_id=NEW.id
    AND ial.role IN('cover','gallery') AND ia.source='marketplace_pipeline';
  IF NEW.images IS NOT NULL THEN
    FOR v_url,v_position IN SELECT u.url,u.ordinality::integer-1 FROM unnest(NEW.images) WITH ORDINALITY u(url,ordinality)
    LOOP
      IF coalesce(btrim(v_url),'')='' THEN CONTINUE; END IF;
      PERFORM public._image_assets_upsert_link('marketplace_listing',NEW.id,v_url,
        CASE WHEN v_position=0 THEN 'cover' ELSE 'gallery' END,'marketplace_pipeline');
      UPDATE public.image_asset_links SET sort_order=v_position
      WHERE entity_type='marketplace_listing' AND entity_id=NEW.id
        AND role=CASE WHEN v_position=0 THEN 'cover' ELSE 'gallery' END
        AND asset_id=(SELECT id FROM public.image_assets
          WHERE url_hash=encode(digest(public.canonicalise_image_url(v_url),'sha256'),'hex'));
    END LOOP;
  END IF;
  UPDATE public.marketplace_listings SET image_assets_synced_at=now() WHERE id=NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'marketplace gallery image_assets sync failed for %: %',NEW.id,sqlerrm;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_backfill_gallery_assets(p_limit integer DEFAULT 250)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_count integer:=0;
BEGIN
  FOR r IN SELECT id,images FROM public.marketplace_listings
    WHERE status='active' AND image_assets_synced_at IS NULL
    ORDER BY id LIMIT greatest(1,least(p_limit,500)) FOR UPDATE SKIP LOCKED
  LOOP
    -- Assigning a distinct array copy fires the canonical gallery trigger.
    UPDATE public.marketplace_listings SET images=r.images||'{}'::text[] WHERE id=r.id;
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('items_examined',v_count,'items_changed',v_count,
    'items_terminal',v_count,'remaining',(SELECT count(*) FROM public.marketplace_listings WHERE status='active' AND image_assets_synced_at IS NULL));
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_backfill_gallery_assets(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_backfill_gallery_assets(integer) TO service_role;

-- Existing links get the same deterministic treatment. No generated visual
-- claims are made: the text contains only listing/brand/position facts.
UPDATE public.image_assets ia
SET alt_text = left(concat_ws(' — ', nullif(btrim(l.brand), ''), btrim(l.title))
                    || CASE WHEN ial.role = 'gallery' THEN ' — product image ' || (ial.sort_order + 1)::text ELSE '' END, 240),
    alt_provenance = 'derived:listing_context'
FROM public.image_asset_links ial
JOIN public.marketplace_listings l ON l.id = ial.entity_id
WHERE ial.asset_id = ia.id AND ial.entity_type = 'marketplace_listing'
  AND coalesce(btrim(ia.alt_text), '') = '';

CREATE OR REPLACE FUNCTION public.marketplace_retry_failed_images(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_requeued integer;
BEGIN
  WITH due AS (
    SELECT ia.id
    FROM public.image_assets ia
    JOIN public.image_asset_links ial ON ial.asset_id = ia.id
    JOIN public.marketplace_listings l ON l.id = ial.entity_id
    WHERE ial.entity_type = 'marketplace_listing' AND l.status = 'active'
      AND ia.optimization_status = 'failed'
      AND CASE WHEN coalesce(ia.metadata->>'optimization_attempts','') ~ '^\d+$'
        THEN (ia.metadata->>'optimization_attempts')::integer ELSE 0 END < 3
    GROUP BY ia.id
    ORDER BY ia.id LIMIT GREATEST(1, LEAST(p_limit, 1000))
  )
  UPDATE public.image_assets ia
  SET optimization_status = 'pending',
      metadata = jsonb_set(ia.metadata, '{retry_requested_at}', to_jsonb(now()), true)
  FROM due WHERE ia.id = due.id;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;
  RETURN jsonb_build_object('items_examined', v_requeued, 'items_changed', v_requeued,
                            'items_terminal', 0, 'requeued', v_requeued);
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_retry_failed_images(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_retry_failed_images(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_claim_image_assets(p_limit integer DEFAULT 15)
RETURNS TABLE(id uuid,url text,format text,metadata jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH due AS MATERIALIZED (
    SELECT ia.id
    FROM public.image_assets ia
    WHERE ia.status='active' AND ia.optimization_status='pending'
      AND EXISTS(SELECT 1 FROM public.image_asset_links ial
        WHERE ial.asset_id=ia.id AND ial.entity_type='marketplace_listing')
    ORDER BY ia.created_at,ia.id LIMIT greatest(1,least(p_limit,50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.image_assets ia SET optimization_status='processing',
    metadata=jsonb_set(coalesce(ia.metadata,'{}'::jsonb),'{processing_started_at}',to_jsonb(now()),true)
  FROM due WHERE ia.id=due.id
  RETURNING ia.id,ia.url,ia.format,ia.metadata;
$$;
REVOKE ALL ON FUNCTION public.marketplace_claim_image_assets(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_claim_image_assets(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Description recovery queue and relationship/lifecycle repair
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketplace_enhance_refill(p_max integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  WITH boiler AS (
    SELECT md5(lower(btrim(description))) AS h
    FROM public.marketplace_listings
    WHERE status = 'active' AND coalesce(btrim(description), '') <> ''
    GROUP BY 1 HAVING count(*) > 5
  ), cand AS (
    SELECT ml.id,
      CASE
        WHEN coalesce(btrim(ml.description), '') = '' THEN 0
        WHEN md5(lower(btrim(ml.description))) IN (SELECT h FROM boiler) THEN 1
        WHEN length(btrim(ml.description)) < 80 THEN 2
        ELSE 3
      END::smallint AS priority
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active'
      AND (ml.description_i18n IS NULL OR NOT (ml.description_i18n ? '_enhanced_at'))
      AND (coalesce(btrim(ml.description), '') <> ''
           OR coalesce(nullif(ml.description_i18n->>'_recovery_checked_at','')::timestamptz,
                       '-infinity'::timestamptz) < now()-interval '7 days')
    ORDER BY 2, ml.updated_at, ml.id
    LIMIT GREATEST(1, LEAST(p_max, 10000))
  )
  INSERT INTO public.marketplace_enhance_queue (listing_id, priority)
  SELECT id, priority FROM cand ON CONFLICT (listing_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_enhance_refill(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_enhance_refill(integer) TO service_role;

INSERT INTO public.marketplace_listing_sources
  (listing_id, source_slug, source_entity_id, source_url, raw, payload_hash, confidence, is_primary, first_seen_at, last_seen_at)
SELECT l.id, l.source_type, l.source_entity_id, l.external_url,
       jsonb_build_object('_recovered_from', 'marketplace_listings'),
       l.payload_hash, 0.5, true, l.created_at, coalesce(l.last_seen_at, l.updated_at)
FROM public.marketplace_listings l
WHERE coalesce(btrim(l.source_type), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM public.marketplace_listing_sources s WHERE s.listing_id = l.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketplace_ensure_merchant(
  p_merchant_domain text,p_source_slug text,p_display_name text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain text; v_slug text; v_id uuid;
BEGIN
  v_domain:=regexp_replace(lower(split_part(regexp_replace(coalesce(p_merchant_domain,''),'^https?://','','i'),'/',1)),'^www\.','');
  IF coalesce(v_domain,'')='' THEN RETURN NULL; END IF;
  v_id:=public.marketplace_resolve_merchant_id(v_domain,p_source_slug);
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_slug:=coalesce(nullif(btrim(p_source_slug),''),regexp_replace(v_domain,'[^a-z0-9]+','-','g'));
  INSERT INTO public.marketplace_merchants(provider,slug,display_name,shop_domain,config,is_enabled)
  VALUES(coalesce(nullif(btrim(p_source_slug),''),'recovered'),v_slug,
    coalesce(nullif(btrim(p_display_name),''),v_domain),v_domain,
    jsonb_build_object('registered_by','marketplace-quality-remediation'),true)
  ON CONFLICT(provider,slug) DO UPDATE SET shop_domain=coalesce(public.marketplace_merchants.shop_domain,excluded.shop_domain)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_ensure_merchant(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_ensure_merchant(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_listings_ensure_merchant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_domain text;
BEGIN
  IF NEW.merchant_id IS NOT NULL THEN RETURN NEW; END IF;
  v_domain:=coalesce(nullif(NEW.merchant_domain,''),NEW.external_url);
  NEW.merchant_id:=public.marketplace_ensure_merchant(v_domain,NEW.source_type,NEW.business_name);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketplace_listings_ensure_merchant_trg ON public.marketplace_listings;
CREATE TRIGGER marketplace_listings_ensure_merchant_trg
BEFORE INSERT OR UPDATE OF merchant_domain,source_type,external_url,merchant_id ON public.marketplace_listings
FOR EACH ROW EXECUTE FUNCTION public.marketplace_listings_ensure_merchant();

UPDATE public.marketplace_listings l
SET merchant_id=public.marketplace_ensure_merchant(
  coalesce(nullif(l.merchant_domain,''),l.external_url),l.source_type,l.business_name)
WHERE l.merchant_id IS NULL AND coalesce(nullif(l.merchant_domain,''),l.external_url) IS NOT NULL;

UPDATE public.marketplace_listings
SET archived_reason = CASE
  WHEN deprecated_at IS NOT NULL THEN 'source_deprecated'
  WHEN link_health = 'broken' THEN 'link_broken_confirmed'
  WHEN coalesce(in_stock, true) = false OR availability IN ('discontinued', 'unavailable') THEN 'source_unavailable'
  ELSE 'legacy_inactive_unclassified'
END,
archived_at = coalesce(archived_at, updated_at)
WHERE status = 'inactive' AND archived_reason IS NULL;

CREATE OR REPLACE FUNCTION public.marketplace_price_history_set_usd()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_rate numeric;
BEGIN
  SELECT rate_to_usd INTO v_rate FROM public.fx_rates
  WHERE upper(currency) = upper(coalesce(NEW.currency, 'USD'));
  IF v_rate IS NOT NULL THEN NEW.price_usd := round(NEW.price * v_rate, 2); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketplace_price_history_set_usd_trg ON public.marketplace_price_history;
CREATE TRIGGER marketplace_price_history_set_usd_trg
BEFORE INSERT OR UPDATE OF price, currency ON public.marketplace_price_history
FOR EACH ROW EXECUTE FUNCTION public.marketplace_price_history_set_usd();

UPDATE public.marketplace_price_history h
SET price_usd = round(h.price * f.rate_to_usd, 2)
FROM public.fx_rates f
WHERE h.price_usd IS NULL AND upper(f.currency) = upper(coalesce(h.currency, 'USD'));

-- ---------------------------------------------------------------------------
-- 4. Reversible taxonomy/safety governance and dimension scores
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketplace_quality_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  classifier_version text NOT NULL,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  run_id bigint REFERENCES public.admin_automation_runs(id) ON DELETE SET NULL,
  rollback_of bigint REFERENCES public.marketplace_quality_events(id) ON DELETE SET NULL,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_quality_events_listing_idx
  ON public.marketplace_quality_events (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_quality_events_run_idx
  ON public.marketplace_quality_events (run_id) WHERE run_id IS NOT NULL;
ALTER TABLE public.marketplace_quality_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read marketplace quality events"
  ON public.marketplace_quality_events FOR SELECT TO authenticated
  USING (public.has_role_jwt('admin'::public.app_role));
REVOKE ALL ON public.marketplace_quality_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_quality_events TO authenticated;
GRANT ALL ON public.marketplace_quality_events TO service_role;

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS completeness_score smallint,
  ADD COLUMN IF NOT EXISTS media_quality_score smallint,
  ADD COLUMN IF NOT EXISTS taxonomy_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS safety_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS freshness_score smallint,
  ADD COLUMN IF NOT EXISTS linkage_score smallint,
  ADD COLUMN IF NOT EXISTS quality_dimensions_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_dimensions_due boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS taxonomy_version smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS taxonomy_classifier_version text NOT NULL DEFAULT 'marketplace-taxonomy-v3',
  ADD COLUMN IF NOT EXISTS taxonomy_model_status text CHECK(taxonomy_model_status IN('pending','processing','done','failed')),
  ADD COLUMN IF NOT EXISTS taxonomy_model_attempts smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS marketplace_listings_quality_due_idx
  ON public.marketplace_listings (id) WHERE status = 'active' AND quality_dimensions_due;
CREATE INDEX IF NOT EXISTS marketplace_listings_taxonomy_v4_due_idx
  ON public.marketplace_listings (id) WHERE status = 'active' AND taxonomy_version < 4;

CREATE TABLE IF NOT EXISTS public.marketplace_taxonomy_validation_corpus (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  source_category text,
  title text NOT NULL,
  expected_group text NOT NULL,
  expected_department text NOT NULL,
  provenance text NOT NULL DEFAULT 'human_review',
  stratum text NOT NULL DEFAULT 'general',
  frozen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_category,title)
);
ALTER TABLE public.marketplace_taxonomy_validation_corpus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_taxonomy_validation_corpus FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.marketplace_taxonomy_validation_corpus TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_source_category_mappings (
  source_slug text NOT NULL,
  source_category text NOT NULL,
  subcategory_group text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 1.0 CHECK(confidence BETWEEN 0 AND 1),
  mapping_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_slug,source_category)
);
ALTER TABLE public.marketplace_source_category_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read marketplace source category mappings"
  ON public.marketplace_source_category_mappings FOR SELECT TO authenticated
  USING(public.has_role_jwt('admin'::public.app_role));
REVOKE ALL ON public.marketplace_source_category_mappings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketplace_source_category_mappings TO authenticated;
GRANT ALL ON public.marketplace_source_category_mappings TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_classifier_rollouts (
  classifier_version text PRIMARY KEY,
  phase text NOT NULL CHECK(phase IN('canary','expanding','complete','rolled_back','paused')),
  canary_percent numeric(5,2) NOT NULL DEFAULT 1.00,
  processed_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz,
  completed_at timestamptz,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.marketplace_classifier_rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read marketplace classifier rollouts"
  ON public.marketplace_classifier_rollouts FOR SELECT TO authenticated
  USING(public.has_role_jwt('admin'::public.app_role));
REVOKE ALL ON public.marketplace_classifier_rollouts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketplace_classifier_rollouts TO authenticated;
GRANT ALL ON public.marketplace_classifier_rollouts TO service_role;

-- Preserve the mature v3 rules as a core and layer narrowly-defined,
-- high-confidence product nouns above source mappings. Existing dependencies
-- keep pointing at the renamed OID; the listing trigger resolves the wrapper.
DO $$ BEGIN
  IF to_regprocedure('public.marketplace_subcategory_group_v3(text,text)') IS NULL THEN
    ALTER FUNCTION public.marketplace_subcategory_group(text, text)
      RENAME TO marketplace_subcategory_group_v3;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text, p_title text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(coalesce(p_title, '')) ~ '\m(cleaner|cleaning spray|toy cleaner)\M' THEN 'safer_sex'
    -- Concrete garment nouns beat material and component words. Without these,
    -- "cycling ... sleeve" looked like a masturbation sleeve and "latex tank
    -- top" / "leather ... pants" looked like generic fetish gear.
    WHEN lower(coalesce(p_title, '')) ~ '\m(cycling kit|cycle kit)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title, '')) ~ '\m(t-?shirts?|tees?|tank tops?|crop tops?|camis?|camisoles?|polos?|jerseys?|blouses?)\M' THEN 'tops'
    WHEN lower(coalesce(p_title, '')) ~ '\m(hoodies?|sweatshirts?|jackets?|coats?|bombers?)\M' THEN 'outerwear'
    WHEN lower(coalesce(p_title, '')) ~ '\m(leggings?|shorts?|trousers?|pants?|jeans?|skirts?)\M' THEN 'bottoms'
    WHEN lower(coalesce(p_title, '')) ~ '\m(dresses?|robes?)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title, '')) ~ '\m(dildo|vibrator|masturbator|stroker|butt plug|anal plug|cock ring|chastity cage|wand massager)\M'
      THEN public.marketplace_subcategory_group_v3(p_title, p_title)
    WHEN lower(coalesce(p_title, '')) ~ '\m(lubricants?|lubes?|gleitgel|douches?|enemas?|condoms?)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title, '')) ~ '\m(restraints?|cuffs?|manacles?|shackles?)\M' THEN 'bondage'
    WHEN lower(coalesce(p_title, '')) ~ '\m(harness|harnesses)\M' THEN 'harnesses'
    WHEN lower(coalesce(p_title, '')) ~ '\m(menstrual cup)\M' THEN 'grooming'
    WHEN lower(coalesce(p_title, '')) ~ '\m(jocks?|jockstraps?|briefs|boxers|thong|lingerie|underwear)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title, '')) ~ '\m(necklace|earrings?|bracelet|pendant|ring)\M'
      THEN 'jewelry'
    WHEN lower(coalesce(p_title, '')) ~ '\m(books?|novels?|memoirs?|antholog(y|ies)|paperbacks?|hardcovers?)\M'
      THEN 'books'
    ELSE public.marketplace_subcategory_group_v3(p_subcategory, p_title)
  END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_department_for_group(p_group text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_group IN ('anal_toys','dildos','masturbators','vibrators','cock_rings','chastity','pumps','lubes','poppers','safer_sex','sex_toys') THEN 'intimacy'
    WHEN p_group IN ('pup_play','bondage','impact_play','gags','hoods_masks','harnesses','collars','fetish_gear') THEN 'bdsm_fetish'
    WHEN p_group IN ('jockstraps','thongs','lingerie','underwear') THEN 'underwear'
    WHEN p_group = 'swimwear' THEN 'swimwear'
    WHEN p_group IN ('socks','outerwear','bodywear','footwear','headwear','bottoms','tops','accessories','apparel') THEN 'apparel'
    WHEN p_group = 'jewelry' THEN 'jewelry'
    WHEN p_group IN ('film','books','calendars','art') THEN 'books_art'
    WHEN p_group = 'home_goods' THEN 'home'
    WHEN p_group = 'grooming' THEN 'hygiene'
    WHEN p_group = 'services' THEN 'services'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_resolve_taxonomy_group(
  p_source_slug text,p_source_category text,p_title text,p_attributes jsonb
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_group text; v_structured text;
BEGIN
  -- 1. Curated, source-specific mappings are the strongest evidence.
  SELECT m.subcategory_group INTO v_group
  FROM public.marketplace_source_category_mappings m
  WHERE lower(m.source_slug)=lower(coalesce(p_source_slug,''))
    AND lower(btrim(m.source_category))=lower(btrim(coalesce(p_source_category,'')))
  ORDER BY m.confidence DESC LIMIT 1;
  IF v_group IS NOT NULL THEN RETURN v_group; END IF;

  -- 2. Structured product type/category fields beat prose heuristics.
  v_structured:=coalesce(p_attributes->>'product_type',p_attributes->>'category',p_attributes->>'type');
  IF v_structured IS NOT NULL THEN
    v_group:=public.marketplace_subcategory_group(v_structured);
    IF v_group<>'other' THEN RETURN v_group; END IF;
  END IF;

  -- 3. Normalized source category + high-confidence title nouns. Rows still
  -- resolving to other are eligible for the model fallback pipeline.
  RETURN public.marketplace_subcategory_group(p_source_category,p_title);
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_resolve_taxonomy_group(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_resolve_taxonomy_group(text,text,text,jsonb) TO service_role;

INSERT INTO public.marketplace_taxonomy_validation_corpus
  (source_category,title,expected_group,expected_department)
VALUES
  ('Other','Rainbow T-Shirt','tops','apparel'),
  ('Books','Sterling Rainbow Necklace','jewelry','jewelry'),
  ('Other','Silicone Dildo','dildos','intimacy'),
  ('Sex Toys','Antibacterial Toy Cleaner','safer_sex','intimacy'),
  ('Other','Queer Memoir Paperback','books','books_art'),
  ('Other','Black Hoodie','outerwear','apparel'),
  ('Other','Classic Jockstrap','jockstraps','underwear'),
  ('Other','Silver Pendant','jewelry','jewelry'),
  ('Other','Anal Plug','anal_toys','intimacy'),
  ('Other','Rechargeable Vibrator','vibrators','intimacy'),
  ('Other','Leather Chastity Cage','chastity','intimacy'),
  ('Bondage','Cotton Bondage Rope','bondage','bdsm_fetish'),
  ('Other','Queer Novel Hardcover','books','books_art'),
  ('Other','Pride Dress','apparel','apparel'),
  ('Other','Sports Leggings','bottoms','apparel'),
  ('Other','Rainbow Earrings','jewelry','jewelry'),
  ('Other','Boxer Briefs','underwear','underwear'),
  ('Other','Cock Ring','cock_rings','intimacy'),
  ('Other','Graphic Tank Top','tops','apparel'),
  ('Other','Poetry Anthology','books','books_art')
ON CONFLICT(source_category,title) DO NOTHING;

-- Human-reviewed, production-derived strata frozen on 2026-09-21. These rows
-- deliberately include known false-classification clusters, multilingual
-- source categories and ambiguous broad merchant categories; unlike the
-- synthetic boundary cases above, they exercise real catalog vocabulary.
INSERT INTO public.marketplace_taxonomy_validation_corpus
  (listing_id,source_category,title,expected_group,expected_department,provenance,stratum)
VALUES
  ('00026df8-5010-455e-af40-a997390cf991','', 'Uva Cup FDA Registered Reusable Silicone Menstrual Cup Set','grooming','hygiene','human_review:prod_2026_09_21','other_recovery'),
  ('01017677-af19-4321-8cd6-bce0d073161c','', 'Breedwell Renegade Bomber Black','outerwear','apparel','human_review:prod_2026_09_21','other_recovery'),
  ('01187f73-043b-4f3e-9364-b10131bacc4c','', 'Ankle Manacles','bondage','bdsm_fetish','human_review:prod_2026_09_21','other_recovery'),
  ('00835906-0300-446e-a8aa-544832a05f2d','Discreet,Textured,Non-Representational,Squishy','PDX Plus Shower Therapy Deep Cream Discreet Stroker','masturbators','intimacy','human_review:prod_2026_09_21','adult_boundary'),
  ('0084fd83-035d-417a-8986-3b9f299eb030','Masturbator','DORCEL - Anna Polina - Vaginaler Masturbator','masturbators','intimacy','human_review:prod_2026_09_21','multilingual'),
  ('0117fae5-9c6b-463d-b405-8f004b3f95bf','', 'Achievement Bridge Women''s Short Sleeve Cycling Kit','apparel','apparel','human_review:prod_2026_09_21','cross_department'),
  ('0136379a-a4df-4e95-9faa-dd49e7a9275b','', 'Tech Cat Women''s Short Sleeve Cycling Kit','apparel','apparel','human_review:prod_2026_09_21','cross_department'),
  ('01d32e92-329b-46a9-a69b-012787365c99','', 'Small Colorful Flowers Women''s Short Sleeve Cycling Kit','apparel','apparel','human_review:prod_2026_09_21','cross_department'),
  ('0203784f-356a-47be-81e5-49420c22f3d8','', 'Tuxedo Men''s Short Sleeve Cycling Kit','apparel','apparel','human_review:prod_2026_09_21','cross_department'),
  ('021158e7-81fd-4b59-9b78-1b394f7c6831','', 'Christmas Totem Men''s Long Sleeve Cycling Kit','apparel','apparel','human_review:prod_2026_09_21','cross_department'),
  ('021f177e-c828-48a3-94a7-f867903f004d','', 'Bike Prep Men''s Long Sleeve Cycling Kit','apparel','apparel','human_review:prod_2026_09_21','cross_department'),
  ('005381fd-f51e-40b1-bf19-cce2d67ca880','Nippelklemmen','Kink - Nippelklammern mit schwarzem Gummiband','sex_toys','intimacy','human_review:prod_2026_09_21','multilingual'),
  ('0095e7bc-82bd-4f2a-b6f7-62aba958b4c9','Packer','Pack It Lite - 4.5” Soft Packer','sex_toys','intimacy','human_review:prod_2026_09_21','adult_boundary'),
  ('00c441fe-c5ba-4658-9726-d20f44129a36','Sex Toys','PDX - Soft Travel Masturbator - Compact Masturbator','masturbators','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('00cba754-906b-4e0a-9200-a766f461c5be','Sex Toys','Satisfyer - Pocket Panda - Stimulator and Vibrator','vibrators','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('00df557f-1d45-4a96-a657-d513a1f81a2c','Sex Toys','Main Squeeze Belladonna Stroker','masturbators','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('00e26ce9-bcbf-4845-9001-bae1aaff6814','Sex Toys','TENGA - Zero Gravity - Masturbator','masturbators','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('00024336-d9a8-457a-92bd-cdcb3ba6f711','Butt Plug','Creature Cocks Blizzard Inflatable Silicone Anal Plug','anal_toys','intimacy','human_review:prod_2026_09_21','adult_boundary'),
  ('000c0835-650a-49a4-8c00-167d8ff3be51','', 'Command Pro Run Wild Vibrating Silicone Plug & Cock Ring','anal_toys','intimacy','human_review:prod_2026_09_21','adult_boundary'),
  ('00207d39-5ea5-49ca-b958-cdf212737908','Anal Plug Kit','Comets Progressive Butt Plug Set','anal_toys','intimacy','human_review:prod_2026_09_21','adult_boundary'),
  ('0021a1df-88cb-4071-95a8-dd639cdfb0fb','Ball Attachment','Magic Remote Scrotum Massager Plug','anal_toys','intimacy','human_review:prod_2026_09_21','adult_boundary'),
  ('00672eeb-7715-4387-b67f-a808f2f57fbc','Prostate,Anal Friendly,G-Spot,Harness Compatible,Suction Cup Base,Under $50,Realistic','Cotton Candy Dirty Talk Slut Print Harnessable Silicone Dildo With Suction Cup','dildos','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('009e68e0-cd9b-496e-b563-73ec6dfcec26','Good For Beginners,Adjustable Speed,Plug-In,Non-Representational,Powerful Vibration','Stoner Vibes Wacky Leaf Print Wand Massager','vibrators','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('00a36370-c570-4871-8b23-9c21bd7f18d9','Prostate,Anal Friendly,G-Spot,Textured,Harness Compatible,Non-Representational,Girthy,Suction Cup Base,Bespoke','Creature Cocks Leviathan Tentacle Fantasy Dildo','dildos','intimacy','human_review:prod_2026_09_21','adult_specificity'),
  ('0029ac50-577b-41d7-9e37-a52628572506','', 'Fetters USA Padded Locking Wrist Restraints','bondage','bdsm_fetish','human_review:prod_2026_09_21','bdsm_specificity'),
  ('006c820d-4e0f-4e06-8e0c-ba0b3aef1a5b','BDSM and Bondage','ruff GEAR Heavy Duty Stainless Steel Wrist Shackles','bondage','bdsm_fetish','human_review:prod_2026_09_21','bdsm_specificity'),
  ('00828b67-d581-4477-bf9b-71b20fd8a6b8','', 'Spectra Bondage Rainbow Wrist Cuffs','bondage','bdsm_fetish','human_review:prod_2026_09_21','bdsm_specificity'),
  ('00bb1242-297c-48da-b3ca-03c2745c207f','Fesseln','Begme - Bondage-Verbindungsriemen - vielseitige Fixierung','bondage','bdsm_fetish','human_review:prod_2026_09_21','multilingual'),
  ('010ddf44-da72-476d-8a98-51f14f78ab42','BDSM and Bondage','Mister B Leather X-Back Harness Premium Red','harnesses','bdsm_fetish','human_review:prod_2026_09_21','bdsm_specificity'),
  ('002870be-4272-4d3a-a608-aac67ea6338d','Print > Satin Slip Dress','Pink And Yellow Stripes Y2K Print Satin Cowl Neck Slip Dress Cherrykitten','apparel','apparel','human_review:prod_2026_09_21','apparel'),
  ('009b01b6-adb6-49a2-84d7-dd33c7611a87','Pride > Print > Print Slip Dress','Tie Dye Trans Pride Y2K Print Slip Dress Cherrykitten','apparel','apparel','human_review:prod_2026_09_21','apparel'),
  ('010215c3-15d8-4dbf-9086-85d8230284c1','Activewear','Pace 2.5" Short - Black','bottoms','apparel','human_review:prod_2026_09_21','apparel'),
  ('000aacfb-9284-411c-99c7-baf2f2e4e2a0','Underwear and Swimwear','Obsessive - Iosa - Crotchless Teddy','underwear','underwear','human_review:prod_2026_09_21','underwear'),
  ('0046c3a9-9879-4fe5-9b2f-c33872608106','Underwear and Swimwear','Burgundy Slim Fit Leather Tracksuit Pants','bottoms','apparel','human_review:prod_2026_09_21','cross_department'),
  ('00481734-2e98-42ea-aa23-caa9b3c2ac29','Underwear and Swimwear','Longline Work Shorts - Hawaiian Blue','bottoms','apparel','human_review:prod_2026_09_21','cross_department'),
  ('004efbeb-b7ca-45d9-a7fd-c173ecbcc215','Underwear and Swimwear','Team Brief','underwear','underwear','human_review:prod_2026_09_21','underwear'),
  ('006ecb14-b984-49a5-a181-e00283c19f38','Underwear and Swimwear','Prowler RED Switch Jock Badges Pack 1','jockstraps','underwear','human_review:prod_2026_09_21','underwear'),
  ('00a5c283-71e0-4227-969b-3d3168e01fb0','Underwear','Shift Brief Underwear - Indigo Smiley','underwear','underwear','human_review:prod_2026_09_21','underwear'),
  ('00dde32a-b462-4f78-b8d9-217306e2e481','Packer Underwear','Shift 9" Boxer Underwear - Orange Camo','underwear','underwear','human_review:prod_2026_09_21','underwear'),
  ('00278bc6-3cf7-44bc-8e1b-bfd03a40bef3','Jewelry and Pins','Industrial Hammered Band','jewelry','jewelry','human_review:prod_2026_09_21','jewelry'),
  ('0071fbc5-9e50-43c9-b7f6-88d24f27c46a','Earrings','Blood Shed Axe Acrylic Single Earring- Black','jewelry','jewelry','human_review:prod_2026_09_21','jewelry'),
  ('00cc3456-cd84-4c38-8835-8d2fd2f54c87','Charms','Peridot Charm','jewelry','jewelry','human_review:prod_2026_09_21','jewelry'),
  ('00d0a69b-10fa-4c55-a021-79303a817835','Jewelry and Pins','Butterfly Earring','jewelry','jewelry','human_review:prod_2026_09_21','jewelry'),
  ('011df443-ae9b-4bf3-b8e4-1bc6d3fb7ed9','Custom','14k White Gold Bezel-set 1.50ct 9mm Round Australian Opal Pendant on 17” Mini Miami Chain Custom Necklace','jewelry','jewelry','human_review:prod_2026_09_21','jewelry'),
  ('0003a598-a287-44cf-87a0-e27587256b58','Book','I Hope This Finds You Well: Poems','books','books_art','human_review:prod_2026_09_21','books'),
  ('0005d4c1-e42d-4c80-b191-ebd6f0acd158','Books','Glitter And Be Gay','books','books_art','human_review:prod_2026_09_21','books'),
  ('00165482-6665-4df2-b86a-e63e10f5531c','Books and Art','Cloud Nine','books','books_art','human_review:prod_2026_09_21','books'),
  ('001b72ae-3cf7-4434-b8a3-8280aaf1acf8','Books and Art','The Autistic Burnout Workbook : Your Guide to Your Personal Recovery Plan','books','books_art','human_review:prod_2026_09_21','books'),
  ('004c47bf-6395-4bd2-b27c-448dfdbf9568','Book','Atomic Habits: An Easy & Proven Way to Build Good Habits & Break Bad Ones','books','books_art','human_review:prod_2026_09_21','books'),
  ('0010678f-a657-4470-b3f3-0f5a59c47fb5','Tops','Dense Blackout Latex Tank Top Purple','tops','apparel','human_review:prod_2026_09_21','apparel'),
  ('0014c3f1-8bb9-400d-a293-4ae2f9f2db3f','Pride > Print > Print Cami','Sunset Pond Swans Pride Y2K Print Cami Crop Top Cherrykitten','tops','apparel','human_review:prod_2026_09_21','apparel'),
  ('002d5fa8-3718-4f13-ad50-763ce92c45c3','Low Arm Tank','Dick Pix Low Arm Shredder Tank- Black','tops','apparel','human_review:prod_2026_09_21','apparel'),
  ('0039f239-fa51-4bdc-9b78-4fb049da7d5a','Extreme Crop Tee','Multipack-Core Extreme Crop Tees-Basics','tops','apparel','human_review:prod_2026_09_21','apparel'),
  ('000b5c89-01f5-4e13-b59e-1f5efb8124d8','Clearance','Blue Denim Y2K Mini Skirt Cherrykitten','bottoms','apparel','human_review:prod_2026_09_21','apparel'),
  ('00148fca-8bef-45ed-8007-f8b2909f05be','Pride > Shorts > Beach Shorts','Trans Dots On Black Pride Y2K Print Men Beach Shorts Cherrykitten','bottoms','apparel','human_review:prod_2026_09_21','apparel'),
  ('003b65b5-3673-4fd6-8ccd-9938c9ebe33d','', 'Code 22 Denim Short Black','bottoms','apparel','human_review:prod_2026_09_21','apparel'),
  ('0078bd57-0c59-418a-b78e-414eb8d3170d','bottom short','Short Luka - Royal-White','bottoms','apparel','human_review:prod_2026_09_21','apparel'),
  ('0054b4b7-74fe-4ee3-b480-7522cf5cb90c','Hygiene and Care','Eros - Medical Lubricant on Silicone Basis','lubes','intimacy','human_review:prod_2026_09_21','cross_department'),
  ('00baa78f-b284-4519-8239-75a86aa4e153','Hygiene and Care','Andro Vita - Pheromone Fragrance for Men','grooming','hygiene','human_review:prod_2026_09_21','hygiene'),
  ('00ce72a3-6344-418a-bd84-9e884fc33d61','Verzögerungsspray','intt - Dura Max Power Delay Spray','grooming','hygiene','human_review:prod_2026_09_21','multilingual'),
  ('00e93c5c-b256-48a2-9d41-e5bbc2ff6e19','Hygiene and Care','Prowler Small Bulb Silicone Douche Black','safer_sex','intimacy','human_review:prod_2026_09_21','cross_department'),
  ('01866d70-28bc-4930-ae43-5497fd19b48f','Parfums','Eye Of Love - Matchmaker Red Diamond Pheromone Parfüm','grooming','hygiene','human_review:prod_2026_09_21','multilingual')
ON CONFLICT(source_category,title) DO UPDATE SET
  listing_id=excluded.listing_id,expected_group=excluded.expected_group,
  expected_department=excluded.expected_department,provenance=excluded.provenance,stratum=excluded.stratum;

CREATE OR REPLACE FUNCTION public.marketplace_validate_taxonomy_corpus()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH scored AS (
    SELECT c.*,
      public.marketplace_subcategory_group(c.source_category,c.title) actual_group
    FROM public.marketplace_taxonomy_validation_corpus c
  )
  SELECT jsonb_build_object(
    'total',count(*),
    'department_accuracy',coalesce(avg((public.marketplace_department_for_group(actual_group)=expected_department)::int),0),
    'group_accuracy',coalesce(avg((actual_group=expected_group)::int),0),
    'department_pass',coalesce(avg((public.marketplace_department_for_group(actual_group)=expected_department)::int),0)>=0.95,
    'group_pass',coalesce(avg((actual_group=expected_group)::int),0)>=0.90)
  FROM scored;
$$;
REVOKE ALL ON FUNCTION public.marketplace_validate_taxonomy_corpus() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_validate_taxonomy_corpus() TO service_role;

INSERT INTO public.marketplace_classifier_rollouts(classifier_version,phase,canary_percent)
VALUES('marketplace-taxonomy-v4','paused',1.00)
ON CONFLICT(classifier_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketplace_listings_derive_taxonomy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_group text; v_core_group text;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.subcategory IS DISTINCT FROM OLD.subcategory
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.taxonomy_v3_at IS NULL
     OR (NEW.taxonomy_version >= 4 AND OLD.taxonomy_version < 4) THEN
    v_group := public.marketplace_resolve_taxonomy_group(NEW.source_type,NEW.subcategory,NEW.title,NEW.attributes);
    v_core_group := public.marketplace_subcategory_group_v3(NEW.subcategory, NEW.title);
    NEW.subcategory_group := v_group;
    NEW.department := public.marketplace_department_for_group(v_group);
    -- The existing fine classifier is tied to the v3 core OID. If a v4
    -- high-confidence override changes the group, no leaf is safer than a
    -- contradictory leaf; otherwise retain the mature fine classifier.
    NEW.subcategory_fine := CASE WHEN v_group IS DISTINCT FROM v_core_group THEN NULL
      ELSE public.marketplace_subcategory_fine(NEW.subcategory, NEW.title) END;
    NEW.taxonomy_v3_at := now();
    NEW.taxonomy_version := 4;
    NEW.taxonomy_classifier_version := 'marketplace-taxonomy-v4';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_claim_taxonomy_model(p_limit integer DEFAULT 25,p_dry_run boolean DEFAULT false)
RETURNS TABLE(id uuid,title text,description text,source_category text,attributes jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.marketplace_classifier_rollouts
    WHERE classifier_version='marketplace-taxonomy-v4' AND phase IN('expanding','complete')) THEN
    RETURN;
  END IF;
  IF p_dry_run THEN
    RETURN QUERY SELECT l.id,l.title,l.description,l.subcategory,l.attributes
    FROM public.marketplace_listings l
    WHERE l.status='active' AND l.taxonomy_version=4 AND l.subcategory_group='other'
      AND coalesce(l.taxonomy_model_status,'pending') IN('pending','failed')
      AND l.taxonomy_model_attempts<3
    ORDER BY l.updated_at,l.id LIMIT greatest(1,least(p_limit,50));
    RETURN;
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT l.id FROM public.marketplace_listings l
    WHERE l.status='active' AND l.taxonomy_version=4 AND l.subcategory_group='other'
      AND coalesce(l.taxonomy_model_status,'pending') IN('pending','failed')
      AND l.taxonomy_model_attempts<3
    ORDER BY l.updated_at,l.id LIMIT greatest(1,least(p_limit,50))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.marketplace_listings l SET taxonomy_model_status='processing',
      taxonomy_model_attempts=taxonomy_model_attempts+1
    FROM due WHERE l.id=due.id
    RETURNING l.id,l.title,l.description,l.subcategory,l.attributes
  )
  SELECT c.id,c.title,c.description,c.subcategory,c.attributes FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_claim_taxonomy_model(integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_claim_taxonomy_model(integer,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_taxonomy_v3_backfill(p_batch integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changed integer; v_remaining integer; v_phase text; v_processed integer;
  v_canary_target integer; v_semantic_changes integer; v_adult_shifts integer;
  v_corpus jsonb; v_evaluation jsonb;
BEGIN
  SELECT phase,processed_count INTO v_phase,v_processed
  FROM public.marketplace_classifier_rollouts
  WHERE classifier_version='marketplace-taxonomy-v4' FOR UPDATE;
  IF v_phase IN('paused','rolled_back','complete') THEN
    RETURN jsonb_build_object('items_examined',0,'items_changed',0,'items_terminal',0,'phase',v_phase);
  END IF;

  WITH due AS (
    SELECT id FROM public.marketplace_listings
    WHERE status = 'active' AND taxonomy_version < 4
      AND (v_phase <> 'canary' OR mod(abs(hashtextextended(id::text,0)),100)=0)
    ORDER BY id LIMIT GREATEST(1, LEAST(p_batch, 100)) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.marketplace_listings l SET taxonomy_version = 4
  FROM due WHERE l.id = due.id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  UPDATE public.marketplace_classifier_rollouts
  SET processed_count=processed_count+v_changed
  WHERE classifier_version='marketplace-taxonomy-v4'
  RETURNING processed_count INTO v_processed;

  IF v_phase='canary' THEN
    SELECT greatest(1,ceil(count(*)*0.01)::integer) INTO v_canary_target
    FROM public.marketplace_listings WHERE status='active';
    IF v_processed>=v_canary_target OR NOT EXISTS(
      SELECT 1 FROM public.marketplace_listings
      WHERE status='active' AND taxonomy_version<4
        AND mod(abs(hashtextextended(id::text,0)),100)=0
    ) THEN
      SELECT count(*),count(*) FILTER(WHERE new_value->>'department' IN('intimacy','bdsm_fetish')
        AND coalesce(previous_value->>'department','other') NOT IN('intimacy','bdsm_fetish'))
      INTO v_semantic_changes,v_adult_shifts
      FROM public.marketplace_quality_events
      WHERE classifier_version='marketplace-taxonomy-v4'
        AND created_at>=(SELECT started_at FROM public.marketplace_classifier_rollouts WHERE classifier_version='marketplace-taxonomy-v4');
      v_corpus:=public.marketplace_validate_taxonomy_corpus();
      v_evaluation:=jsonb_build_object('processed',v_processed,'changed',v_semantic_changes,
        'adult_shifts',v_adult_shifts,'corpus',v_corpus);

      IF NOT coalesce((v_corpus->>'department_pass')::boolean,false)
         OR NOT coalesce((v_corpus->>'group_pass')::boolean,false)
         OR v_adult_shifts>greatest(10,ceil(v_processed*0.10)) THEN
        UPDATE public.marketplace_listings l SET
          department=e.previous_value->>'department',
          subcategory_group=e.previous_value->>'group',
          subcategory_fine=e.previous_value->>'fine',
          taxonomy_version=4
        FROM public.marketplace_quality_events e
        WHERE e.listing_id=l.id AND e.classifier_version='marketplace-taxonomy-v4'
          AND e.rolled_back_at IS NULL
          AND e.created_at>=(SELECT started_at FROM public.marketplace_classifier_rollouts WHERE classifier_version='marketplace-taxonomy-v4');
        UPDATE public.marketplace_quality_events SET rolled_back_at=now()
        WHERE classifier_version='marketplace-taxonomy-v4' AND rolled_back_at IS NULL;
        UPDATE public.marketplace_classifier_rollouts
        SET phase='rolled_back',evaluated_at=now(),evaluation=v_evaluation
        WHERE classifier_version='marketplace-taxonomy-v4';
        RETURN jsonb_build_object('items_examined',v_changed,'items_changed',v_changed,
          'items_terminal',v_changed,'phase','rolled_back','evaluation',v_evaluation);
      END IF;

      UPDATE public.marketplace_classifier_rollouts
      SET phase='expanding',evaluated_at=now(),changed_count=v_semantic_changes,evaluation=v_evaluation
      WHERE classifier_version='marketplace-taxonomy-v4';
      v_phase:='expanding';
    END IF;
  END IF;

  SELECT count(*) INTO v_remaining FROM public.marketplace_listings
  WHERE status = 'active' AND taxonomy_version < 4;
  IF v_phase='expanding' AND v_remaining=0 THEN
    UPDATE public.marketplace_classifier_rollouts SET phase='complete',completed_at=now()
    WHERE classifier_version='marketplace-taxonomy-v4';
    v_phase:='complete';
  END IF;
  RETURN jsonb_build_object('items_examined', v_changed, 'items_changed', v_changed,
                            'items_terminal', v_changed, 'remaining', v_remaining,'phase',v_phase);
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_record_quality_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rollback_of bigint := nullif(current_setting('app.marketplace_quality_rollback_of',true),'')::bigint;
BEGIN
  IF ROW(OLD.department, OLD.subcategory_group, OLD.subcategory_fine)
       IS DISTINCT FROM ROW(NEW.department, NEW.subcategory_group, NEW.subcategory_fine) THEN
    INSERT INTO public.marketplace_quality_events
      (listing_id, dimension, previous_value, new_value, classifier_version, confidence, rollback_of)
    VALUES (NEW.id, 'taxonomy',
      jsonb_build_object('department', OLD.department, 'group', OLD.subcategory_group, 'fine', OLD.subcategory_fine),
      jsonb_build_object('department', NEW.department, 'group', NEW.subcategory_group, 'fine', NEW.subcategory_fine),
      coalesce(NEW.taxonomy_classifier_version,'marketplace-taxonomy-v4'),
      CASE WHEN NEW.taxonomy_classifier_version LIKE '%model%' THEN NEW.taxonomy_confidence ELSE 0.95 END,
      v_rollback_of);
  END IF;
  IF OLD.content_rating IS DISTINCT FROM NEW.content_rating THEN
    INSERT INTO public.marketplace_quality_events
      (listing_id, dimension, previous_value, new_value, classifier_version, confidence)
    VALUES (NEW.id, 'safety', to_jsonb(OLD.content_rating), to_jsonb(NEW.content_rating),
            'marketplace-content-rating-2026-09-21', 0.90);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketplace_record_quality_change_trg ON public.marketplace_listings;
CREATE TRIGGER marketplace_record_quality_change_trg
AFTER UPDATE ON public.marketplace_listings FOR EACH ROW
EXECUTE FUNCTION public.marketplace_record_quality_change();

CREATE OR REPLACE FUNCTION public.marketplace_rollback_quality_events(p_event_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_event public.marketplace_quality_events%ROWTYPE; v_changed integer:=0;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE='42501';
  END IF;
  IF coalesce(cardinality(p_event_ids),0)=0 OR cardinality(p_event_ids)>100 THEN
    RAISE EXCEPTION 'select between 1 and 100 events' USING ERRCODE='22023';
  END IF;

  FOR v_event IN
    SELECT * FROM public.marketplace_quality_events
    WHERE id=ANY(p_event_ids) AND dimension='taxonomy' AND rolled_back_at IS NULL
    ORDER BY id FOR UPDATE
  LOOP
    PERFORM set_config('app.marketplace_quality_rollback_of',v_event.id::text,true);
    UPDATE public.marketplace_listings SET
      department=v_event.previous_value->>'department',
      subcategory_group=v_event.previous_value->>'group',
      subcategory_fine=nullif(v_event.previous_value->>'fine',''),
      taxonomy_version=4,
      taxonomy_classifier_version='rollback:manual'
    WHERE id=v_event.listing_id;
    IF FOUND THEN
      UPDATE public.marketplace_quality_events SET rolled_back_at=now() WHERE id=v_event.id;
      v_changed:=v_changed+1;
    END IF;
  END LOOP;
  PERFORM set_config('app.marketplace_quality_rollback_of','',true);
  RETURN jsonb_build_object('items_examined',cardinality(p_event_ids),'items_changed',v_changed);
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_rollback_quality_events(bigint[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketplace_rollback_quality_events(bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_mark_quality_dirty()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.title, NEW.description, NEW.brand, NEW.images, NEW.department,
         NEW.subcategory_group, NEW.subcategory_fine, NEW.content_rating,
         NEW.link_health, NEW.link_checked_at, NEW.last_seen_at, NEW.merchant_id)
     IS DISTINCT FROM
     ROW(OLD.title, OLD.description, OLD.brand, OLD.images, OLD.department,
         OLD.subcategory_group, OLD.subcategory_fine, OLD.content_rating,
         OLD.link_health, OLD.link_checked_at, OLD.last_seen_at, OLD.merchant_id) THEN
    NEW.quality_dimensions_due := true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketplace_mark_quality_dirty_trg ON public.marketplace_listings;
CREATE TRIGGER marketplace_mark_quality_dirty_trg
BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW
EXECUTE FUNCTION public.marketplace_mark_quality_dirty();

CREATE OR REPLACE FUNCTION public.marketplace_recompute_quality_dimensions(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed integer; v_remaining integer;
BEGIN
  WITH due AS MATERIALIZED (
    SELECT l.id
    FROM public.marketplace_listings l
    WHERE l.status = 'active' AND l.quality_dimensions_due
    ORDER BY l.id LIMIT GREATEST(1, LEAST(p_limit, 1000))
    FOR UPDATE SKIP LOCKED
  ), scored AS (
    SELECT l.id,
      (25 * (coalesce(btrim(l.title), '') <> '')::int
       + 25 * (length(coalesce(btrim(l.description), '')) >= 80)::int
       + 25 * (l.price IS NOT NULL)::int
       + 25 * (coalesce(array_length(l.images, 1), 0) > 0)::int)::smallint AS completeness,
      (50 * (EXISTS (SELECT 1 FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id
                    WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=l.id
                      AND ia.status='active' AND ia.optimization_status IN ('optimized','cdn_optimized')))::int
       + 25 * (NOT EXISTS (SELECT 1 FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id
                          WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=l.id
                            AND coalesce(btrim(ia.alt_text),'')=''))::int
       + 25 * (EXISTS (SELECT 1 FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id
                      WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=l.id
                        AND ia.width IS NOT NULL AND ia.height IS NOT NULL))::int)::smallint AS media,
      (CASE WHEN l.department <> 'other' AND l.subcategory_group <> 'other' THEN 0.95
            WHEN l.department <> 'other' THEN 0.75 ELSE 0.35 END)::numeric(4,3) AS taxonomy,
      (CASE WHEN l.content_rating IN ('adult','explicit') THEN 0.95
            WHEN l.subcategory_group IN ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys') THEN 0.55
            ELSE 0.90 END)::numeric(4,3) AS safety,
      (CASE WHEN l.last_seen_at >= now()-interval '14 days' OR l.link_checked_at >= now()-interval '30 days' THEN 100
            WHEN l.link_checked_at >= now()-interval '60 days' THEN 60 ELSE 20 END)::smallint AS freshness,
      (50 * (l.merchant_id IS NOT NULL)::int
       + 50 * (EXISTS (SELECT 1 FROM public.marketplace_listing_sources s WHERE s.listing_id=l.id))::int)::smallint AS linkage
    FROM public.marketplace_listings l JOIN due ON due.id=l.id
  )
  UPDATE public.marketplace_listings l SET
    completeness_score=s.completeness, media_quality_score=s.media,
    taxonomy_confidence=s.taxonomy, safety_confidence=s.safety,
    freshness_score=s.freshness, linkage_score=s.linkage,
    quality_dimensions_at=now(), quality_dimensions_due=false,
    quality_score=round((s.completeness+s.media+s.freshness+s.linkage+s.taxonomy*100+s.safety*100)/6.0)
  FROM scored s WHERE l.id=s.id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  SELECT count(*) INTO v_remaining FROM public.marketplace_listings
  WHERE status='active' AND quality_dimensions_due;
  RETURN jsonb_build_object('items_examined',v_changed,'items_changed',v_changed,
                            'items_terminal',0,'remaining',v_remaining);
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_recompute_quality_dimensions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_recompute_quality_dimensions(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Truthful worker accounting and richer monitoring snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketplace_source_quality_snapshots (
  snapshot_id bigint NOT NULL REFERENCES public.marketplace_quality_snapshots(id) ON DELETE CASCADE,
  source_slug text NOT NULL,
  active_count integer NOT NULL,
  defect_count integer NOT NULL,
  defect_rate numeric(7,6) NOT NULL,
  PRIMARY KEY(snapshot_id,source_slug)
);
CREATE INDEX IF NOT EXISTS marketplace_source_quality_source_idx
  ON public.marketplace_source_quality_snapshots(source_slug,snapshot_id DESC);
ALTER TABLE public.marketplace_source_quality_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_source_quality_snapshots FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.marketplace_source_quality_snapshots TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_quality_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_type text NOT NULL,
  dedupe_key text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK(severity IN('warning','critical')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_quality_alerts_open_key_idx
  ON public.marketplace_quality_alerts(dedupe_key) WHERE resolved_at IS NULL;
ALTER TABLE public.marketplace_quality_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read marketplace quality alerts"
  ON public.marketplace_quality_alerts FOR SELECT TO authenticated
  USING(public.has_role_jwt('admin'::public.app_role));
REVOKE ALL ON public.marketplace_quality_alerts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketplace_quality_alerts TO authenticated;
GRANT ALL ON public.marketplace_quality_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.admin_marketplace_run_metrics()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_body jsonb; v_text text;
BEGIN
  IF NEW.automation_slug NOT IN ('marketplace_variant_backfill','marketplace_link_checker',
      'marketplace_description_enhance','marketplace_image_retry','marketplace_taxonomy_classify') THEN RETURN NEW; END IF;
  v_text := coalesce(NEW.summary #>> '{requests,0,body}', NEW.summary->>'body');
  BEGIN v_body := v_text::jsonb; EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
  NEW.items_examined := greatest(coalesce(NEW.items_examined,0), coalesce(
    (v_body->>'items_examined')::int, (v_body->>'items_processed')::int,
    (v_body->>'processed')::int, (v_body->>'items')::int, 0));
  NEW.items_changed := greatest(coalesce(NEW.items_changed,0), coalesce(
    (v_body->>'items_changed')::int, (v_body->>'items_succeeded')::int,
    (v_body->>'listings_updated')::int, 0));
  NEW.summary := coalesce(NEW.summary,'{}'::jsonb) || jsonb_build_object(
    'worker_metrics', jsonb_build_object(
      'examined', NEW.items_examined, 'changed', NEW.items_changed,
      'terminal', coalesce((v_body->>'items_terminal')::int,0),
      'failed', coalesce((v_body->>'items_failed')::int,(v_body->>'failed')::int,0)));
  IF NEW.status = 'success' AND coalesce((v_body->>'items_failed')::int,(v_body->>'failed')::int,0) > 0
     AND NEW.items_changed = 0 THEN NEW.status := 'error'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS aa_admin_marketplace_run_metrics_trg ON public.admin_automation_runs;
CREATE TRIGGER aa_admin_marketplace_run_metrics_trg
BEFORE INSERT OR UPDATE OF summary, status, finished_at ON public.admin_automation_runs
FOR EACH ROW EXECUTE FUNCTION public.admin_marketplace_run_metrics();

CREATE OR REPLACE FUNCTION public.run_marketplace_quality_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stats jsonb; v_snapshot_id bigint;
BEGIN
  WITH boiler AS (
    SELECT md5(lower(btrim(description))) h, count(*) n
    FROM public.marketplace_listings WHERE status='active' AND coalesce(btrim(description),'')<>''
    GROUP BY 1 HAVING count(*)>5
  ), pixel_sample AS (
    SELECT ia.id,ia.width
    FROM public.image_asset_links ial
    JOIN public.image_assets ia ON ia.id=ial.asset_id
    JOIN public.marketplace_listings ml ON ml.id=ial.entity_id
    WHERE ial.entity_type='marketplace_listing' AND ml.status='active'
      AND ia.width IS NOT NULL AND ia.width>0
    ORDER BY md5(ia.id::text||date_trunc('month',now())::text)
    LIMIT 500
  ), l AS (
    SELECT count(*) active_total,
      count(*) FILTER(WHERE department='other') dept_other,
      count(*) FILTER(WHERE coalesce(btrim(description),'')='') no_description,
      count(*) FILTER(WHERE length(coalesce(btrim(description),'')) BETWEEN 1 AND 79) thin_description,
      count(*) FILTER(WHERE coalesce(array_length(images,1),0)=0) no_image,
      count(*) FILTER(WHERE merchant_id IS NULL) no_merchant_id,
      count(*) FILTER(WHERE link_checked_at IS NULL) link_never_checked,
      count(*) FILTER(WHERE (link_checked_at IS NULL OR link_checked_at<now()-interval '30 days')
                            AND (last_seen_at IS NULL OR last_seen_at<now()-interval '30 days')) link_stale_30d,
      count(*) FILTER(WHERE attributes_extracted_at IS NULL) attributes_pending,
      count(*) FILTER(WHERE content_rating='sfw' AND subcategory_group IN
        ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys')) safety_conflicts,
      count(*) FILTER(WHERE tagged_at IS NOT NULL) tagged
    FROM public.marketplace_listings WHERE status='active'
  ) SELECT jsonb_build_object(
    'active_total',l.active_total,'dept_other',l.dept_other,'no_description',l.no_description,
    'thin_description',l.thin_description,'boilerplate_rows',coalesce((SELECT sum(n) FROM boiler),0),
    'boilerplate_groups',coalesce((SELECT count(*) FROM boiler),0),'no_image',l.no_image,
    'no_merchant_id',l.no_merchant_id,'source_link_missing',(SELECT count(*) FROM public.marketplace_listings x WHERE x.status='active' AND NOT EXISTS(SELECT 1 FROM public.marketplace_listing_sources s WHERE s.listing_id=x.id)),
    'link_never_checked',l.link_never_checked,'link_stale_30d',l.link_stale_30d,
    'attributes_pending',l.attributes_pending,'variant_rows',(SELECT count(*) FROM public.marketplace_listing_variants),
    'variant_listings',(SELECT count(DISTINCT listing_id) FROM public.marketplace_listing_variants),
    'image_opt_failed',(SELECT count(DISTINCT ial.entity_id) FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id WHERE ial.entity_type='marketplace_listing' AND ia.optimization_status='failed'),
    'image_opt_missing',(SELECT count(*) FROM public.marketplace_listings x WHERE x.status='active' AND NOT EXISTS(SELECT 1 FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=x.id AND ia.optimization_status IN('optimized','cdn_optimized'))),
    'image_dimensions_missing',(SELECT count(DISTINCT ial.entity_id) FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id WHERE ial.entity_type='marketplace_listing' AND (ia.width IS NULL OR ia.height IS NULL)),
    'image_pixel_sample_size',(SELECT count(*) FROM pixel_sample),
    'image_under_600px',(SELECT count(*) FROM pixel_sample WHERE width<600),
    'image_under_800px',(SELECT count(*) FROM pixel_sample WHERE width<800),
    'image_under_600px_pct',(SELECT coalesce(round(100.0*count(*) FILTER(WHERE width<600)/nullif(count(*),0),1),0) FROM pixel_sample),
    'alt_text_missing',(SELECT count(DISTINCT ial.entity_id) FROM public.image_asset_links ial JOIN public.image_assets ia ON ia.id=ial.asset_id WHERE ial.entity_type='marketplace_listing' AND coalesce(btrim(ia.alt_text),'')=''),
    'safety_conflicts',l.safety_conflicts,'inactive_unexplained',(SELECT count(*) FROM public.marketplace_listings WHERE status='inactive' AND archived_reason IS NULL),
    'price_history_usd_missing',(SELECT count(*) FROM public.marketplace_price_history WHERE price_usd IS NULL),
    'variant_worker_enabled',coalesce((SELECT enabled::int FROM public.admin_automations WHERE slug='marketplace_variant_backfill'),0),
    'variant_worker_failures',coalesce((SELECT consecutive_failures FROM public.admin_automations WHERE slug='marketplace_variant_backfill'),0),
    'variant_last_productive_hours',coalesce((SELECT round(extract(epoch FROM(now()-max(finished_at)))/3600) FROM public.admin_automation_runs WHERE automation_slug='marketplace_variant_backfill' AND items_changed>0),-1),
    'link_worker_enabled',coalesce((SELECT enabled::int FROM public.admin_automations WHERE slug='marketplace_link_checker'),0),
    'link_worker_failures',coalesce((SELECT consecutive_failures FROM public.admin_automations WHERE slug='marketplace_link_checker'),0),
    'link_last_productive_hours',coalesce((SELECT round(extract(epoch FROM(now()-max(finished_at)))/3600) FROM public.admin_automation_runs WHERE automation_slug='marketplace_link_checker' AND items_changed>0),-1),
    'description_last_productive_hours',coalesce((SELECT round(extract(epoch FROM(now()-max(finished_at)))/3600) FROM public.admin_automation_runs WHERE automation_slug='marketplace_description_enhance' AND items_changed>0),-1),
    'variant_24h_examined',coalesce((SELECT sum(items_examined) FROM public.admin_automation_runs WHERE automation_slug='marketplace_variant_backfill' AND started_at>now()-interval '24 hours'),0),
    'variant_estimated_drain_hours',ceil(l.attributes_pending::numeric / greatest(coalesce((SELECT sum(items_examined) FROM public.admin_automation_runs WHERE automation_slug='marketplace_variant_backfill' AND started_at>now()-interval '24 hours'),0)::numeric/24,1)),
    'workers_no_progress_3',(SELECT count(*) FROM public.admin_automations a WHERE a.slug IN ('marketplace_variant_backfill','marketplace_link_checker','marketplace_description_enhance','marketplace_image_retry') AND CASE a.slug WHEN 'marketplace_variant_backfill' THEN l.attributes_pending>0 WHEN 'marketplace_link_checker' THEN l.link_stale_30d>0 WHEN 'marketplace_description_enhance' THEN l.no_description+l.thin_description+coalesce((SELECT sum(n) FROM boiler),0)>0 WHEN 'marketplace_image_retry' THEN EXISTS(SELECT 1 FROM public.image_assets WHERE optimization_status='failed') ELSE false END AND 3=(SELECT count(*) FROM (SELECT 1 FROM public.admin_automation_runs r WHERE r.automation_slug=a.slug AND r.finished_at IS NOT NULL ORDER BY r.started_at DESC LIMIT 3) z) AND NOT EXISTS (SELECT 1 FROM (SELECT r.items_changed,r.summary FROM public.admin_automation_runs r WHERE r.automation_slug=a.slug AND r.finished_at IS NOT NULL ORDER BY r.started_at DESC LIMIT 3) z WHERE z.items_changed>0 OR coalesce((z.summary#>>'{worker_metrics,terminal}')::int,0)>0)),
    'link_checker_24h_examined',coalesce((SELECT sum(items_examined) FROM public.admin_automation_runs WHERE automation_slug='marketplace_link_checker' AND started_at>now()-interval '24 hours'),0),
    'tagged',l.tagged,'brands_pending',(SELECT count(*) FROM public.marketplace_brands WHERE status='pending'),
    'guide_picks',(SELECT count(*) FROM public.guide_picks WHERE entity_type='marketplace' AND NOT is_orphaned),
    'enhance_queue',(SELECT count(*) FROM public.marketplace_enhance_queue)
  ) INTO v_stats FROM l;
  INSERT INTO public.marketplace_quality_snapshots(stats) VALUES(v_stats) RETURNING id INTO v_snapshot_id;

  INSERT INTO public.marketplace_source_quality_snapshots
    (snapshot_id,source_slug,active_count,defect_count,defect_rate)
  SELECT v_snapshot_id,coalesce(nullif(l.source_type,''),'unknown'),count(*),
    count(*) FILTER(WHERE coalesce(btrim(l.description),'')='' OR l.department='other'
      OR l.merchant_id IS NULL OR coalesce(array_length(l.images,1),0)=0),
    (count(*) FILTER(WHERE coalesce(btrim(l.description),'')='' OR l.department='other'
      OR l.merchant_id IS NULL OR coalesce(array_length(l.images,1),0)=0))::numeric/count(*)
  FROM public.marketplace_listings l WHERE l.status='active'
  GROUP BY coalesce(nullif(l.source_type,''),'unknown');

  -- Backlog growth must be monotonic across three snapshots, not one noisy
  -- comparison. Open alerts are upserted; a healthy snapshot resolves them.
  WITH keys(key) AS (VALUES('attributes_pending'),('image_opt_failed'),('link_stale_30d'),('no_description')),
  series AS (
    SELECT k.key,array_agg((q.stats->>k.key)::numeric ORDER BY q.taken_at DESC) values_desc
    FROM keys k CROSS JOIN LATERAL (
      SELECT stats,taken_at FROM public.marketplace_quality_snapshots ORDER BY taken_at DESC LIMIT 3
    ) q GROUP BY k.key
  ), growing AS (
    SELECT key,values_desc FROM series WHERE cardinality(values_desc)=3
      AND values_desc[1]>values_desc[2] AND values_desc[2]>values_desc[3]
  )
  INSERT INTO public.marketplace_quality_alerts(alert_type,dedupe_key,severity,message,details)
  SELECT 'backlog_growth','backlog:'||key,'warning',key||' grew for two consecutive snapshots',
    jsonb_build_object('values',values_desc) FROM growing
  ON CONFLICT(dedupe_key) WHERE resolved_at IS NULL DO UPDATE
    SET last_seen_at=now(),details=excluded.details,message=excluded.message;

  UPDATE public.marketplace_quality_alerts a SET resolved_at=now()
  WHERE a.alert_type='backlog_growth' AND a.resolved_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES('attributes_pending'),('image_opt_failed'),('link_stale_30d'),('no_description')) k(key)
      WHERE a.dedupe_key='backlog:'||k.key AND EXISTS(
        SELECT 1 FROM (
          SELECT array_agg((q.stats->>k.key)::numeric ORDER BY q.taken_at DESC) values_desc
          FROM (SELECT stats,taken_at FROM public.marketplace_quality_snapshots ORDER BY taken_at DESC LIMIT 3) q
        ) x WHERE cardinality(x.values_desc)=3 AND x.values_desc[1]>x.values_desc[2] AND x.values_desc[2]>x.values_desc[3]
      )
    );

  WITH watched(slug,has_backlog) AS (VALUES
    ('marketplace_variant_backfill',(v_stats->>'attributes_pending')::int>0),
    ('marketplace_link_checker',(v_stats->>'link_stale_30d')::int>0),
    ('marketplace_description_enhance',((v_stats->>'no_description')::int+(v_stats->>'thin_description')::int+(v_stats->>'boilerplate_rows')::int)>0),
    ('marketplace_image_retry',(v_stats->>'image_opt_failed')::int>0)),
  stalled AS (
    SELECT w.slug FROM watched w WHERE w.has_backlog AND 3=(SELECT count(*) FROM (
      SELECT 1 FROM public.admin_automation_runs r WHERE r.automation_slug=w.slug AND r.finished_at IS NOT NULL ORDER BY r.started_at DESC LIMIT 3) z)
    AND NOT EXISTS(SELECT 1 FROM (
      SELECT r.items_changed,r.summary FROM public.admin_automation_runs r WHERE r.automation_slug=w.slug AND r.finished_at IS NOT NULL ORDER BY r.started_at DESC LIMIT 3) z
      WHERE z.items_changed>0 OR coalesce((z.summary#>>'{worker_metrics,terminal}')::int,0)>0)
  )
  INSERT INTO public.marketplace_quality_alerts(alert_type,dedupe_key,severity,message,details)
  SELECT 'worker_stalled','worker:'||slug,'critical',slug||' made no progress for three runs','{}'::jsonb FROM stalled
  ON CONFLICT(dedupe_key) WHERE resolved_at IS NULL DO UPDATE SET last_seen_at=now();

  UPDATE public.marketplace_quality_alerts a SET resolved_at=now()
  WHERE a.alert_type='worker_stalled' AND a.resolved_at IS NULL AND EXISTS(
    SELECT 1 FROM (
      SELECT r.items_changed,r.summary FROM public.admin_automation_runs r
      WHERE r.automation_slug=substring(a.dedupe_key FROM 8) AND r.finished_at IS NOT NULL
      ORDER BY r.started_at DESC LIMIT 3
    ) z WHERE z.items_changed>0 OR coalesce((z.summary#>>'{worker_metrics,terminal}')::int,0)>0
  );

  WITH baseline AS (
    SELECT cur.source_slug,cur.active_count,cur.defect_rate,
      (SELECT avg(old.defect_rate) FROM public.marketplace_source_quality_snapshots old
       WHERE old.source_slug=cur.source_slug AND old.snapshot_id<>cur.snapshot_id
         AND old.snapshot_id IN(SELECT id FROM public.marketplace_quality_snapshots WHERE taken_at>now()-interval '7 days')) avg_rate
    FROM public.marketplace_source_quality_snapshots cur WHERE cur.snapshot_id=v_snapshot_id
  ), spikes AS (
    SELECT * FROM baseline WHERE active_count>=20 AND avg_rate IS NOT NULL
      AND defect_rate>=avg_rate*1.5 AND defect_rate-avg_rate>=0.05
  )
  INSERT INTO public.marketplace_quality_alerts(alert_type,dedupe_key,severity,message,details)
  SELECT 'source_defect_spike','source:'||source_slug,'warning',source_slug||' defect rate materially exceeds its seven-day baseline',
    jsonb_build_object('defect_rate',defect_rate,'baseline_rate',avg_rate,'active_count',active_count) FROM spikes
  ON CONFLICT(dedupe_key) WHERE resolved_at IS NULL DO UPDATE
    SET last_seen_at=now(),details=excluded.details,message=excluded.message;

  UPDATE public.marketplace_quality_alerts a SET resolved_at=now()
  WHERE a.alert_type='source_defect_spike' AND a.resolved_at IS NULL
    AND NOT EXISTS(
      SELECT 1 FROM public.marketplace_source_quality_snapshots cur
      WHERE cur.snapshot_id=v_snapshot_id AND 'source:'||cur.source_slug=a.dedupe_key
        AND cur.active_count>=20 AND EXISTS(
          SELECT 1 FROM (
            SELECT avg(old.defect_rate) avg_rate FROM public.marketplace_source_quality_snapshots old
            WHERE old.source_slug=cur.source_slug AND old.snapshot_id<>cur.snapshot_id
              AND old.snapshot_id IN(SELECT id FROM public.marketplace_quality_snapshots WHERE taken_at>now()-interval '7 days')
          ) b WHERE b.avg_rate IS NOT NULL AND cur.defect_rate>=b.avg_rate*1.5 AND cur.defect_rate-b.avg_rate>=0.05
        )
    );

  DELETE FROM public.marketplace_quality_snapshots WHERE taken_at<now()-interval '400 days';
  RETURN v_stats;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_quality_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN public.has_role_jwt('admin') THEN jsonb_build_object(
    'latest',(SELECT jsonb_build_object('taken_at',taken_at,'stats',stats)
      FROM public.marketplace_quality_snapshots ORDER BY taken_at DESC LIMIT 1),
    'previous',(SELECT jsonb_build_object('taken_at',taken_at,'stats',stats)
      FROM public.marketplace_quality_snapshots ORDER BY taken_at DESC OFFSET 1 LIMIT 1),
    'alerts',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'type',alert_type,'severity',severity,'message',message,'details',details,'created_at',created_at)
      ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,created_at DESC)
      FROM public.marketplace_quality_alerts WHERE resolved_at IS NULL),'[]'::jsonb),
    'recent_events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC)
      FROM (SELECT id,listing_id,dimension,previous_value,new_value,classifier_version,
        confidence,rollback_of,rolled_back_at,created_at
        FROM public.marketplace_quality_events ORDER BY created_at DESC LIMIT 20) e),'[]'::jsonb),
    'taxonomy_rollout',(SELECT to_jsonb(r) FROM public.marketplace_classifier_rollouts r
      WHERE classifier_version='marketplace-taxonomy-v4')
  ) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_quality_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketplace_quality_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.run_marketplace_quality_worker(p_slug text,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_automation_id uuid; v_run_id bigint; v_result jsonb;
BEGIN
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug=p_slug;
  INSERT INTO public.admin_automation_runs(automation_id,automation_slug,status,started_at)
  VALUES(v_automation_id,p_slug,'running',now()) RETURNING id INTO v_run_id;
  v_result:=CASE p_slug
    WHEN 'marketplace_image_retry' THEN public.marketplace_retry_failed_images(p_limit)
    WHEN 'marketplace_gallery_asset_backfill' THEN public.marketplace_backfill_gallery_assets(p_limit)
    WHEN 'marketplace_quality_dimensions' THEN public.marketplace_recompute_quality_dimensions(p_limit)
    WHEN 'marketplace_taxonomy_v3_backfill' THEN public.marketplace_taxonomy_v3_backfill(p_limit)
    ELSE jsonb_build_object('error','unsupported marketplace quality worker: '||p_slug)
  END;
  IF v_result ? 'error' THEN RAISE EXCEPTION '%',v_result->>'error'; END IF;
  UPDATE public.admin_automation_runs SET status='success',finished_at=now(),
    items_examined=coalesce((v_result->>'items_examined')::int,0),
    items_changed=coalesce((v_result->>'items_changed')::int,0),summary=v_result
  WHERE id=v_run_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.run_marketplace_quality_worker(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_marketplace_quality_worker(text,integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Safe operational rollout (small batches, real failure threshold)
-- ---------------------------------------------------------------------------

UPDATE public.admin_automations SET
  enabled=true, consecutive_failures=0, auto_pause_threshold=3, schedule='*/2 * * * *',
  description='Indexed, claimed variant/attribute extraction. Starts at 50 rows per run; response accounting records examined/changed/terminal/failed counts.',
  action=jsonb_build_object('type','cron','jobname','marketplace-variant-backfill','command',$cmd$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-variant-backfill',
      headers := jsonb_build_object('Content-Type','application/json','X-Webhook-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='marketplace_tag_webhook_secret')),
      body := '{"batch_limit":50}'::jsonb, timeout_milliseconds := 120000);
  $cmd$)
WHERE slug='marketplace_variant_backfill';

UPDATE public.admin_automations SET
  enabled=true, consecutive_failures=0, auto_pause_threshold=3, schedule='0 * * * *',
  description='Hourly durable link validation: 75 URLs/run (1,800/day), domain-level serialization, feed-presence credit, and two confirmed 404/410 responses before deactivation.',
  action=jsonb_build_object('type','cron','jobname','marketplace-link-checker','command',$cmd$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-link-checker',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
      body := '{"batch_size":75}'::jsonb, timeout_milliseconds := 120000);
  $cmd$)
WHERE slug='marketplace_link_checker';

UPDATE public.admin_automations SET enabled=false, description=description||' Retired 2026-09-21: image_assets is the canonical state machine.'
WHERE slug='marketplace_image_mirror';
DO $$ BEGIN
  BEGIN PERFORM cron.unschedule('marketplace-image-mirror'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('marketplace_image_mirror'); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

INSERT INTO public.admin_automations(slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule,auto_pause_threshold)
VALUES
('marketplace_image_retry','Marketplace failed-image retry','Daily bounded retry of marketplace image assets, capped at three attempts.','system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
 jsonb_build_object('type','cron','jobname','marketplace-image-retry','command','SELECT public.run_marketplace_quality_worker(''marketplace_image_retry'',1000);'),'0 */6 * * *',3),
('marketplace_gallery_asset_backfill','Marketplace gallery asset backfill','Backfills every listing gallery image into the canonical image_assets state machine.','system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
 jsonb_build_object('type','cron','jobname','marketplace-gallery-asset-backfill','command','SET statement_timeout=''120s''; SELECT public.run_marketplace_quality_worker(''marketplace_gallery_asset_backfill'',250);'),'*/5 * * * *',3),
('marketplace_quality_dimensions','Marketplace quality dimensions','Recomputes separately visible completeness, media, taxonomy, safety, freshness and linkage scores.','system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
 jsonb_build_object('type','cron','jobname','marketplace-quality-dimensions','command','SET statement_timeout=''120s''; SELECT public.run_marketplace_quality_worker(''marketplace_quality_dimensions'',500);'),'*/5 * * * *',3),
('marketplace_taxonomy_classify','Marketplace taxonomy model fallback','Hourly factual model fallback for v4 listings that remain in other after source mappings, structured attributes and deterministic text rules.','system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
 jsonb_build_object('type','cron','jobname','marketplace-taxonomy-classify','command',$cmd$
   SELECT net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-taxonomy-classify',
     headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
     body:='{"batch_size":25}'::jsonb,timeout_milliseconds:=120000);
 $cmd$),'20 * * * *',3),
('marketplace_image_optimize','Marketplace image optimizer','Claims and optimizes marketplace image assets without duplicate concurrent work.','system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
 jsonb_build_object('type','cron','jobname','marketplace-image-optimize','command',$cmd$
   SELECT net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/optimize-images-batch',
     headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')),
     body:='{"batch_size":15,"entity_type":"marketplace_listing"}'::jsonb,timeout_milliseconds:=120000);
 $cmd$),'*/2 * * * *',3)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,enabled=excluded.enabled,
  action=excluded.action,schedule=excluded.schedule,auto_pause_threshold=excluded.auto_pause_threshold;

INSERT INTO public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule,auto_pause_threshold)
VALUES
  ('marketplace_taxonomy_v3_backfill','Marketplace taxonomy v4 rollout',
   'Reversible deterministic taxonomy rollout: frozen-corpus gate, 1% canary, distribution guard, then bounded expansion.',
   'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
   jsonb_build_object('type','cron','jobname','marketplace-taxonomy-v4-backfill',
     'command','SET statement_timeout=''120s''; SELECT public.run_marketplace_quality_worker(''marketplace_taxonomy_v3_backfill'',100);'),
   '* * * * *',3)
ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,action=excluded.action,schedule=excluded.schedule,
  auto_pause_threshold=excluded.auto_pause_threshold;

SELECT public.sync_automations_to_cron(true);
SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;
