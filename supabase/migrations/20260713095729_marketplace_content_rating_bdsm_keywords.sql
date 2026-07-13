-- The 2026-07-05 merchant import surfaced floggers/elastrators/whips rated
-- 'sfw' on pre-opt-in rails: the keyword classifier behind the generated
-- content_rating column lacked those terms. Extend the vocabulary, then
-- force a recompute on just the rows the new keywords touch (scoped no-op
-- UPDATE — a full-table rewrite would storm the search-sync triggers).

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

-- Recompute only rows the new keywords can reclassify (scoped: ~350 rows).
UPDATE marketplace_listings
SET updated_at = updated_at
WHERE content_rating IN ('sfw','suggestive')
  AND (
    lower(coalesce(title,'') || ' ' || coalesce(description,''))
      ~ '(flogger|elastrator|\mwhips?\M|spreader ?bar|ball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook|anal (fastener|speculum))'
  );
