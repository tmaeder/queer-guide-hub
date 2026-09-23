-- Recognize explicit structured source categories at ingest time. This avoids
-- trusting a derived department/group while still using high-signal source
-- facts such as "Fantasy Dildos", "Ejaculating dildo", and "Ovipositor".

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
          'hoods_masks')
          OR slug ~ '(^|_)(dildos?|ovipositors?)$' THEN 4
        WHEN slug IN('fetish_wear','fetish_gear','lubricants','lubes','condoms',
          'safer_sex','poppers','adult_magazines',
          'adult_digital_magazines','adult_photo_books','adult_art_prints',
          'adult_zines','adult_photography','adult_polaroids','adult_subscriptions') THEN 3
        WHEN slug IN('underwear_and_swimwear','underwear','swimwear') THEN 2
        ELSE 1 END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?(ring|sling)|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|\me[- ]?stim|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt)' THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|\menema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)' THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm)' THEN 2
        ELSE 1 END) rank FROM s
  )
  SELECT CASE rank WHEN 4 THEN 'explicit' WHEN 3 THEN 'adult'
    WHEN 2 THEN 'suggestive' ELSE 'sfw' END FROM ranked;
$$;

INSERT INTO public.marketplace_quality_events
  (listing_id,dimension,previous_value,new_value,classifier_version,confidence)
SELECT id,'safety',to_jsonb(content_rating),to_jsonb('explicit'::text),
  'marketplace-content-rating-v4.2',1.0
FROM public.marketplace_listings
WHERE id IN(
  '1aef98c1-5a5f-4be8-92fc-c152f090f205',
  '1e0d9384-2a6c-4f19-a385-401451862931',
  '2c6f3f7f-8108-4030-9628-b507ad776e0c',
  '3a318e40-390d-42a3-a8cf-52875ccd2a3f')
  AND content_rating='sfw'
  AND NOT EXISTS(SELECT 1 FROM public.marketplace_quality_events e
    WHERE e.listing_id=marketplace_listings.id AND e.dimension='safety'
      AND e.classifier_version='marketplace-content-rating-v4.2' AND e.rollback_of IS NULL);

-- Touch a dependency of the stored generated column so PostgreSQL materializes
-- the new function result for the affected rows.
UPDATE public.marketplace_listings
SET subcategory=subcategory,
  attributes=coalesce(attributes,'{}'::jsonb)||jsonb_build_object(
    '_quality_safety_normalized_at',now(),
    '_quality_safety_version','marketplace-content-rating-v4.2')
WHERE id IN(
  '1aef98c1-5a5f-4be8-92fc-c152f090f205',
  '1e0d9384-2a6c-4f19-a385-401451862931',
  '2c6f3f7f-8108-4030-9628-b507ad776e0c',
  '3a318e40-390d-42a3-a8cf-52875ccd2a3f');

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.id IN(
    '1aef98c1-5a5f-4be8-92fc-c152f090f205',
    '1e0d9384-2a6c-4f19-a385-401451862931',
    '2c6f3f7f-8108-4030-9628-b507ad776e0c',
    '3a318e40-390d-42a3-a8cf-52875ccd2a3f');

SELECT public.run_marketplace_quality_snapshot();
