-- Teach marketplace_content_rating() about adult PUBLICATIONS.
--
-- The classifier only knew sex-toy / fetish-gear retail vocabulary (dildo,
-- jockstrap, harness...). It had no concept of explicit photography, porn
-- zines or erotic art books, so a nude photography magazine titled
-- "Elska Akureyri (Iceland)" rated 'sfw' and would land in default-SFW browse
-- (useMarketplace filters `.in('content_rating', SFW_RATINGS)`, and
-- isAdultListing treats content_rating as canonical -- a 'sfw' rating
-- overrides sensitivity_flags entirely).
--
-- Text matching can never fix this cohort: the adult-ness is a property of the
-- publisher, not of the title. Extending the regex with porn/nude keywords was
-- measured and caught only 76 of 459 such rows, while also reclassifying 214
-- unrelated rows in the existing catalogue.
--
-- So the signal is the subcategory. Every slug added below is NEW -- verified
-- zero pre-existing listings use one -- so this cannot change the rating of any
-- row already in the catalogue. STORED generated columns only recompute on row
-- update, and the only rows updated are those explicitly moved onto these slugs.
CREATE OR REPLACE FUNCTION public.marketplace_content_rating(p_subcategory text, p_title text, p_description text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH s AS (
    SELECT
      lower(regexp_replace(coalesce(p_subcategory,''), '[\s\-]+', '_', 'g')) AS slug,
      lower(coalesce(p_title,'') || ' ' || coalesce(p_description,'')) AS txt
  ),
  ranked AS (
    SELECT GREATEST(
      CASE
        WHEN slug IN ('sex_toys','anal_toys','cock_rings_and_stretchers',
                      'pumps_and_enlargement','chastity','bdsm_and_bondage','pup_and_pet_play')
          THEN 4
        WHEN slug IN ('fetish_wear','fetish_gear')                  THEN 3
        -- Adult publications: explicit/nude photography, porn zines, erotic
        -- art books. Publisher-level adult material whose titles carry no
        -- adult vocabulary at all.
        WHEN slug IN ('adult_magazines','adult_digital_magazines','adult_photo_books',
                      'adult_art_prints','adult_zines','adult_photography',
                      'adult_polaroids','adult_subscriptions')      THEN 3
        WHEN slug IN ('underwear_and_swimwear','underwear','swimwear') THEN 2
        ELSE 1
      END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|vibrator|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|strap[- ]?on|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|e-?stim|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|ball ?gag|\mgimp\M|humbler|hogtie|\mcock\M)'
          THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|enema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)'
          THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche)'
          THEN 2
        ELSE 1
      END
    ) AS rank
    FROM s
  )
  SELECT CASE (SELECT rank FROM ranked)
           WHEN 4 THEN 'explicit'
           WHEN 3 THEN 'adult'
           WHEN 2 THEN 'suggestive'
           ELSE 'sfw'
         END;
$function$;
