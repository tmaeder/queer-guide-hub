-- Marketplace overview/front-page quality gate.
--
-- Discovery surfaces must never render vouchers or an unverified/low-quality
-- image. Detail pages and user-selected lists remain addressable. The cached
-- state below gives every discovery query one indexed predicate and pins the
-- exact image asset that a governed card is allowed to render.

BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '15min';

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS overview_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overview_image_asset_id uuid
    REFERENCES public.image_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS overview_exclusion_reasons text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS overview_eligibility_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS marketplace_listings_overview_browse_idx
  ON public.marketplace_listings (boutique_score DESC NULLS LAST, id)
  WHERE status = 'active' AND overview_eligible;
CREATE INDEX IF NOT EXISTS marketplace_listings_overview_image_asset_idx
  ON public.marketplace_listings (overview_image_asset_id)
  WHERE overview_image_asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.marketplace_listing_is_voucher(
  p_title text,
  p_category text DEFAULT NULL,
  p_subcategory text DEFAULT NULL,
  p_subcategory_group text DEFAULT NULL,
  p_subcategory_fine text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $$
  WITH normalized AS (
    SELECT lower(unaccent(concat_ws(' ', p_title, p_category, p_subcategory,
                                    p_subcategory_group, p_subcategory_fine))) AS value
  )
  SELECT value ~
    '(^|[^[:alnum:]])(e[ -]?gift[ -]?cards?|gift[ -]?cards?|gift certificates?|store credits?|shop credits?|coupon codes?|promo codes?|vouchers?|gutscheine?|geschenkgutscheine?)([^[:alnum:]]|$)'
    AND value !~
      '(^|[^[:alnum:]])(gift[ -]?card|voucher|coupon)[ -]?(holders?|wallets?|organizers?|organisers?|books?)([^[:alnum:]]|$)'
  FROM normalized;
$$;

COMMENT ON FUNCTION public.marketplace_listing_is_voucher(text,text,text,text,text) IS
  'Deterministic discovery exclusion for vouchers, gift cards, store credit and coupon-code listings. Holder/wallet products are not vouchers.';

CREATE OR REPLACE FUNCTION public.marketplace_refresh_overview_eligibility(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_listing public.marketplace_listings%ROWTYPE;
  v_asset_id uuid;
  v_voucher boolean;
  v_reasons text[] := '{}'::text[];
BEGIN
  SELECT * INTO v_listing
  FROM public.marketplace_listings
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_voucher := public.marketplace_listing_is_voucher(
    v_listing.title, v_listing.category, v_listing.subcategory,
    v_listing.subcategory_group, v_listing.subcategory_fine
  );

  SELECT ia.id INTO v_asset_id
  FROM public.image_asset_links ial
  JOIN public.image_assets ia ON ia.id = ial.asset_id
  WHERE ial.entity_type = 'marketplace_listing'
    AND ial.entity_id = p_listing_id
    AND ial.role IN ('cover','hero','gallery','square','thumbnail')
    AND ia.status = 'active'
    AND NOT ia.is_flagged
    AND ia.access_level = 'public'
    AND ia.optimization_status IN ('optimized','cdn_optimized')
    AND (ia.optimized_url IS NOT NULL OR ia.thumbnail_url IS NOT NULL)
    AND coalesce(ia.health_consecutive_failures, 0) < 2
    AND ia.width >= 600
    AND ia.height >= 600
    AND coalesce(ia.brand_category, 'photography') NOT IN
      ('logo','color','typography','iconography','template','guideline')
  ORDER BY
    CASE ial.role WHEN 'cover' THEN 0 WHEN 'hero' THEN 1 WHEN 'gallery' THEN 2
                  WHEN 'square' THEN 3 ELSE 4 END,
    ial.sort_order,
    (ia.width::bigint * ia.height::bigint) DESC,
    ia.id
  LIMIT 1;

  IF coalesce(v_listing.status, '') <> 'active' THEN
    v_reasons := array_append(v_reasons, 'inactive');
  END IF;
  IF v_listing.duplicate_of_id IS NOT NULL THEN
    v_reasons := array_append(v_reasons, 'duplicate');
  END IF;
  IF v_voucher THEN
    v_reasons := array_append(v_reasons, 'voucher');
  END IF;
  IF v_asset_id IS NULL THEN
    v_reasons := array_append(v_reasons, 'no_qualified_overview_image');
  END IF;

  UPDATE public.marketplace_listings
  SET overview_eligible = cardinality(v_reasons) = 0,
      overview_image_asset_id = CASE WHEN cardinality(v_reasons) = 0 THEN v_asset_id ELSE NULL END,
      overview_exclusion_reasons = v_reasons,
      overview_eligibility_checked_at = now()
  WHERE id = p_listing_id
    AND (overview_eligible,
         overview_image_asset_id,
         overview_exclusion_reasons)
        IS DISTINCT FROM
        (cardinality(v_reasons) = 0,
         CASE WHEN cardinality(v_reasons) = 0 THEN v_asset_id ELSE NULL END,
         v_reasons);
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_refresh_overview_eligibility(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_refresh_overview_eligibility(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.tg_marketplace_refresh_overview_from_listing()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  PERFORM public.marketplace_refresh_overview_eligibility(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_refresh_overview_from_listing_trg
  ON public.marketplace_listings;
CREATE TRIGGER marketplace_refresh_overview_from_listing_trg
AFTER INSERT OR UPDATE OF status, duplicate_of_id, title, category, subcategory,
  subcategory_group, subcategory_fine
ON public.marketplace_listings
FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_refresh_overview_from_listing();

CREATE OR REPLACE FUNCTION public.tg_marketplace_refresh_overview_from_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.entity_type = 'marketplace_listing' THEN
    PERFORM public.marketplace_refresh_overview_eligibility(OLD.entity_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.entity_type = 'marketplace_listing' THEN
    PERFORM public.marketplace_refresh_overview_eligibility(NEW.entity_id);
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS marketplace_refresh_overview_from_link_trg
  ON public.image_asset_links;
CREATE TRIGGER marketplace_refresh_overview_from_link_trg
AFTER INSERT OR UPDATE OR DELETE ON public.image_asset_links
FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_refresh_overview_from_link();

CREATE OR REPLACE FUNCTION public.tg_marketplace_refresh_overview_from_asset()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_listing_id uuid;
BEGIN
  FOR v_listing_id IN
    SELECT DISTINCT ial.entity_id
    FROM public.image_asset_links ial
    WHERE ial.asset_id = NEW.id
      AND ial.entity_type = 'marketplace_listing'
  LOOP
    PERFORM public.marketplace_refresh_overview_eligibility(v_listing_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_refresh_overview_from_asset_trg
  ON public.image_assets;
CREATE TRIGGER marketplace_refresh_overview_from_asset_trg
AFTER UPDATE OF status, is_flagged, access_level, optimization_status,
  optimized_url, thumbnail_url, health_consecutive_failures, width, height,
  brand_category
ON public.image_assets
FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_refresh_overview_from_asset();

-- Backfill in one set-based statement. Disable the legacy unscoped search
-- trigger: ineligible documents are removed explicitly below and eligible
-- documents already contain the same listing text.
ALTER TABLE public.marketplace_listings DISABLE TRIGGER trg_search_documents_marketplace;

WITH ranked_assets AS MATERIALIZED (
  SELECT ial.entity_id,
         ia.id,
         row_number() OVER (
           PARTITION BY ial.entity_id
           ORDER BY CASE ial.role WHEN 'cover' THEN 0 WHEN 'hero' THEN 1
                                  WHEN 'gallery' THEN 2 WHEN 'square' THEN 3 ELSE 4 END,
                    ial.sort_order,
                    (ia.width::bigint * ia.height::bigint) DESC,
                    ia.id
         ) AS rn
  FROM public.image_asset_links ial
  JOIN public.image_assets ia ON ia.id = ial.asset_id
  WHERE ial.entity_type = 'marketplace_listing'
    AND ial.role IN ('cover','hero','gallery','square','thumbnail')
    AND ia.status = 'active'
    AND NOT ia.is_flagged
    AND ia.access_level = 'public'
    AND ia.optimization_status IN ('optimized','cdn_optimized')
    AND (ia.optimized_url IS NOT NULL OR ia.thumbnail_url IS NOT NULL)
    AND coalesce(ia.health_consecutive_failures, 0) < 2
    AND ia.width >= 600
    AND ia.height >= 600
    AND coalesce(ia.brand_category, 'photography') NOT IN
      ('logo','color','typography','iconography','template','guideline')
), classified AS MATERIALIZED (
  SELECT ml.id,
         ra.id AS asset_id,
         public.marketplace_listing_is_voucher(
           ml.title, ml.category, ml.subcategory,
           ml.subcategory_group, ml.subcategory_fine
         ) AS is_voucher,
         ml.status,
         ml.duplicate_of_id
  FROM public.marketplace_listings ml
  LEFT JOIN ranked_assets ra ON ra.entity_id = ml.id AND ra.rn = 1
), resolved AS (
  SELECT c.id, c.asset_id,
         array_remove(ARRAY[
           CASE WHEN coalesce(c.status, '') <> 'active' THEN 'inactive'::text END,
           CASE WHEN c.duplicate_of_id IS NOT NULL THEN 'duplicate'::text END,
           CASE WHEN c.is_voucher THEN 'voucher'::text END,
           CASE WHEN c.asset_id IS NULL THEN 'no_qualified_overview_image'::text END
         ], NULL) AS reasons
  FROM classified c
)
UPDATE public.marketplace_listings ml
SET overview_eligible = cardinality(r.reasons) = 0,
    overview_image_asset_id = CASE WHEN cardinality(r.reasons) = 0 THEN r.asset_id ELSE NULL END,
    overview_exclusion_reasons = r.reasons,
    overview_eligibility_checked_at = now()
FROM resolved r
WHERE ml.id = r.id;

ALTER TABLE public.marketplace_listings ENABLE TRIGGER trg_search_documents_marketplace;

-- Search may only contain discovery-eligible marketplace documents. The normal
-- sync trigger deletes before indexing; this explicit cleanup handles the
-- backfill performed with that trigger disabled.
DELETE FROM public.search_documents sd
USING public.marketplace_listings ml
WHERE sd.entity_type = 'marketplace'
  AND sd.entity_id = ml.id
  AND NOT ml.overview_eligible;

-- Search indexing is itself a discovery surface. Delete first so a listing
-- that becomes ineligible disappears even when this function is called
-- directly rather than through the delete-then-reindex sync trigger.
CREATE OR REPLACE FUNCTION public.search_documents_index_marketplace(p_id uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp'
AS $function$
  DELETE FROM public.search_documents
  WHERE entity_type = 'marketplace'
    AND (p_id IS NULL OR entity_id = p_id);

  INSERT INTO public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url,
     city, country, content_language, updated_at)
  SELECT 'marketplace:'||m.id, 'marketplace', m.id, m.title, m.description,
       setweight(to_tsvector('simple', unaccent(coalesce(m.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.business_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.brand,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.subcategory,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.description,''))),'D')
    || public.i18n_to_tsv(m.title_i18n,'A')
    || public.i18n_to_tsv(m.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'category',m.category,'subcategory',m.subcategory,'department',m.department,
      'subcategory_group',m.subcategory_group,'subcategory_fine',m.subcategory_fine,
      'sizes',CASE WHEN cardinality(m.sizes)>0 THEN to_jsonb(m.sizes) END,
      'colors',CASE WHEN cardinality(m.colors)>0 THEN to_jsonb(m.colors) END,
      'genre',CASE WHEN jsonb_typeof(m.attributes->'genre')='array' THEN m.attributes->'genre' END,
      'fit',CASE WHEN jsonb_typeof(m.attributes->'fit')='array' THEN m.attributes->'fit' END,
      'business_type',m.business_type,'merchant_domain',m.merchant_domain,
      'is_featured',m.featured,
      'tags',(SELECT to_jsonb(array_agg(DISTINCT t.slug))
              FROM public.tag_assignments_norm a
              JOIN public.unified_tags t ON t.id=a.tag_id
              WHERE a.entity_id=m.id AND a.entity_type='marketplace' AND t.slug IS NOT NULL))),
    NULL::geography, NULL::smallint, 'live', coalesce(m.featured,false),
    m.quality_score, m.deprecated_at, NULL::timestamptz, NULL::timestamptz,
    false, coalesce(m.price_usd,m.price), coalesce(m.price_usd,m.price),
    m.slug, coalesce(ia.optimized_url,ia.thumbnail_url,ia.url),
    NULL::text,NULL::text,NULL::text,now()
  FROM public.marketplace_listings m
  JOIN public.image_assets ia ON ia.id=m.overview_image_asset_id
  WHERE m.overview_eligible
    AND coalesce(m.content_rating,'sfw') IN ('sfw','suggestive')
    AND (p_id IS NULL OR m.id=p_id)
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    title=excluded.title,description=excluded.description,search_tsv=excluded.search_tsv,
    facets=excluded.facets,is_featured=excluded.is_featured,
    quality_score=excluded.quality_score,closed_at=excluded.closed_at,
    price_min=excluded.price_min,price_max=excluded.price_max,
    slug=excluded.slug,image_url=excluded.image_url,updated_at=now();
$function$;

-- Patch the public browse/count/facet RPCs in place. Exact anchors make the
-- migration fail closed if a preceding migration changes a function body.
DO $patch_overview_rpcs$
DECLARE
  v_signature regprocedure;
  v_def text;
  v_next text;
  v_changed boolean;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.marketplace_browse_page(jsonb,jsonb,text,integer,integer)'::regprocedure,
    'public.get_marketplace_subcategory_counts(boolean)'::regprocedure,
    'public.get_marketplace_department_counts(boolean)'::regprocedure,
    'public.get_marketplace_subcategory_group_counts(text,boolean)'::regprocedure,
    'public.count_marketplace_subcategory(text,boolean)'::regprocedure,
    'public.get_marketplace_facets(text,text,text,uuid,boolean)'::regprocedure,
    'public.get_marketplace_tag_facets(text,text,boolean)'::regprocedure,
    'public.get_marketplace_attribute_facets(text,text,boolean)'::regprocedure,
    'public.get_marketplace_subcategory_fine_counts(text,text,boolean)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_def;
    v_next := v_def;
    v_changed := false;

    IF position('ml.status = ''active''' IN v_next) > 0 THEN
      v_next := replace(v_next, 'ml.status = ''active''',
        'ml.status = ''active'' AND ml.overview_eligible');
      v_changed := true;
    ELSIF position('l.status = ''active''' IN v_next) > 0 THEN
      v_next := replace(v_next, 'l.status = ''active''',
        'l.status = ''active'' AND l.overview_eligible');
      v_changed := true;
    ELSIF position('status = ''active''' IN v_next) > 0
          AND position('overview_eligible' IN v_next) = 0 THEN
      v_next := replace(v_next, 'status = ''active''',
        'status = ''active'' AND overview_eligible');
      v_changed := true;
    END IF;

    IF NOT v_changed OR position('overview_eligible' IN v_next) = 0 THEN
      RAISE EXCEPTION 'overview RPC anchor changed for %; refusing a partial gate', v_signature;
    END IF;
    EXECUTE v_next;
  END LOOP;
END;
$patch_overview_rpcs$;

-- Tag pages render a public Shop rail outside the marketplace route. Patch its
-- marketplace branch to use the same gate and exact approved asset.
DO $patch_tag_shop_rail$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_tag_linked_content(uuid,text,text,integer)'::regprocedure
  ) INTO v_def;
  v_next := replace(v_def,
    'm.images[1] AS image_url',
    'coalesce(mia.optimized_url,mia.thumbnail_url,mia.url) AS image_url');
  v_next := replace(v_next,
    'JOIN marketplace_listings m ON m.id = uta.entity_id',
    'JOIN marketplace_listings m ON m.id = uta.entity_id
        JOIN image_assets mia ON mia.id = m.overview_image_asset_id');
  v_next := replace(v_next,
    'AND COALESCE(m.status, ''active'') = ''active''',
    'AND COALESCE(m.status, ''active'') = ''active''
          AND m.overview_eligible');
  IF v_next=v_def
     OR position('m.overview_eligible' IN v_next)=0
     OR position('mia.optimized_url' IN v_next)=0 THEN
    RAISE EXCEPTION 'get_tag_linked_content marketplace anchor changed; refusing a partial gate';
  END IF;
  EXECUTE v_next;
END;
$patch_tag_shop_rail$;

-- Maker-directory photography is also an overview. Resolve it exclusively
-- through the listing's pinned approved asset.
CREATE OR REPLACE FUNCTION public.get_marketplace_brand_directory()
RETURNS TABLE(
  slug text,display_name text,logo_url text,logo_on_ink boolean,story text,
  product_count integer,ownership_tags text[],cover_url text,cover_thumb text
)
LANGUAGE sql STABLE SET search_path TO 'public','pg_temp' AS $$
  SELECT b.slug,b.display_name,b.logo_url,b.logo_on_ink,b.story,b.product_count,
    CASE WHEN b.ownership_review_status='verified' THEN b.ownership_tags ELSE '{}'::text[] END,
    c.url,c.thumb
  FROM public.marketplace_brands b
  LEFT JOIN LATERAL (
    SELECT ia.url,coalesce(ia.thumbnail_url,ia.optimized_url) AS thumb
    FROM public.marketplace_listings l
    JOIN public.image_assets ia ON ia.id=l.overview_image_asset_id
    WHERE l.brand_key=b.brand_key AND l.overview_eligible
      AND l.content_rating IN('sfw','suggestive')
    ORDER BY l.boutique_score DESC NULLS LAST,l.id
    LIMIT 1
  ) c ON true
  WHERE b.publication_status='published' AND b.slug IS NOT NULL AND b.product_count>0
  ORDER BY b.product_count DESC NULLS LAST,b.slug;
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_brand_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_directory()
  TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_marketplace_brand_covers(
  p_limit integer DEFAULT 12,p_seed integer DEFAULT NULL)
RETURNS TABLE(slug text,display_name text,logo_url text,logo_on_ink boolean,
  product_count integer,ownership_tags text[],covers jsonb)
LANGUAGE sql STABLE SET search_path TO 'public','pg_temp' AS $$
  WITH pool AS (
    SELECT b.slug,b.brand_key,b.display_name,b.logo_url,b.logo_on_ink,b.product_count,
      CASE WHEN b.ownership_review_status='verified' THEN b.ownership_tags ELSE '{}'::text[] END ownership_tags
    FROM public.marketplace_brands b
    WHERE b.publication_status='published' AND b.slug IS NOT NULL
      AND b.product_count>0 AND b.logo_url IS NOT NULL
    ORDER BY hashtext(b.slug||coalesce(p_seed,(current_date-date '2026-01-01'))::text),b.slug
    LIMIT 60
  )
  SELECT p.slug,p.display_name,p.logo_url,p.logo_on_ink,p.product_count,p.ownership_tags,c.covers
  FROM pool p
  JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'url',picked.url,
             'thumb',coalesce(picked.thumbnail_url,picked.optimized_url))
             ORDER BY picked.score DESC NULLS LAST,picked.asset_id) AS covers
    FROM (
      SELECT dedup.*
      FROM (
        SELECT DISTINCT ON (cand.overview_image_asset_id)
          cand.overview_image_asset_id AS asset_id,
          ia.url,ia.thumbnail_url,ia.optimized_url,cand.boutique_score AS score
        FROM (
          SELECT l.overview_image_asset_id,l.boutique_score,l.id
          FROM public.marketplace_listings l
          WHERE l.brand_key=p.brand_key AND l.overview_eligible
            AND l.content_rating IN('sfw','suggestive')
          ORDER BY l.boutique_score DESC NULLS LAST,l.id
          LIMIT 60
        ) cand
        JOIN public.image_assets ia ON ia.id=cand.overview_image_asset_id
        ORDER BY cand.overview_image_asset_id,cand.boutique_score DESC NULLS LAST,cand.id
      ) dedup
      ORDER BY dedup.score DESC NULLS LAST,dedup.asset_id
      LIMIT 3
    ) picked
  ) c ON jsonb_array_length(c.covers)>=3
  LIMIT greatest(1,least(coalesce(p_limit,12),24));
$$;
REVOKE ALL ON FUNCTION public.get_marketplace_brand_covers(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_brand_covers(integer,integer)
  TO anon,authenticated,service_role;

-- Requeue only eligible SFW marketplace documents with the approved image.
INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id
FROM public.marketplace_listings
WHERE overview_eligible AND content_rating IN('sfw','suggestive')
ON CONFLICT DO NOTHING;

-- Verification: cached eligibility must be internally complete and may never
-- include a voucher.
DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.marketplace_listings ml
  LEFT JOIN public.image_assets ia ON ia.id = ml.overview_image_asset_id
  WHERE ml.overview_eligible
    AND (
      ml.status IS DISTINCT FROM 'active'
      OR ml.duplicate_of_id IS NOT NULL
      OR public.marketplace_listing_is_voucher(
           ml.title, ml.category, ml.subcategory,
           ml.subcategory_group, ml.subcategory_fine)
      OR ia.id IS NULL
      OR ia.status IS DISTINCT FROM 'active'
      OR ia.is_flagged
      OR ia.access_level IS DISTINCT FROM 'public'
      OR ia.optimization_status NOT IN ('optimized','cdn_optimized')
      OR (ia.optimized_url IS NULL AND ia.thumbnail_url IS NULL)
      OR coalesce(ia.health_consecutive_failures, 0) >= 2
      OR ia.width < 600 OR ia.height < 600
      OR coalesce(ia.brand_category, 'photography') IN
         ('logo','color','typography','iconography','template','guideline')
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'marketplace overview quality gate admitted % invalid rows', v_bad;
  END IF;

  IF NOT public.marketplace_listing_is_voucher('Digital Gift Card',NULL,NULL,NULL,NULL)
     OR NOT public.marketplace_listing_is_voucher('Geschenkgutschein',NULL,NULL,NULL,NULL)
     OR public.marketplace_listing_is_voucher('Leather gift card holder',NULL,NULL,NULL,NULL) THEN
    RAISE EXCEPTION 'marketplace voucher classifier postcondition failed';
  END IF;
END;
$$;

COMMIT;
