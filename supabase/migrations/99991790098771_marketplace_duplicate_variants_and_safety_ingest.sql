-- Close the final attribute-extraction retry and classify newly ingested
-- safety contradictions without trusting the pre-existing category blindly.

SET lock_timeout = '15s';
SET statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text,p_title text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$
  SELECT CASE
    WHEN lower(coalesce(p_title,'')) ~ '\m(packing|packer|stp) (strap|pouch)\M'
      AND lower(coalesce(p_title,'')) !~ '\m(kit|included|with)\M|\+'
      THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\mcuff logo( crystal)?\M' THEN 'jewelry'
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
VALUES('c62316eb-fbbf-4fa5-ade6-ecb5602fb554','Accessoire','CUFF LOGO crystal',
  'jewelry','jewelry','human_review:prod_2026_09_22','safety_taxonomy_boundary')
ON CONFLICT(source_category,title) DO UPDATE SET
  expected_group=excluded.expected_group,expected_department=excluded.expected_department,
  provenance=excluded.provenance,stratum=excluded.stratum;

WITH candidate AS (
  SELECT id,department,subcategory_group,subcategory_fine
  FROM public.marketplace_listings
  WHERE id='c62316eb-fbbf-4fa5-ade6-ecb5602fb554'
), event AS (
  INSERT INTO public.marketplace_quality_events
    (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
  SELECT id,'taxonomy',
    jsonb_build_object('department',department,'group',subcategory_group,'fine',subcategory_fine),
    jsonb_build_object('department','jewelry','group','jewelry','fine',null),
    'marketplace-taxonomy-v4.2',1.0
  FROM candidate
  WHERE NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=candidate.id AND e.dimension='taxonomy'
      AND e.classifier_version='marketplace-taxonomy-v4.2' AND e.rollback_of IS NULL)
)
UPDATE public.marketplace_listings ml SET department='jewelry',subcategory_group='jewelry',
  subcategory_fine=NULL,taxonomy_confidence=1.0,
  taxonomy_classifier_version='marketplace-taxonomy-v4.2'
FROM candidate c WHERE ml.id=c.id;

INSERT INTO public.marketplace_quality_events
  (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
SELECT id,'safety',to_jsonb(content_rating),to_jsonb('explicit'::text),
  'marketplace-content-rating-v4.1',1.0
FROM public.marketplace_listings
WHERE id IN('3379f058-a554-4620-a9e6-a84884ee8229','c812f770-c60f-4a8d-a075-8e4b94d48fcb')
  AND content_rating='sfw'
  AND NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=marketplace_listings.id AND e.dimension='safety'
      AND e.classifier_version='marketplace-content-rating-v4.1' AND e.rollback_of IS NULL);

UPDATE public.marketplace_listings SET
  attributes=coalesce(attributes,'{}'::jsonb)||jsonb_build_object(
    '_quality_original_subcategory',subcategory,
    '_quality_safety_normalized_at',now(),
    '_quality_safety_version','marketplace-content-rating-v4.1'),
  subcategory=subcategory_group
WHERE id IN('3379f058-a554-4620-a9e6-a84884ee8229','c812f770-c60f-4a8d-a075-8e4b94d48fcb')
  AND content_rating='sfw';

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.id IN('3379f058-a554-4620-a9e6-a84884ee8229','c812f770-c60f-4a8d-a075-8e4b94d48fcb');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
VALUES('marketplace','c62316eb-fbbf-4fa5-ade6-ecb5602fb554')
ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;
