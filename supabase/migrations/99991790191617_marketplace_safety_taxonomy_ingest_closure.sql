-- Close recurring ingest-time taxonomy/rating gaps found after the historical
-- backfills drained. Rules use retained title/source-category facts and keep
-- every semantic change reversible through marketplace_quality_events.

SET lock_timeout='15s';
SET statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text,p_title text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$
  SELECT CASE
    WHEN lower(coalesce(p_title,'')) ~ '\m(packing|packer|stp) (strap|pouch)\M'
      AND lower(coalesce(p_title,'')) !~ '\m(kit|included|with)\M|\+' THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\mftm packer( with panty)?\M' THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\m(sex oil|stimulating (sex )?(oil|gel)|silicone shots?)\M' THEN 'lubricants'
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

CREATE OR REPLACE FUNCTION public.marketplace_content_rating(
  p_subcategory text,p_title text,p_description text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
  WITH s AS (
    SELECT lower(regexp_replace(coalesce(p_subcategory,''),'[\s\-]+','_','g')) slug,
      lower(coalesce(p_title,'')||' '||coalesce(p_description,'')) txt
  ), ranked AS (
    SELECT greatest(
      CASE
        WHEN slug IN('sex_toys','anal_toys','cock_rings','cock_rings_and_stretchers',
          'dildos','vibrators','masturbators','pumps_and_enlargement','chastity',
          'cage','bdsm_and_bondage','bondage','bdsm','butt_plugs','penis_rings',
          'penis_pumps','pumps','pup_and_pet_play','pup_play','impact_play','gags',
          'hoods_masks','sound','intim_body','penis_extender','male_chastity_device')
          OR slug ~ '(^|_)(dildos?|ovipositors?)$' THEN 4
        WHEN slug IN('fetish_wear','fetish_gear','lubricants','lubes','condoms',
          'safer_sex','poppers','adult_magazines','adult_digital_magazines',
          'adult_photo_books','adult_art_prints','adult_zines','adult_photography',
          'adult_polaroids','adult_subscriptions') THEN 3
        WHEN slug IN('underwear_and_swimwear','underwear','swimwear') THEN 2
        ELSE 1 END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?(ring|sling)|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|\me[- ]?stim|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt|handcuffs?|restraints?|maglock|fußfessel|fussfessel|sperm stopper|penis sleeve|pack[- ]and[- ]play)' THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|\menema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)' THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm)' THEN 2
        ELSE 1 END) rank FROM s
  )
  SELECT CASE rank WHEN 4 THEN 'explicit' WHEN 3 THEN 'adult'
    WHEN 2 THEN 'suggestive' ELSE 'sfw' END FROM ranked;
$$;

INSERT INTO public.marketplace_taxonomy_validation_corpus
  (listing_id,source_category,title,expected_group,expected_department,provenance,stratum)
VALUES
  ('30343b5a-0844-4925-9c90-a5fadbe4bf94','Good For Beginners,Anal Friendly,Vaginal,Discreet,Under $50','Sliquid Organics O Gel Stimulating Sex Oil','lubricants','intimacy','human_review:prod_2026_09_23','safety_taxonomy_boundary'),
  ('71a87a2a-506d-4a38-b899-3519c81baaa7','Male Chastity Device','The Black Pack — 5 Silicone Shots','lubricants','intimacy','human_review:prod_2026_09_23','safety_taxonomy_boundary'),
  ('8d92ff6d-3c15-4916-9278-862a08c2e894','Körperformen','XX-DREAMSTOYS - Ftm Packer mit Panty','accessories','apparel','human_review:prod_2026_09_23','safety_taxonomy_boundary')
ON CONFLICT(source_category,title) DO UPDATE SET expected_group=excluded.expected_group,
  expected_department=excluded.expected_department,provenance=excluded.provenance,stratum=excluded.stratum;

WITH corrections(id,new_department,new_group,new_rating) AS (VALUES
  ('30343b5a-0844-4925-9c90-a5fadbe4bf94'::uuid,'intimacy','lubricants','adult'),
  ('71a87a2a-506d-4a38-b899-3519c81baaa7'::uuid,'intimacy','lubricants','adult'),
  ('8d92ff6d-3c15-4916-9278-862a08c2e894'::uuid,'apparel','accessories','sfw')
), events AS (
  INSERT INTO public.marketplace_quality_events
    (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
  SELECT ml.id,'taxonomy',jsonb_build_object('department',ml.department,'group',ml.subcategory_group,'fine',ml.subcategory_fine),
    jsonb_build_object('department',c.new_department,'group',c.new_group,'fine',null),
    'marketplace-taxonomy-v4.3',1.0
  FROM corrections c JOIN public.marketplace_listings ml ON ml.id=c.id
  WHERE NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=ml.id AND e.dimension='taxonomy' AND e.classifier_version='marketplace-taxonomy-v4.3' AND e.rollback_of IS NULL)
), safety_events AS (
  INSERT INTO public.marketplace_quality_events
    (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
  SELECT ml.id,'safety',to_jsonb(ml.content_rating),to_jsonb(c.new_rating),
    'marketplace-content-rating-v4.3',1.0
  FROM corrections c JOIN public.marketplace_listings ml ON ml.id=c.id
  WHERE ml.content_rating<>c.new_rating
    AND NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
      WHERE e.listing_id=ml.id AND e.dimension='safety'
        AND e.classifier_version='marketplace-content-rating-v4.3' AND e.rollback_of IS NULL)
)
UPDATE public.marketplace_listings ml SET department=c.new_department,
  subcategory_group=c.new_group,subcategory_fine=NULL,taxonomy_confidence=1.0,
  taxonomy_classifier_version='marketplace-taxonomy-v4.3',
  subcategory=CASE WHEN c.new_group='lubricants' THEN 'lubricants' ELSE ml.subcategory END
FROM corrections c WHERE ml.id=c.id;

WITH explicit_ids(id) AS (VALUES
  ('2e93951b-3585-4b9d-8028-8ee765422926'::uuid),('2e6c0b94-fa2b-44ff-96b5-7431c6f7d467'::uuid),
  ('f1fe68f5-fa97-42bb-8376-15efa9448cd5'::uuid),('de0c5171-b59a-4d26-8741-c68c862a9bc9'::uuid),
  ('d08379ca-7853-4c52-a296-385da4aec54c'::uuid),('4b114e11-9bc2-41d6-842b-92ac253e9529'::uuid),
  ('fd7dc012-a3ee-40a5-ac39-b09ee6fcaf46'::uuid),('11bff969-3708-42a8-919d-e9a92e9fdf5a'::uuid),
  ('38402c6d-c01e-45ff-a1b1-1dfd37f347a6'::uuid),('07d68e6e-7085-4dca-8dc7-c76a2514d78e'::uuid)
)
INSERT INTO public.marketplace_quality_events
  (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
SELECT ml.id,'safety',to_jsonb(ml.content_rating),to_jsonb('explicit'::text),
  'marketplace-content-rating-v4.3',1.0
FROM explicit_ids x JOIN public.marketplace_listings ml ON ml.id=x.id
WHERE ml.content_rating='sfw' AND NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
  WHERE e.listing_id=ml.id AND e.dimension='safety' AND e.classifier_version='marketplace-content-rating-v4.3' AND e.rollback_of IS NULL);

WITH explicit_ids(id) AS (VALUES
  ('2e93951b-3585-4b9d-8028-8ee765422926'::uuid),('2e6c0b94-fa2b-44ff-96b5-7431c6f7d467'::uuid),
  ('f1fe68f5-fa97-42bb-8376-15efa9448cd5'::uuid),('de0c5171-b59a-4d26-8741-c68c862a9bc9'::uuid),
  ('d08379ca-7853-4c52-a296-385da4aec54c'::uuid),('4b114e11-9bc2-41d6-842b-92ac253e9529'::uuid),
  ('fd7dc012-a3ee-40a5-ac39-b09ee6fcaf46'::uuid),('11bff969-3708-42a8-919d-e9a92e9fdf5a'::uuid),
  ('38402c6d-c01e-45ff-a1b1-1dfd37f347a6'::uuid),('07d68e6e-7085-4dca-8dc7-c76a2514d78e'::uuid)
)
UPDATE public.marketplace_listings ml SET
  attributes=coalesce(ml.attributes,'{}'::jsonb)||jsonb_build_object(
    '_quality_original_subcategory',ml.subcategory,
    '_quality_safety_normalized_at',now(),
    '_quality_safety_version','marketplace-content-rating-v4.3'),
  subcategory=ml.subcategory_group
FROM explicit_ids x WHERE ml.id=x.id AND ml.content_rating='sfw';

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM public.marketplace_listings
WHERE taxonomy_classifier_version='marketplace-taxonomy-v4.3'
ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;
