-- Production classifier snapshot, 2026-10-29. Test fixture only.
-- No taxonomy rules or regex literals were edited.
CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  WITH s AS (
    SELECT btrim(regexp_replace(lower(coalesce(p_subcategory,'')), '[^a-z0-9]+', ' ', 'g')) AS n
  )
  SELECT CASE
    -- Gift cards would otherwise hit the 'cards? → art' rule; they are not products.
    WHEN n ~ '\y(gift ?cards?|giftcards?|gutscheine?)\y'                              THEN 'other'
    WHEN n ~ '\y(anal|analplugs?|buttplugs?|plugs?|prostate|beads?|analkugel\w*|analkette\w*)\y' THEN 'anal_toys'
    WHEN n ~ '\y(dildos?|dongs?|realistics?|umschnall\w*|ovipositor\w*)\y'            THEN 'dildos'
    WHEN n ~ '\y(masturbators?|masturbatoren|strokers?|fleshlights?|vaginas?|onanism|sleeves?|liebespuppen?|sex ?dolls?)\y' THEN 'masturbators'
    WHEN n ~ '\y(vibrat\w*|vibes?|wands?|stimulators?|stimulatoren|rabbitvibrator\w*|vibro ?ei\w*|analvibrator\w*|paarvibrator\w*)\y' THEN 'vibrators'
    WHEN n ~ '\y(cock ?rings?|cockrings?|cock ?straps?|ball ?stretchers?|sheaths?|glans|foreskin|penisringe?|hodenringe?|penish lle\w*)\y' THEN 'cock_rings'
    WHEN n ~ '\y(chastity|cages?|cbt|keuschheit\w*)\y'                                THEN 'chastity'
    WHEN n ~ '\y(pumps?|enlarge|enlargement|penispumpen?|penisextender\w*)\y'         THEN 'pumps'
    WHEN n ~ '\y(lubes?|lubricants?|gleitgel|gleitmittel|massage\w*)\y'               THEN 'lubes'
    WHEN n ~ '\y(aromas?|aromen|poppers?)\y'                                          THEN 'poppers'
    WHEN n ~ '\y(condoms?|kondome|douches?|enema|safer sex|toy ?cleaners?|toycleaner\w*)\y' THEN 'safer_sex'
    WHEN n ~ '\y(sex ?toys?|sextoys?|strap ?ons?|strapon|better sex|nipples?|clamps?|sounds?|urethral|estim|nippelklemmen?|liebeskugel\w*|love ?eggs?|spiele)\y' THEN 'sex_toys'
    WHEN n ~ '\y(pups?|puppy|pet play|kitten|neko|pony)\y'                            THEN 'pup_play'
    WHEN n ~ '\y(bondage|restraints?|handcuffs?|cuffs?|leash\w*|ropes?|shibari|spreaders?|slings?|handschellen|fesseln?|sex ?furniture|sexm bel\w*)\y' THEN 'bondage'
    WHEN n ~ '\y(floggers?|paddles?|whips?|canes?|impact|punishment|spank|peitschen?|gerten?)\y' THEN 'impact_play'
    WHEN n ~ '\y(gags?|muzzles?|knebel)\y'                                            THEN 'gags'
    WHEN n ~ '\y(hoods?|blindfolds?|masks?|masken|kopfmasken?)\y'                     THEN 'hoods_masks'
    WHEN n ~ '\y(harness|harnesses)\y'                                                THEN 'harnesses'
    WHEN n ~ '\y(collars?|halsband|halsb\w*)\y'                                       THEN 'collars'
    WHEN n ~ '\y(fetish|leather|latex|rubber|neoprene|sleaze|bdsm|kink|dungeon|fetisch\w*|wetlook)\y' THEN 'fetish_gear'
    WHEN n ~ '\y(jocks?|jockstraps?)\y'                                               THEN 'jockstraps'
    WHEN n ~ '\y(thongs?|g ?strings?|tangas?)\y'                                      THEN 'thongs'
    WHEN n ~ '\y(lingerie|bras?|bralettes?|bustiers?|dessous|stockings?|hosiery|suspenders?|strapse\w*|basques?|corselettes?|bodystockings?|pasties)\y' THEN 'lingerie'
    -- Swim-QUALIFIED garment phrases must beat the underwear rule ('swim
    -- briefs'/'swim trunks' would otherwise hit briefs?/trunks?), but the
    -- generic swimwear rule stays AFTER underwear so the combined
    -- "Underwear and Swimwear" umbrella (1,737 rows) keeps resolving to
    -- underwear exactly as v1 did, and "Bikini String Thong" panties keep
    -- resolving via the earlier thongs rule.
    WHEN n ~ '\y(swim ?(briefs?|trunks?|shorts?|suits?))\y'                           THEN 'swimwear'
    WHEN n ~ '\y(underwear|undies|briefs?|boxers?|binders?|trunks?|boxershorts?|unterhosen?|unterw\w*|long johns?)\y' THEN 'underwear'
    WHEN n ~ '\y(swim|swimwear|swimsuits?|speedos?|beachwear|bikinis?|badehosen?|bademode|sungas?|square cut)\y' THEN 'swimwear'
    -- Packers/STPs are trans intimacy gear — but only after the underwear rule,
    -- so "Packing Underwear" garments stay in underwear.
    WHEN n ~ '\y(packers?|stps?)\y'                                                   THEN 'sex_toys'
    WHEN n ~ '\y(jewelry|jewellery|necklaces?|bracelets?|earrings?|pendants?|rings?|chokers?|chains?|anklets?|brooch\w*|charms?|halskette\w*|schmuck|ohrringe?)\y' THEN 'jewelry'
    WHEN n ~ '\y(socks?|socken)\y'                                                    THEN 'socks'
    WHEN n ~ '\y(jackets?|coats?|hoodies?|sweaters?|sweatshirts?|jumpers?|knits?|knitwear|cardigans?|outwears?|outerwear|parkas?|jacken?)\y' THEN 'outerwear'
    WHEN n ~ '\y(jumpsuits?|onesies?|rompers?|bodysuits?|catsuits?)\y'                THEN 'bodywear'
    WHEN n ~ '\y(shoes?|boots?|sneakers?|footwear|trainers?|sandals?|slides?|flip ?flops?|zapatos?|botas?|botines?|sandalias?|schuhe)\y' THEN 'footwear'
    WHEN n ~ '\y(caps?|hats?|beanies?|snapbacks?|headwear)\y'                         THEN 'headwear'
    WHEN n ~ '\y(bottoms?|pants?|trousers?|shorts?|jeans?|denim|leggings?|joggers?|chinos?|skirts?|faldas?|hosen?|bermudas?)\y' THEN 'bottoms'
    WHEN n ~ '\y(tops?|t ?shirts?|tees?|tanks?|singlets?|shirts?|polos?|jerseys?|rugby|blouses?|vests?|camis?|camisoles?|racerbacks?|halter|maglia|maglie|camisetas?|blusas?)\y' THEN 'tops'
    WHEN n ~ '\y(accessor\w*|accessoires?|bags?|backpacks?|wallets?|belts?|ties?|bandanas?|armbands?|scarf|scarves|gloves?|sunglass\w*|patch\w*|flags?|pins?|badges?|keychains?|lanyards?|stickers?|gafas|wigs?|per cke\w*|earplugs?)\y' THEN 'accessories'
    -- `dress(es)?`, not `dresses?` — see the header. This arm MUST stay above
    -- the art arm below, or "Print Slip Dress" goes back to matching `prints?`.
    WHEN n ~ '\y(apparel|clothing|clothes|garments?|menswear|womenswear|wear|fashion|sportswear|loungewear|sports?|uniforms?|suits?|dress(es)?|robes?|chaps|abbigliamento|ropa|kleidung|activewear|cycling)\y' THEN 'apparel'
    -- `documentar(y|ies)`, not `documentaries?`.
    WHEN n ~ '\y(films?|movies?|dvds?|blu ?rays?|cinema|documentar(y|ies)|filme)\y'   THEN 'film'
    WHEN n ~ '\y(books?|magazines?|zines?|comics?|novels?|ebooks?|buch|romane?)\y'    THEN 'books'
    WHEN n ~ '\y(calendars?|kalender)\y'                                              THEN 'calendars'
    WHEN n ~ '\y(art|arts|prints?|posters?|paintings?|photography|illustrations?|artwork|cards?|postcards?|polaroids?|stationery|notebooks?|journals?|sketchbooks?|kunstdruck\w*)\y' THEN 'art'
    WHEN n ~ '\y(candles?|kerzen?|mugs?|tassen?|towels?|blankets?|decken?|pillows?|cushions?|kissen|coasters?|magnets?|ornaments?|incense|vases?|home ?decor|homewares?|home ?goods|hand ?fans?|fans?|aprons?|sch rzen?)\y' THEN 'home_goods'
    WHEN n ~ '\y(hygiene|skincare|skin care|grooming|cosmetics?|makeup|make up|mascaras?|soaps?|shampoos?|deodorants?|fragrances?|perfumes?|cologne|lotions?|beard|shave|shaving|razors?|toothbrush|care|wash|parfums?|parfum\w*|pheromon\w*|duschgel|seifen?|cremes?|stimulanzien|nahrungserg\w*|supplements?|vitamins?|verz gerungs\w*|peniscreme\w*|k rperlotion\w*|lipgloss|lippenstift\w*)\y' THEN 'grooming'
    WHEN n ~ '\y(mental health|therapy|coaching|coach|training|events?|planning|consultation|services?|booking|sessions?|workshops?)\y' THEN 'services'
    ELSE 'other'
  END
  FROM s;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_fine(p_subcategory text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  WITH s AS (
    SELECT public.marketplace_subcategory_group(p_subcategory, p_title) AS g,
           btrim(regexp_replace(lower(coalesce(p_subcategory,'') || ' ' || coalesce(p_title,'')), '[^a-z0-9]+', ' ', 'g')) AS n
  )
  SELECT CASE
    -- apparel/tops
    WHEN g = 'tops' AND n ~ '\y(t ?shirts?|tees?)\y'                                THEN 't_shirts'
    WHEN g = 'tops' AND n ~ '\y(tanks?|singlets?|racerbacks?|camis?|camisoles?)\y'  THEN 'tanks'
    WHEN g = 'tops' AND n ~ '\y(crop ?tops?|halter)\y'                              THEN 'crop_tops'
    WHEN g = 'tops' AND n ~ '\y(polos?|jerseys?|rugby)\y'                           THEN 'jerseys_polos'
    WHEN g = 'tops' AND n ~ '\y(shirts?|blouses?|blusas?)\y'                        THEN 'shirts_blouses'
    -- apparel/bottoms
    WHEN g = 'bottoms' AND n ~ '\y(jeans?|denim)\y'                                 THEN 'jeans'
    WHEN g = 'bottoms' AND n ~ '\y(shorts?|bermudas?)\y'                            THEN 'shorts'
    WHEN g = 'bottoms' AND n ~ '\y(leggings?|joggers?|sweatpants?)\y'               THEN 'leggings_joggers'
    WHEN g = 'bottoms' AND n ~ '\y(skirts?|faldas?)\y'                              THEN 'skirts'
    -- apparel/outerwear
    WHEN g = 'outerwear' AND n ~ '\y(hoodies?|sweatshirts?)\y'                      THEN 'hoodies'
    WHEN g = 'outerwear' AND n ~ '\y(sweaters?|jumpers?|knits?|knitwear|cardigans?)\y' THEN 'sweaters'
    WHEN g = 'outerwear' AND n ~ '\y(jackets?|coats?|parkas?|jacken?)\y'            THEN 'jackets'
    -- apparel/accessories
    WHEN g = 'accessories' AND n ~ '\y(bags?|backpacks?|totes?|wallets?)\y'         THEN 'bags'
    WHEN g = 'accessories' AND n ~ '\y(pins?|badges?|brooch\w*)\y'                  THEN 'pins_badges'
    WHEN g = 'accessories' AND n ~ '\y(patch\w*|stickers?)\y'                       THEN 'patches_stickers'
    WHEN g = 'accessories' AND n ~ '\y(flags?|banners?)\y'                          THEN 'flags'
    WHEN g = 'accessories' AND n ~ '\y(belts?)\y'                                   THEN 'belts'
    WHEN g = 'accessories' AND n ~ '\y(caps?|hats?|beanies?)\y'                     THEN 'hats'
    WHEN g = 'accessories' AND n ~ '\y(gloves?|scarf|scarves|bandanas?|ties?)\y'    THEN 'scarves_gloves'
    WHEN g = 'accessories' AND n ~ '\y(keychains?|lanyards?|keyrings?)\y'           THEN 'keychains'
    WHEN g = 'accessories' AND n ~ '\y(sunglass\w*|gafas)\y'                        THEN 'sunglasses'
    WHEN g = 'accessories' AND n ~ '\y(wigs?|per cke\w*)\y'                         THEN 'wigs'
    -- swimwear
    WHEN g = 'swimwear' AND n ~ '\y(bikinis?)\y'                                    THEN 'bikinis'
    WHEN g = 'swimwear' AND n ~ '\y(swim ?briefs?|square cut|sungas?|speedos?)\y'   THEN 'swim_briefs'
    WHEN g = 'swimwear' AND n ~ '\y(swim ?(trunks?|shorts?)|boardshorts?)\y'        THEN 'swim_trunks'
    WHEN g = 'swimwear' AND n ~ '\y(one ?piece|swimsuits?)\y'                       THEN 'one_piece'
    -- jewelry
    WHEN g = 'jewelry' AND n ~ '\y(earrings?|ohrringe?)\y'                          THEN 'earrings'
    WHEN g = 'jewelry' AND n ~ '\y(necklaces?|pendants?|chains?|chokers?|halskette\w*)\y' THEN 'necklaces'
    WHEN g = 'jewelry' AND n ~ '\y(bracelets?|anklets?|armb nder?)\y'               THEN 'bracelets'
    WHEN g = 'jewelry' AND n ~ '\y(rings?)\y'                                       THEN 'rings'
    -- underwear
    WHEN g = 'underwear' AND n ~ '\y(binders?)\y'                                   THEN 'binders'
    WHEN g = 'underwear' AND n ~ '\y(packing|packers?)\y'                           THEN 'packing_underwear'
    WHEN g = 'underwear' AND n ~ '\y(bras?|bralettes?|bustiers?)\y'                 THEN 'bras'
    WHEN g = 'underwear' AND n ~ '\y(briefs?)\y'                                    THEN 'briefs'
    WHEN g = 'underwear' AND n ~ '\y(boxers?|trunks?|boxershorts?)\y'               THEN 'boxers_trunks'
    -- books (titles rarely carry genre words — 6% measured; genre-* tags do the rest)
    WHEN g = 'books' AND n ~ '\y(comics?|graphic novels?|manga)\y'                  THEN 'comics'
    WHEN g = 'books' AND n ~ '\y(zines?|magazines?)\y'                              THEN 'zines_magazines'
    WHEN g = 'books' AND n ~ '\y(poetry|poems?|gedichte?|lyrik)\y'                  THEN 'poetry'
    WHEN g = 'books' AND n ~ '\y(memoirs?|memoiren|biograph\w*|autobiograph\w*)\y'  THEN 'memoir'
    WHEN g = 'books' AND n ~ '\y(kids?|children\w*|young adult|\mya\M|kinderbuch\w*|jugendbuch\w*)\y' THEN 'kids_ya'
    WHEN g = 'books' AND n ~ '\y(sachbuch\w*|essays?|nonfiction|non fiction)\y'     THEN 'nonfiction'
    WHEN g = 'books' AND n ~ '\y(novels?|fiction|romane?)\y'                        THEN 'fiction'
    -- art
    WHEN g = 'art' AND n ~ '\y(prints?|posters?|kunstdruck\w*)\y'                   THEN 'prints_posters'
    WHEN g = 'art' AND n ~ '\y(cards?|postcards?|stationery|notebooks?|journals?)\y' THEN 'cards_stationery'
    WHEN g = 'art' AND n ~ '\y(photograph\w*|polaroids?)\y'                         THEN 'photography'
    -- hygiene/grooming
    WHEN g = 'grooming' AND n ~ '\y(fragrances?|perfumes?|cologne|parfum\w*|pheromon\w*)\y' THEN 'fragrance'
    WHEN g = 'grooming' AND n ~ '\y(soaps?|shampoos?|duschgel|seifen?|body ?wash|bath)\y' THEN 'soap_bath'
    WHEN g = 'grooming' AND n ~ '\y(beard|shave|shaving|razors?)\y'                 THEN 'shave_beard'
    WHEN g = 'grooming' AND n ~ '\y(skincare|skin care|lotions?|cremes?|moisturi\w*|k rperlotion\w*)\y' THEN 'skincare'
    -- NEW 2026-10-03. Measured in group `grooming`: aphrodisiacs 99.
    -- `edible_massage` is thin here BY CONSTRUCTION and that is recorded rather
    -- than hidden: the group ladder sends anything matching `massage\w*` to
    -- `lubes` before grooming is ever reached, so massage candles do not arrive
    -- in this group. The bucket exists for the edible/body-paint half.
    WHEN g = 'grooming' AND n ~ '\y(aphrodisiac\w*|libido|potenz\w*|stimulanzien|arousal)\y' THEN 'aphrodisiacs'
    WHEN g = 'grooming' AND n ~ '\y(edible|body ?chocolate|essbar\w*|k rperfarben?)\y' THEN 'edible_massage'
    -- intimacy/sex_toys
    WHEN g = 'sex_toys' AND n ~ '\y(strap ?ons?|strapon|umschnall\w*)\y'            THEN 'strap_ons'
    WHEN g = 'sex_toys' AND n ~ '\y(packers?|stps?)\y'                              THEN 'packers_stp'
    WHEN g = 'sex_toys' AND n ~ '\y(nipples?|clamps?|nippelklemmen?)\y'             THEN 'nipple_play'
    WHEN g = 'sex_toys' AND n ~ '\y(estim|e stim|electro\w*)\y'                     THEN 'estim'
    WHEN g = 'sex_toys' AND n ~ '\y(sounds?|urethral)\y'                            THEN 'sounding'
    WHEN g = 'sex_toys' AND n ~ '\y(kegel|liebeskugel\w*|love ?eggs?)\y'            THEN 'kegel'
    WHEN g = 'sex_toys' AND n ~ '\y(machines?)\y'                                   THEN 'sex_machines'
    WHEN g = 'sex_toys' AND n ~ '\y(dolls?|torsos?|puppen?)\y'                      THEN 'dolls'
    -- NEW 2026-10-03. Measured: tongue_oral 67, couples_dp 8.
    WHEN g = 'sex_toys' AND n ~ '\y(tongues?|zungen\w*|lick\w*|oral ?sex|blow ?jobs?)\y' THEN 'tongue_oral'
    WHEN g = 'sex_toys' AND n ~ '\y(couples?|paar\w*|double penetration|dp ?toys?)\y' THEN 'couples_dp'
    -- intimacy/anal_toys
    WHEN g = 'anal_toys' AND n ~ '\y(butt ?plugs?|buttplugs?|analplugs?|plugs?)\y'  THEN 'butt_plugs'
    WHEN g = 'anal_toys' AND n ~ '\y(beads?|analkette\w*|analkugel\w*)\y'           THEN 'anal_beads'
    WHEN g = 'anal_toys' AND n ~ '\y(prostate|prostata)\y'                          THEN 'prostate'
    -- NEW 2026-10-03. Measured: dilators 39, anal_hooks 17. Both sit AFTER
    -- `butt_plugs`, so a "training plug" stays a butt plug — it is one.
    WHEN g = 'anal_toys' AND n ~ '\y(dilators?|dilation|dehn\w*)\y'                 THEN 'dilators'
    WHEN g = 'anal_toys' AND n ~ '\y(anal ?hooks?|analhaken\w*|hooks?)\y'           THEN 'anal_hooks'
    -- intimacy/dildos
    WHEN g = 'dildos' AND n ~ '\y(fantasy|dragon|knot\w*|ovipositor\w*|tentacle\w*)\y' THEN 'fantasy_dildos'
    WHEN g = 'dildos' AND n ~ '\y(realistic\w*)\y'                                  THEN 'realistic_dildos'
    WHEN g = 'dildos' AND n ~ '\y(double|doppel\w*)\y'                              THEN 'double_dildos'
    -- intimacy/vibrators
    WHEN g = 'vibrators' AND n ~ '\y(wands?)\y'                                     THEN 'wands'
    WHEN g = 'vibrators' AND n ~ '\y(rabbits?)\y'                                   THEN 'rabbits'
    WHEN g = 'vibrators' AND n ~ '\y(eggs?|vibro ?ei\w*|liebesei\w*)\y'             THEN 'egg_vibrators'
    WHEN g = 'vibrators' AND n ~ '\y(bullets?)\y'                                   THEN 'bullets'
    -- NEW 2026-10-03. Measured: air_pulse 53, thrusting 77, g_spot 257,
    -- clit_stimulators 109, wearable_vibes 86, app_controlled 165. 2,008
    -- vibrators carried NO fine bucket before these.
    WHEN g = 'vibrators' AND n ~ '\y(air ?pulse|airwave|air wave|sonic|suction|druckwellen\w*|klitoris ?sauger)\y' THEN 'air_pulse'
    WHEN g = 'vibrators' AND n ~ '\y(thrust\w*|pulsators?)\y'                       THEN 'thrusting'
    WHEN g = 'vibrators' AND n ~ '\y(g ?spots?|g ?punkt\w*)\y'                      THEN 'g_spot'
    WHEN g = 'vibrators' AND n ~ '\y(clit\w*|klitoris\w*|butterfly|pocket ?rocket)\y' THEN 'clit_stimulators'
    WHEN g = 'vibrators' AND n ~ '\y(panty|panties|wearable|slipvibrator\w*)\y'     THEN 'wearable_vibes'
    WHEN g = 'vibrators' AND n ~ '\y(app ?control\w*|remote ?control\w*|bluetooth|smart ?toys?|fernbedienung\w*)\y' THEN 'app_controlled'
    -- NEW 2026-10-03. intimacy/cock_rings — measured: penis_sleeves 76. Note
    -- the GROUP ladder sends a bare "sleeve" to `masturbators`, so this only
    -- fires where the subcategory already resolved cock_rings (Penisringe +
    -- a sleeve/girth title). That is correct, not a miss.
    WHEN g = 'cock_rings' AND n ~ '\y(sleeves?|sheaths?|penish lle\w*|girth)\y'     THEN 'penis_sleeves'
    -- NEW 2026-10-03. intimacy/safer_sex — measured: douching_enemas 65.
    WHEN g = 'safer_sex' AND n ~ '\y(douches?|enema|intimduschen?|analduschen?|klistier\w*)\y' THEN 'douching_enemas'
    -- NEW 2026-10-03. bdsm_fetish/impact_play — measured: cbt 7. Deliberately
    -- does NOT list `ball ?stretch\w*`: the GROUP ladder sends those to
    -- `cock_rings` and that is the right home for a stretcher.
    WHEN g = 'impact_play' AND n ~ '\y(cbt|humblers?|ball ?crush\w*|figging|parachutes?)\y' THEN 'cbt'
    -- bdsm_fetish/bondage
    WHEN g = 'bondage' AND n ~ '\y(ropes?|shibari|seile?)\y'                        THEN 'rope'
    WHEN g = 'bondage' AND n ~ '\y(cuffs?|handcuffs?|restraints?|handschellen|fesseln?)\y' THEN 'cuffs_restraints'
    WHEN g = 'bondage' AND n ~ '\y(spreaders?|spreizstange\w*)\y'                   THEN 'spreader_bars'
    WHEN g = 'bondage' AND n ~ '\y(slings?|swings?|sex ?furniture|sexm bel\w*)\y'   THEN 'slings_furniture'
    -- bdsm_fetish/fetish_gear
    WHEN g = 'fetish_gear' AND n ~ '\y(latex)\y'                                    THEN 'latex'
    WHEN g = 'fetish_gear' AND n ~ '\y(leather|leder\w*)\y'                         THEN 'leather'
    WHEN g = 'fetish_gear' AND n ~ '\y(rubber|neoprene|wetlook|pvc)\y'              THEN 'rubber_neoprene'
    WHEN g = 'fetish_gear' AND n ~ '\y(uniforms?|police|military|sailor)\y'         THEN 'uniforms'
    ELSE NULL
  END
  FROM s;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(coalesce(p_title,'')) ~ '\m(packing|packer|stp) (strap|pouch)\M'
      AND lower(coalesce(p_title,'')) !~ '\m(kit|included|with)\M|\+' THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\mftm packer( with panty)?\M' THEN 'accessories'
    WHEN lower(coalesce(p_title,'')) ~ '\m(sex oil|stimulating (sex )?(oil|gel)|silicone shots?)\M' THEN 'lubricants'
    WHEN lower(coalesce(p_title,'')) ~ '\m(energy booster|dietary supplement|creatine supplement|cleanliness supplement)\M|\m[0-9]+ capsules?\M'
      THEN 'grooming'
    WHEN lower(coalesce(p_title,'')) ~ '\m(socks?|stockings?)\M'
      AND lower(coalesce(p_subcategory,'')) ~ '(apparel|accessor|ropa|calcetines|menswear)'
      THEN 'apparel'
    WHEN lower(coalesce(p_title,'')||' '||coalesce(p_subcategory,'')) ~
      '(nipple.{0,32}(plier|torture|clamp|forcep|suction)|tit torture|nipsuck|pincer nipple)'
      THEN 'sex_toys'
    WHEN lower(coalesce(p_title,'')) ~ '\mthumb cuffs?\M' THEN 'bondage'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cuff ring|ring cuff)\M' THEN 'jewelry'
    WHEN lower(coalesce(p_title,'')) ~ '\m(wrap |wrist |bicep |ruff )?cuffs?\M'
      AND lower(coalesce(p_subcategory,'')) ~ '(menswear|apparel|accessor|jewel)'
      AND lower(coalesce(p_title,'')) !~ '(spreader|restraint|bondage|bdsm|lockable|torture|nipple|ankle)'
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
    WHEN lower(coalesce(p_title,'')) ~ '\m(restraints?|manacles?|shackles?|handcuffs?)\M' THEN 'bondage'
    WHEN lower(coalesce(p_title,'')) ~ '\m(harness|harnesses)\M' THEN 'harnesses'
    WHEN lower(coalesce(p_title,'')) ~ '\m(menstrual cup)\M' THEN 'grooming'
    WHEN lower(coalesce(p_title,'')) ~ '\m(jocks?|jockstraps?|briefs|boxers|thong|lingerie|underwear)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title,'')) ~ '\m(necklace|earrings?|bracelet|pendant|ring)\M' THEN 'jewelry'
    WHEN lower(coalesce(p_title,'')) ~ '\m(books?|novels?|memoirs?|antholog(y|ies)|paperbacks?|hardcovers?)\M' THEN 'books'
    ELSE public.marketplace_subcategory_group_v3(p_subcategory,p_title)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group_v3(p_subcategory text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'auth', 'storage'
AS $function$
  SELECT coalesce(
    nullif(public.marketplace_subcategory_group(p_subcategory), 'other'),
    nullif(public.marketplace_subcategory_group(p_title), 'other'),
    'other'
  );
$function$;
