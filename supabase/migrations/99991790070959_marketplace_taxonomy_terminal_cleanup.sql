-- Resolve the final taxonomy edge case without converting a category mistake
-- into an adult-rating false positive, and stop the finite model drain once no
-- claimable rows remain.

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text,p_title text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$
  SELECT CASE
    WHEN lower(coalesce(p_title,'')) ~ '\m(packing|packer|stp) (strap|pouch)\M'
      AND lower(coalesce(p_title,'')) !~ '\m(kit|included|with)\M|\+'
      THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cleaner|cleaning spray|toy cleaner)\M' THEN 'safer_sex'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cycling kit|cycle kit)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title,'')) ~ '\m(t-?shirts?|tees?|tank tops?|crop tops?|camis?|camisoles?|polos?|jerseys?|blouses?)\M' THEN 'tops'
    WHEN lower(coalesce(p_title,'')) ~ '\m(hoodies?|sweatshirts?|jackets?|coats?|bombers?)\M' THEN 'outerwear'
    WHEN lower(coalesce(p_title,'')) ~ '\m(leggings?|shorts?|trousers?|pants?|jeans?|skirts?)\M' THEN 'bottoms'
    WHEN lower(coalesce(p_title,'')) ~ '\m(dresses?|robes?)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title,'')) ~ '\m(dildo|vibrator|masturbator|stroker|butt plug|anal plug|cock ring|chastity cage|wand massager)\M'
      THEN public.marketplace_subcategory_group_v3(p_title,p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(lubricants?|lubes?|gleitgel|douches?|enemas?|condoms?)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(restraints?|cuffs?|manacles?|shackles?)\M' THEN 'bondage'
    WHEN lower(coalesce(p_title,'')) ~ '\m(harness|harnesses)\M' THEN 'harnesses'
    WHEN lower(coalesce(p_title,'')) ~ '\m(menstrual cup)\M' THEN 'grooming'
    WHEN lower(coalesce(p_title,'')) ~ '\m(jocks?|jockstraps?|briefs|boxers|thong|lingerie|underwear)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(necklace|earrings?|bracelet|pendant|ring)\M' THEN 'jewelry'
    WHEN lower(coalesce(p_title,'')) ~ '\m(books?|novels?|memoirs?|antholog(y|ies)|paperbacks?|hardcovers?)\M' THEN 'books'
    ELSE public.marketplace_subcategory_group_v3(p_subcategory,p_title)
  END;
$$;

INSERT INTO public.marketplace_taxonomy_validation_corpus
  (listing_id,source_category,title,expected_group,expected_department,provenance,stratum)
VALUES('68cde549-1ffb-41ac-bd35-ad512bdda742','Gender Gear',
  'STP & Packing Strap – Adjustable Bulge Control','accessories','apparel',
  'human_review:prod_2026_09_22','safety_taxonomy_boundary')
ON CONFLICT(source_category,title) DO UPDATE SET
  expected_group=excluded.expected_group,expected_department=excluded.expected_department,
  provenance=excluded.provenance,stratum=excluded.stratum;

WITH candidates AS (
  SELECT id,department,subcategory_group,subcategory_fine
  FROM public.marketplace_listings
  WHERE status='active' AND subcategory_group='sex_toys'
    AND lower(title) ~ '\m(packing|packer|stp) (strap|pouch)\M'
    AND lower(title) !~ '\m(kit|included|with)\M|\+'
), events AS (
  INSERT INTO public.marketplace_quality_events
    (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
  SELECT id,'taxonomy',
    jsonb_build_object('department',department,'group',subcategory_group,'fine',subcategory_fine),
    jsonb_build_object('department','apparel','group','accessories','fine',null),
    'marketplace-taxonomy-v4.1',1.0
  FROM candidates
  WHERE NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=candidates.id AND e.dimension='taxonomy'
      AND e.classifier_version='marketplace-taxonomy-v4.1' AND e.rollback_of IS NULL)
)
UPDATE public.marketplace_listings ml SET department='apparel',subcategory_group='accessories',
  subcategory_fine=NULL,taxonomy_confidence=1.0,
  taxonomy_classifier_version='marketplace-taxonomy-v4.1'
FROM candidates c WHERE ml.id=c.id;

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM public.marketplace_listings
WHERE taxonomy_classifier_version='marketplace-taxonomy-v4.1'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketplace_quality_completion_supervisor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_active integer; v_attr integer; v_stale integer; v_healthy integer;
  v_tax_pending integer; v_other integer; v_model_pending integer;
  v_desc_recovery integer; v_changed boolean:=false;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE attributes_extracted_at IS NULL),
    count(*) FILTER(WHERE (link_checked_at IS NULL OR link_checked_at<now()-interval '30 days')
      AND (last_seen_at IS NULL OR last_seen_at<now()-interval '30 days')),
    count(*) FILTER(WHERE department='other'),
    count(*) FILTER(WHERE taxonomy_version<4),
    count(*) FILTER(WHERE taxonomy_version=4 AND subcategory_group='other'
      AND coalesce(taxonomy_model_status,'pending') IN('pending','failed')
      AND taxonomy_model_attempts<3)
  INTO v_active,v_attr,v_stale,v_other,v_tax_pending,v_model_pending
  FROM public.marketplace_listings WHERE status='active';
  SELECT count(*) INTO v_healthy FROM public.marketplace_listings ml
  WHERE ml.status='active' AND EXISTS(SELECT 1 FROM public.image_asset_links ial
    JOIN public.image_assets ia ON ia.id=ial.asset_id
    WHERE ial.entity_type='marketplace_listing' AND ial.entity_id=ml.id
      AND ia.optimization_status IN('optimized','cdn_optimized'));
  SELECT count(*) INTO v_desc_recovery FROM public.marketplace_listings
  WHERE status='active' AND length(coalesce(btrim(description),''))<=20
    AND NOT(coalesce(description_i18n,'{}'::jsonb)?'_recovery_checked_at');

  IF v_attr=0 THEN
    UPDATE public.admin_automations SET schedule='*/10 * * * *',updated_at=now()
    WHERE slug='marketplace_variant_backfill' AND schedule<>'*/10 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_stale<=ceil(v_active*0.05) THEN
    UPDATE public.admin_automations SET schedule='0 * * * *',updated_at=now()
    WHERE slug='marketplace_link_checker' AND schedule<>'0 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_healthy>=ceil(v_active*0.95) THEN
    UPDATE public.admin_automations SET schedule='*/2 * * * *',updated_at=now()
    WHERE slug='marketplace_image_optimize' AND schedule<>'*/2 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_tax_pending=0 THEN
    UPDATE public.admin_automations SET enabled=false,updated_at=now()
    WHERE slug='marketplace_taxonomy_v3_backfill' AND enabled;
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_model_pending=0 THEN
    UPDATE public.admin_automations SET enabled=false,updated_at=now()
    WHERE slug='marketplace_taxonomy_classify' AND enabled;
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_desc_recovery=0 THEN
    UPDATE public.admin_automations SET schedule='0 * * * *',updated_at=now()
    WHERE slug='marketplace_description_enhance' AND schedule<>'0 * * * *';
    v_changed:=v_changed OR FOUND;
  END IF;
  IF v_changed THEN PERFORM public.sync_automations_to_cron(true); END IF;
  RETURN jsonb_build_object('active',v_active,'attributes_pending',v_attr,
    'link_stale_30d',v_stale,'healthy_image_listings',v_healthy,
    'taxonomy_pending',v_tax_pending,'department_other',v_other,
    'taxonomy_model_pending',v_model_pending,
    'description_recovery_pending',v_desc_recovery,'schedule_changed',v_changed);
END;
$$;

SELECT public.marketplace_quality_completion_supervisor();
SELECT public.run_marketplace_quality_snapshot();
