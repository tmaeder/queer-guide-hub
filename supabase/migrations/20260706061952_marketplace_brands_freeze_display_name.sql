-- marketplace_register_brands() unconditionally overwrote display_name on
-- every re-run (weekly cron), clobbering curator edits back to the raw
-- scraped casing (e.g. "Fort Troff" -> "Forttroff"). suggested_tags already
-- had a "only while pending" guard for the same reason; extend it to
-- display_name so an approved brand's display name is admin-owned.
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
    -- refresh display_name only while still pending; never clobber a
    -- curator's manual correction on an already-decided (approved/rejected) row
    display_name  = CASE WHEN public.marketplace_brands.status = 'pending'
                          THEN EXCLUDED.display_name ELSE public.marketplace_brands.display_name END,
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
