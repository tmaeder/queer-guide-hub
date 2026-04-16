-- ============================================================================
-- commit_marketplace_staging_batch — atomic commit RPC for marketplace pipeline
-- Advisory lock on (source_type, source_entity_id), respects
-- marketplace_category_check (products|services), resolves category_id from
-- marketplace_categories, writes price-history delta + source junction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.commit_marketplace_staging_batch(p_limit integer DEFAULT 50, p_pipeline_run_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(staging_id uuid, listing_id uuid, action text)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row RECORD; v_norm JSONB; v_enr JSONB; v_meta JSONB;
  v_title TEXT; v_description TEXT; v_category TEXT; v_category_src TEXT; v_category_id UUID; v_subcategory TEXT;
  v_price NUMERIC; v_price_type TEXT; v_currency TEXT;
  v_business TEXT; v_biz_type TEXT; v_email TEXT; v_phone TEXT; v_website TEXT; v_location TEXT;
  v_images TEXT[]; v_brand TEXT; v_external_url TEXT; v_affiliate_url TEXT; v_merchant_dom TEXT; v_merchant_id UUID;
  v_availability TEXT; v_in_stock BOOLEAN; v_slug TEXT;
  v_src_slug TEXT; v_src_eid TEXT; v_source_url TEXT;
  v_payload JSONB; v_hash TEXT; v_existing_id UUID; v_prev_price NUMERIC;
  v_lock_key BIGINT; v_action TEXT; v_result_id UUID;
  v_class JSONB; v_relev NUMERIC; v_sens JSONB; v_qscore INT;
BEGIN
  FOR v_row IN
    SELECT s.* FROM public.ingestion_staging s
     WHERE s.target_table = 'marketplace_listings'
       AND s.disposition = 'pending'
       AND s.ai_validation_status = 'approved'
       AND (s.dedup_status IN ('unique','duplicate') OR s.dedup_status IS NULL)
       AND s.review_status IN ('auto','approved')
       AND (p_pipeline_run_id IS NULL OR s.pipeline_run_id = p_pipeline_run_id)
     ORDER BY s.created_at ASC
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_norm := coalesce(v_row.normalized_data, '{}'::jsonb);
      v_enr  := coalesce(v_row.enriched_data,   '{}'::jsonb);
      v_meta := coalesce(v_norm->'metadata', v_row.raw_data, '{}'::jsonb);
      v_class:= coalesce(v_row.classification_result, '{}'::jsonb);
      v_title       := nullif(btrim(coalesce(v_norm->>'name', v_norm->>'title', v_meta->>'product_name', v_meta->>'title')), '');
      v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description', v_meta->>'description')), '');
      v_category_src:= nullif(btrim(coalesce(v_norm->>'category', v_meta->>'category', v_meta->>'category_name')), '');
      v_subcategory := nullif(btrim(coalesce(v_norm->>'subcategory', v_meta->>'subcategory', v_category_src)), '');
      v_biz_type    := nullif(btrim(coalesce(v_norm->>'business_type', v_meta->>'business_type')), '');
      IF v_biz_type IS NOT NULL AND v_biz_type ILIKE '%service%' THEN v_category := 'services'; ELSE v_category := 'products'; END IF;
      IF v_category_src IS NOT NULL THEN
        SELECT id INTO v_category_id FROM public.marketplace_categories
         WHERE is_active = true AND (lower(name) = lower(v_category_src) OR lower(slug) = lower(regexp_replace(v_category_src, '[^a-zA-Z0-9]+', '-', 'g')))
         LIMIT 1;
      END IF;
      v_price        := nullif(coalesce(v_meta->>'price', v_norm->>'price', v_meta->>'search_price'), '')::numeric;
      v_price_type   := coalesce(nullif(btrim(coalesce(v_norm->>'price_type', v_meta->>'price_type')), ''), 'fixed');
      v_currency     := coalesce(upper(nullif(btrim(coalesce(v_norm->>'currency', v_meta->>'currency')), '')), 'USD');
      v_business     := nullif(btrim(coalesce(v_norm->>'business_name', v_meta->>'merchant_name', v_meta->>'business_name', v_meta->>'brand_name')), '');
      v_email        := nullif(btrim(coalesce((v_norm->'contacts'->>'email'), v_meta->>'contact_email', v_meta->>'email')), '');
      v_phone        := nullif(btrim(coalesce((v_norm->'contacts'->>'phone'), v_meta->>'contact_phone', v_meta->>'phone')), '');
      v_website      := nullif(btrim(coalesce((v_norm->'contacts'->>'website'), v_meta->>'merchant_url', v_meta->>'website', (v_norm->'urls'->>0))), '');
      v_location     := nullif(btrim(coalesce(v_norm->>'location', v_meta->>'location', (v_norm->'location'->>'address'))), '');
      v_brand        := nullif(btrim(coalesce(v_norm->>'brand', v_meta->>'brand', v_meta->>'brand_name')), '');
      v_external_url := nullif(btrim(coalesce(v_meta->>'merchant_deep_link', v_meta->>'product_url', (v_norm->'urls'->>0), v_website)), '');
      v_affiliate_url:= nullif(btrim(coalesce(v_meta->>'aw_deep_link', v_meta->>'affiliate_url', v_norm->>'affiliate_url')), '');
      v_in_stock     := CASE WHEN v_meta ? 'in_stock' THEN (v_meta->>'in_stock')::boolean WHEN v_norm ? 'in_stock' THEN (v_norm->>'in_stock')::boolean ELSE NULL END;
      v_availability := CASE WHEN v_in_stock IS TRUE THEN 'in_stock' WHEN v_in_stock IS FALSE THEN 'out_of_stock' ELSE coalesce(v_norm->>'availability', 'unknown') END;
      v_images := ARRAY(SELECT value::text FROM jsonb_array_elements_text(coalesce(v_norm->'images', v_enr->'images', '[]'::jsonb)) WHERE value::text IS NOT NULL AND value::text <> '');
      v_relev := nullif(v_class->>'lgbti_relevance_score', '')::numeric;
      v_sens  := coalesce(v_class->'sensitivity_flags', '[]'::jsonb);
      v_qscore:= nullif(v_row.ai_validation_result->>'quality', '')::int;
      v_src_slug := coalesce(v_row.source_name, v_row.source_type, 'unknown');
      v_src_eid  := coalesce(v_row.source_entity_id, v_meta->>'aw_product_id', v_meta->>'product_id', v_meta->>'id', v_meta->>'external_id');
      v_source_url := v_external_url;
      IF v_external_url IS NOT NULL THEN v_merchant_dom := lower(substring(v_external_url FROM 'https?://(?:www\.)?([^/:?#]+)'));
      ELSIF v_website IS NOT NULL THEN v_merchant_dom := lower(substring(v_website FROM 'https?://(?:www\.)?([^/:?#]+)')); END IF;
      IF v_merchant_dom IS NOT NULL THEN
        SELECT id INTO v_merchant_id FROM public.affiliate_partners WHERE v_merchant_dom = ANY(domains) AND enabled = true LIMIT 1;
      END IF;
      IF v_title IS NULL OR length(v_title) < 2 THEN
        UPDATE public.ingestion_staging SET disposition='rejected', error_message='missing_title', updated_at=now() WHERE id = v_row.id;
        staging_id := v_row.id; listing_id := NULL; action := 'rejected'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_business IS NULL THEN v_business := coalesce(v_brand, v_merchant_dom, 'unknown'); END IF;
      v_slug := regexp_replace(lower(extensions.unaccent(v_title)), '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from substring(v_slug FROM 1 FOR 80));
      IF coalesce(v_src_eid,'') <> '' THEN v_slug := v_slug || '-' || substring(md5(v_src_slug || ':' || v_src_eid) FOR 8); END IF;
      v_payload := jsonb_strip_nulls(jsonb_build_object('title', v_title, 'price', v_price, 'business', v_business, 'external_url', v_external_url, 'availability', v_availability));
      v_hash := md5(v_payload::text);
      IF v_row.payload_hash = v_hash AND v_row.disposition = 'committed' THEN
        staging_id := v_row.id; listing_id := v_row.target_record_id; action := 'noop'; RETURN NEXT; CONTINUE;
      END IF;
      v_lock_key := hashtextextended(coalesce(v_src_slug || ':' || v_src_eid, v_title), 42);
      PERFORM pg_advisory_xact_lock(v_lock_key);
      v_existing_id := v_row.dedup_match_id;
      IF v_existing_id IS NULL AND v_src_eid IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.marketplace_listings WHERE source_type = v_src_slug AND source_entity_id = v_src_eid LIMIT 1;
      END IF;
      IF v_existing_id IS NULL THEN
        INSERT INTO public.marketplace_listings (
          title, description, category, subcategory, category_id, price, price_type, currency,
          business_name, business_type, contact_email, contact_phone, website, location, images, status, slug,
          source_type, source_entity_id, external_url, affiliate_url, merchant_domain, merchant_id, brand,
          availability, in_stock, last_verified_at, last_seen_at, link_health, quality_score,
          lgbti_relevance_score, sensitivity_flags, classified_at, review_status, payload_hash
        ) VALUES (
          v_title, v_description, v_category, v_subcategory, v_category_id, v_price, v_price_type, v_currency,
          v_business, v_biz_type, v_email, v_phone, v_website, v_location, v_images, 'active', v_slug,
          v_src_slug, v_src_eid, v_external_url, v_affiliate_url, v_merchant_dom, v_merchant_id, v_brand,
          v_availability, v_in_stock, now(), now(), 'unchecked', v_qscore,
          v_relev, v_sens, CASE WHEN v_relev IS NOT NULL THEN now() ELSE NULL END,
          coalesce(v_row.review_status,'auto'), v_hash
        ) RETURNING id INTO v_result_id;
        v_action := 'inserted';
      ELSE
        SELECT price INTO v_prev_price FROM public.marketplace_listings WHERE id = v_existing_id;
        UPDATE public.marketplace_listings SET
          title = coalesce(v_title, title), description = coalesce(v_description, description),
          category = v_category, subcategory = coalesce(v_subcategory, subcategory),
          category_id = coalesce(v_category_id, category_id),
          price = coalesce(v_price, price), currency = coalesce(v_currency, currency),
          business_name = coalesce(v_business, business_name), website = coalesce(v_website, website),
          images = CASE WHEN array_length(v_images,1) > 0 THEN v_images ELSE images END,
          external_url = coalesce(v_external_url, external_url), affiliate_url = coalesce(v_affiliate_url, affiliate_url),
          merchant_domain = coalesce(v_merchant_dom, merchant_domain), merchant_id = coalesce(v_merchant_id, merchant_id),
          brand = coalesce(v_brand, brand), availability = v_availability, in_stock = coalesce(v_in_stock, in_stock),
          last_verified_at = now(), last_seen_at = now(), quality_score = coalesce(v_qscore, quality_score),
          lgbti_relevance_score = coalesce(v_relev, lgbti_relevance_score),
          sensitivity_flags = CASE WHEN v_sens <> '[]'::jsonb THEN v_sens ELSE sensitivity_flags END,
          classified_at = CASE WHEN v_relev IS NOT NULL THEN now() ELSE classified_at END,
          payload_hash = v_hash, updated_at = now()
        WHERE id = v_existing_id RETURNING id INTO v_result_id;
        v_action := 'updated';
        IF v_price IS NOT NULL AND (v_prev_price IS NULL OR v_prev_price <> v_price) THEN
          INSERT INTO public.marketplace_price_history (listing_id, price, currency, source_slug, availability)
          VALUES (v_result_id, v_price, v_currency, v_src_slug, v_availability);
        END IF;
      END IF;
      INSERT INTO public.marketplace_listing_sources (listing_id, source_slug, source_entity_id, source_url, raw, payload_hash, confidence, is_primary)
      VALUES (v_result_id, v_src_slug, v_src_eid, v_source_url, v_row.raw_data, v_hash, 1.0, v_action = 'inserted')
      ON CONFLICT (source_slug, source_entity_id) WHERE source_entity_id IS NOT NULL
      DO UPDATE SET listing_id = EXCLUDED.listing_id, raw = EXCLUDED.raw, payload_hash = EXCLUDED.payload_hash, last_seen_at = now();
      IF v_action = 'inserted' AND v_price IS NOT NULL THEN
        INSERT INTO public.marketplace_price_history (listing_id, price, currency, source_slug, availability)
        VALUES (v_result_id, v_price, v_currency, v_src_slug, v_availability);
      END IF;
      UPDATE public.ingestion_staging SET disposition = 'committed', target_record_id = v_result_id, payload_hash = v_hash, processed_at = now(), updated_at = now() WHERE id = v_row.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (v_row.id, 'commit', 'committed', 'commit_marketplace_staging_batch', jsonb_build_object('listing_id', v_result_id, 'action', v_action, 'price', v_price));
      staging_id := v_row.id; listing_id := v_result_id; action := v_action; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ingestion_staging SET disposition = 'rejected', error_message = 'commit_err: ' || SQLERRM, updated_at = now() WHERE id = v_row.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (v_row.id, 'commit', 'rejected', 'commit_marketplace_staging_batch', jsonb_build_object('error', SQLERRM));
      staging_id := v_row.id; listing_id := NULL; action := 'error'; RETURN NEXT;
    END;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.commit_marketplace_staging_batch(INT, UUID) TO authenticated, service_role;
