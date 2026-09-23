-- The two production-authored marketplace migrations recovered immediately
-- before this file replaced the classifier with an older unsafe variant. Keep
-- their expanded vocabulary while restoring the established word-boundary and
-- slug-tier contract from 99991790061063.

SET lock_timeout = '15s';
SET statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.marketplace_content_rating(
  p_subcategory text,
  p_title text,
  p_description text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $function$
  WITH s AS (
    SELECT
      lower(regexp_replace(coalesce(p_subcategory, ''), '[\s\-]+', '_', 'g')) AS slug,
      lower(coalesce(p_title, '') || ' ' || coalesce(p_description, '')) AS txt
  ), ranked AS (
    SELECT greatest(
      CASE
        WHEN slug IN (
          'sex_toys', 'anal_toys', 'cock_rings', 'cock_rings_and_stretchers',
          'dildos', 'vibrators', 'masturbators', 'pumps_and_enlargement',
          'chastity', 'cage', 'bdsm_and_bondage', 'bondage', 'bdsm',
          'butt_plugs', 'penis_rings', 'penis_pumps', 'pumps',
          'pup_and_pet_play', 'pup_play', 'impact_play', 'gags', 'hoods_masks',
          'sound', 'intim_body', 'penis_extender', 'male_chastity_device'
        ) THEN 4
        WHEN slug ~ '(^|_)(dildos?|ovipositors?)$' THEN 4
        WHEN slug IN (
          'fetish_wear', 'fetish_gear', 'lubricants', 'lubes', 'condoms',
          'safer_sex', 'poppers', 'adult_magazines',
          'adult_digital_magazines', 'adult_photo_books', 'adult_art_prints',
          'adult_zines', 'adult_photography', 'adult_polaroids',
          'adult_subscriptions'
        ) THEN 3
        WHEN slug IN ('underwear_and_swimwear', 'underwear', 'swimwear') THEN 2
        ELSE 1
      END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?(ring|sling)|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|\me[- ]?stim\M|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt|handcuffs?|restraints?|maglock|fußfessel|fussfessel|sperm stopper|penis sleeve|pack[- ]and[- ]play)'
          THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|\menema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)'
          THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm)'
          THEN 2
        ELSE 1
      END
    ) AS rank
    FROM s
  )
  SELECT CASE rank
    WHEN 4 THEN 'explicit'
    WHEN 3 THEN 'adult'
    WHEN 2 THEN 'suggestive'
    ELSE 'sfw'
  END
  FROM ranked;
$function$;

-- content_rating is a stored generated column. Naming one of its source
-- columns forces PostgreSQL to materialize the corrected classifier result.
UPDATE public.marketplace_listings ml
SET title = ml.title
WHERE ml.content_rating IS DISTINCT FROM
  public.marketplace_content_rating(ml.subcategory, ml.title, ml.description);

DELETE FROM public.search_documents sd
USING public.marketplace_listings ml
WHERE sd.entity_type = 'marketplace'
  AND sd.entity_id = ml.id
  AND ml.content_rating NOT IN ('sfw', 'suggestive');

INSERT INTO public.search_reindex_queue(entity_type, entity_id)
SELECT 'marketplace', ml.id
FROM public.marketplace_listings ml
WHERE ml.status = 'active'
  AND ml.content_rating IN ('sfw', 'suggestive')
ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;
