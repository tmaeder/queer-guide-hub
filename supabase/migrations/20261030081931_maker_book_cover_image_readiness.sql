-- Portrait book covers commonly arrive at ~420 x 640, sufficient for the
-- product cards. Retain the existing floor for other products and reject small
-- or unmeasured book covers. This changes no rating, flag, stock or access gate.
CREATE OR REPLACE FUNCTION public.marketplace_overview_dimensions_qualify(
  p_width integer, p_height integer, p_subcategory_group text
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT coalesce((p_width>=600 AND p_height>=600)
    OR (p_subcategory_group='books' AND p_width>=400 AND p_height>=600),false)
$$;

CREATE OR REPLACE FUNCTION public.marketplace_refresh_overview_eligibility(p_listing_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    AND public.marketplace_overview_dimensions_qualify(ia.width,ia.height,v_listing.subcategory_group)
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
$function$

