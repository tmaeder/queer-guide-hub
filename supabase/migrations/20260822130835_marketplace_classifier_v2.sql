-- Marketplace classifier v2 (2026-08-22 data-quality pass).
--
-- Why: department='other' was the single largest department again — 14,849 of
-- 61,627 active listings (24%). Two causes, both measured live:
--   (a) ~30 sources added after the 2026-07-04 taxonomy migration carry
--       vocabulary the keyword rules never learned (German/Spanish/Italian
--       shop categories, cami/skirt/bra/binder-type apparel terms, maker
--       home goods), and
--   (b) the classifier reads ONLY `subcategory`, so the 6,303 NULL-subcategory
--       rows and the store-junk buckets ("Custom", "A SERIES",
--       "Good For Beginners,Under $50") could never classify at all — while
--       running the same rules over `title` recovers 59% of the whole
--       'other' bucket.
--
-- This migration ships the vocabulary + two-arg (subcategory, title) overloads;
-- the companion 20260916120100 regenerates the STORED columns.
--
-- Also: marketplace_content_rating() learns the German toy vocabulary the
-- 2026-08-21 audit proved it misses (188+ confirmed sfw-rated toys —
-- "Vibrationskugel", "Penisextender", "Fingerstimulator", "Love Eggs ...
-- Clitoris Stimulator") — a live Safe Mode hole.
--
-- New taxonomy surface: subcategory_group 'home_goods' + department 'home'
-- (candles, mugs, towels, blankets, fans — the queer-maker long tail that was
-- 100% 'other'). Mirrored in src/lib/marketplaceTaxonomy.ts.

-- ── Rule engine (single source of truth for both 1-arg and 2-arg forms) ──────
CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  WITH s AS (
    SELECT btrim(regexp_replace(lower(coalesce(p_subcategory,'')), '[^a-z0-9]+', ' ', 'g')) AS n
  )
  SELECT CASE
    -- Gift cards would otherwise hit the 'cards? → art' rule; they are not products.
    WHEN n ~ '\y(gift ?cards?|giftcards?|gutscheine?)\y'                              THEN 'other'
    WHEN n ~ '\y(anal|analplugs?|buttplugs?|plugs?|prostate|beads?|analkugel\w*|analkette\w*)\y' THEN 'anal_toys'
    WHEN n ~ '\y(dildos?|dongs?|realistics?|umschnall\w*)\y'                          THEN 'dildos'
    WHEN n ~ '\y(masturbators?|masturbatoren|strokers?|fleshlights?|vaginas?|onanism|sleeves?)\y' THEN 'masturbators'
    WHEN n ~ '\y(vibrat\w*|vibes?|wands?|stimulators?|stimulatoren|rabbitvibrator\w*)\y' THEN 'vibrators'
    WHEN n ~ '\y(cock ?rings?|cockrings?|cock ?straps?|ball ?stretchers?|sheaths?|glans|foreskin|penisringe?|hodenringe?)\y' THEN 'cock_rings'
    WHEN n ~ '\y(chastity|cages?|cbt|keuschheit\w*)\y'                                THEN 'chastity'
    WHEN n ~ '\y(pumps?|enlarge|enlargement|penispumpen?|penisextender\w*)\y'         THEN 'pumps'
    WHEN n ~ '\y(lubes?|lubricants?|gleitgel|gleitmittel|massage\w*)\y'               THEN 'lubes'
    WHEN n ~ '\y(aromas?|aromen|poppers?)\y'                                          THEN 'poppers'
    WHEN n ~ '\y(condoms?|kondome|douches?|enema|safer sex)\y'                        THEN 'safer_sex'
    WHEN n ~ '\y(sex ?toys?|sextoys?|strap ?ons?|strapon|better sex|nipples?|clamps?|sounds?|urethral|estim|nippelklemmen?|liebeskugel\w*|love ?eggs?|spiele)\y' THEN 'sex_toys'
    WHEN n ~ '\y(pups?|puppy|pet play|kitten|neko|pony)\y'                            THEN 'pup_play'
    WHEN n ~ '\y(bondage|restraints?|handcuffs?|cuffs?|leash\w*|ropes?|shibari|spreaders?|slings?|handschellen|fesseln?)\y' THEN 'bondage'
    WHEN n ~ '\y(floggers?|paddles?|whips?|canes?|impact|punishment|spank|peitschen?)\y' THEN 'impact_play'
    WHEN n ~ '\y(gags?|muzzles?|knebel)\y'                                            THEN 'gags'
    WHEN n ~ '\y(hoods?|blindfolds?|masks?)\y'                                        THEN 'hoods_masks'
    WHEN n ~ '\y(harness|harnesses)\y'                                                THEN 'harnesses'
    WHEN n ~ '\y(collars?|halsband|halsb\w*)\y'                                       THEN 'collars'
    WHEN n ~ '\y(fetish|leather|latex|rubber|neoprene|sleaze|bdsm|kink|dungeon|fetisch\w*|wetlook)\y' THEN 'fetish_gear'
    WHEN n ~ '\y(jocks?|jockstraps?)\y'                                               THEN 'jockstraps'
    WHEN n ~ '\y(thongs?|g ?strings?|tangas?)\y'                                      THEN 'thongs'
    WHEN n ~ '\y(lingerie|bras?|bralettes?|bustiers?|dessous|stockings?|hosiery|suspenders?|strapse\w*)\y' THEN 'lingerie'
    -- Swim-QUALIFIED garment phrases must beat the underwear rule ('swim
    -- briefs'/'swim trunks' would otherwise hit briefs?/trunks?), but the
    -- generic swimwear rule stays AFTER underwear so the combined
    -- "Underwear and Swimwear" umbrella (1,737 rows) keeps resolving to
    -- underwear exactly as v1 did, and "Bikini String Thong" panties keep
    -- resolving via the earlier thongs rule.
    WHEN n ~ '\y(swim ?(briefs?|trunks?|shorts?|suits?))\y'                           THEN 'swimwear'
    WHEN n ~ '\y(underwear|undies|briefs?|boxers?|binders?|trunks?|boxershorts?|unterhosen?|unterw\w*)\y' THEN 'underwear'
    WHEN n ~ '\y(swim|swimwear|swimsuits?|speedos?|beachwear|bikinis?|badehosen?|bademode)\y' THEN 'swimwear'
    -- Packers/STPs are trans intimacy gear — but only after the underwear rule,
    -- so "Packing Underwear" garments stay in underwear.
    WHEN n ~ '\y(packers?|stps?)\y'                                                   THEN 'sex_toys'
    WHEN n ~ '\y(jewelry|jewellery|necklaces?|bracelets?|earrings?|pendants?|rings?|chokers?|chains?|anklets?|brooch\w*|charms?|halskette\w*|schmuck|ohrringe?)\y' THEN 'jewelry'
    WHEN n ~ '\y(socks?|socken)\y'                                                    THEN 'socks'
    WHEN n ~ '\y(jackets?|coats?|hoodies?|sweaters?|sweatshirts?|jumpers?|knits?|knitwear|cardigans?|outwears?|outerwear|parkas?|jacken?)\y' THEN 'outerwear'
    WHEN n ~ '\y(jumpsuits?|onesies?|rompers?|bodysuits?|catsuits?)\y'                THEN 'bodywear'
    WHEN n ~ '\y(shoes?|boots?|sneakers?|footwear|trainers?|sandals?|slides?|flip ?flops?|zapatos?|botas?|botines?|sandalias?|schuhe)\y' THEN 'footwear'
    WHEN n ~ '\y(caps?|hats?|beanies?|snapbacks?|headwear)\y'                         THEN 'headwear'
    WHEN n ~ '\y(bottoms?|pants?|trousers?|shorts?|jeans?|denim|leggings?|joggers?|chinos?|skirts?|faldas?|hosen?)\y' THEN 'bottoms'
    WHEN n ~ '\y(tops?|t ?shirts?|tees?|tanks?|singlets?|shirts?|polos?|jerseys?|rugby|blouses?|vests?|camis?|camisoles?|racerbacks?|halter|maglia|maglie|camisetas?|blusas?)\y' THEN 'tops'
    WHEN n ~ '\y(accessor\w*|accessoires?|bags?|backpacks?|wallets?|belts?|ties?|bandanas?|armbands?|scarf|scarves|gloves?|sunglass\w*|patch\w*|flags?|pins?|badges?|keychains?|lanyards?|stickers?|gafas)\y' THEN 'accessories'
    WHEN n ~ '\y(apparel|clothing|clothes|garments?|menswear|womenswear|wear|fashion|sportswear|loungewear|sports?|uniforms?|suits?|dresses?|robes?|chaps|abbigliamento|ropa|kleidung|activewear|cycling)\y' THEN 'apparel'
    WHEN n ~ '\y(films?|movies?|dvds?|blu ?rays?|cinema|documentaries?|filme)\y'      THEN 'film'
    WHEN n ~ '\y(books?|magazines?|zines?|comics?|novels?|ebooks?|buch|romane?)\y'    THEN 'books'
    WHEN n ~ '\y(calendars?|kalender)\y'                                              THEN 'calendars'
    WHEN n ~ '\y(art|arts|prints?|posters?|paintings?|photography|illustrations?|artwork|cards?|postcards?|polaroids?|stationery|notebooks?|journals?|sketchbooks?|kunstdruck\w*)\y' THEN 'art'
    WHEN n ~ '\y(candles?|kerzen?|mugs?|tassen?|towels?|blankets?|decken?|pillows?|cushions?|kissen|coasters?|magnets?|ornaments?|incense|vases?|home ?decor|homewares?|home ?goods|hand ?fans?|fans?)\y' THEN 'home_goods'
    WHEN n ~ '\y(hygiene|skincare|skin care|grooming|cosmetics?|makeup|make up|mascaras?|soaps?|shampoos?|deodorants?|fragrances?|perfumes?|cologne|lotions?|beard|shave|shaving|razors?|toothbrush|care|wash|parfums?|parfum\w*|pheromon\w*|duschgel|seifen?|cremes?|stimulanzien|nahrungserg\w*|supplements?|vitamins?)\y' THEN 'grooming'
    WHEN n ~ '\y(mental health|therapy|coaching|coach|training|events?|planning|consultation|services?|booking|sessions?|workshops?)\y' THEN 'services'
    ELSE 'other'
  END
  FROM s;
$function$;

-- Two-arg form: subcategory wins; a subcategory that classifies to 'other'
-- (NULL, store junk like "Custom"/"A SERIES", unlearned vocab) falls back to
-- the same rules over the product title. Measured on the live 'other' bucket:
-- title fallback alone recovers 59% of it.
CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT coalesce(
    nullif(public.marketplace_subcategory_group(p_subcategory), 'other'),
    nullif(public.marketplace_subcategory_group(p_title), 'other'),
    'other'
  );
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_department(p_subcategory text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE public.marketplace_subcategory_group(p_subcategory)
    WHEN 'anal_toys'   THEN 'intimacy'   WHEN 'dildos'      THEN 'intimacy'
    WHEN 'masturbators'THEN 'intimacy'   WHEN 'vibrators'   THEN 'intimacy'
    WHEN 'cock_rings'  THEN 'intimacy'   WHEN 'chastity'    THEN 'intimacy'
    WHEN 'pumps'       THEN 'intimacy'   WHEN 'lubes'       THEN 'intimacy'
    WHEN 'poppers'     THEN 'intimacy'   WHEN 'safer_sex'   THEN 'intimacy'
    WHEN 'sex_toys'    THEN 'intimacy'
    WHEN 'pup_play'    THEN 'bdsm_fetish' WHEN 'bondage'     THEN 'bdsm_fetish'
    WHEN 'impact_play' THEN 'bdsm_fetish' WHEN 'gags'        THEN 'bdsm_fetish'
    WHEN 'hoods_masks' THEN 'bdsm_fetish' WHEN 'harnesses'   THEN 'bdsm_fetish'
    WHEN 'collars'     THEN 'bdsm_fetish' WHEN 'fetish_gear' THEN 'bdsm_fetish'
    WHEN 'jockstraps'  THEN 'underwear'  WHEN 'thongs'      THEN 'underwear'
    WHEN 'lingerie'    THEN 'underwear'  WHEN 'underwear'   THEN 'underwear'
    WHEN 'swimwear'    THEN 'swimwear'
    WHEN 'socks'       THEN 'apparel'    WHEN 'outerwear'   THEN 'apparel'
    WHEN 'bodywear'    THEN 'apparel'    WHEN 'footwear'    THEN 'apparel'
    WHEN 'headwear'    THEN 'apparel'    WHEN 'bottoms'     THEN 'apparel'
    WHEN 'tops'        THEN 'apparel'    WHEN 'accessories' THEN 'apparel'
    WHEN 'apparel'     THEN 'apparel'
    WHEN 'jewelry'     THEN 'jewelry'
    WHEN 'film'        THEN 'books_art' WHEN 'books'       THEN 'books_art'
    WHEN 'calendars'   THEN 'books_art' WHEN 'art'         THEN 'books_art'
    WHEN 'home_goods'  THEN 'home'
    WHEN 'grooming'    THEN 'hygiene'
    WHEN 'services'    THEN 'services'
    ELSE 'other'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_department(p_subcategory text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE public.marketplace_subcategory_group(p_subcategory, p_title)
    WHEN 'anal_toys'   THEN 'intimacy'   WHEN 'dildos'      THEN 'intimacy'
    WHEN 'masturbators'THEN 'intimacy'   WHEN 'vibrators'   THEN 'intimacy'
    WHEN 'cock_rings'  THEN 'intimacy'   WHEN 'chastity'    THEN 'intimacy'
    WHEN 'pumps'       THEN 'intimacy'   WHEN 'lubes'       THEN 'intimacy'
    WHEN 'poppers'     THEN 'intimacy'   WHEN 'safer_sex'   THEN 'intimacy'
    WHEN 'sex_toys'    THEN 'intimacy'
    WHEN 'pup_play'    THEN 'bdsm_fetish' WHEN 'bondage'     THEN 'bdsm_fetish'
    WHEN 'impact_play' THEN 'bdsm_fetish' WHEN 'gags'        THEN 'bdsm_fetish'
    WHEN 'hoods_masks' THEN 'bdsm_fetish' WHEN 'harnesses'   THEN 'bdsm_fetish'
    WHEN 'collars'     THEN 'bdsm_fetish' WHEN 'fetish_gear' THEN 'bdsm_fetish'
    WHEN 'jockstraps'  THEN 'underwear'  WHEN 'thongs'      THEN 'underwear'
    WHEN 'lingerie'    THEN 'underwear'  WHEN 'underwear'   THEN 'underwear'
    WHEN 'swimwear'    THEN 'swimwear'
    WHEN 'socks'       THEN 'apparel'    WHEN 'outerwear'   THEN 'apparel'
    WHEN 'bodywear'    THEN 'apparel'    WHEN 'footwear'    THEN 'apparel'
    WHEN 'headwear'    THEN 'apparel'    WHEN 'bottoms'     THEN 'apparel'
    WHEN 'tops'        THEN 'apparel'    WHEN 'accessories' THEN 'apparel'
    WHEN 'apparel'     THEN 'apparel'
    WHEN 'jewelry'     THEN 'jewelry'
    WHEN 'film'        THEN 'books_art' WHEN 'books'       THEN 'books_art'
    WHEN 'calendars'   THEN 'books_art' WHEN 'art'         THEN 'books_art'
    WHEN 'home_goods'  THEN 'home'
    WHEN 'grooming'    THEN 'hygiene'
    WHEN 'services'    THEN 'services'
    ELSE 'other'
  END;
$function$;

-- ── Safe Mode: content-rating vocabulary the 2026-08-21 audit proved missing ─
-- Rank-4 additions: 'vibrat' (was 'vibrator' — misses Vibrationskugel /
-- Vibrationsei / Paarvibrator), penisextender, Penisvergrößerung (umlaut-safe
-- prefix), clitoris/klitoris, stimulator (Fingerstimulator etc.), love egg /
-- Liebesei, Liebeskugel, Sexspielzeug, lovetoy, g-spot/g-punkt.
-- Rank-2 addition: orgasm* (suggestive — keeps sex-ed books visible-but-flagged
-- rather than explicit-gated).
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
        WHEN txt ~ '(dildo|butt ?plug|vibrat|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|strap[- ]?on|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|e-?stim|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|ball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penisextender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|g[- ]?spot|g[- ]?punkt)'
          THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|enema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)'
          THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm)'
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
