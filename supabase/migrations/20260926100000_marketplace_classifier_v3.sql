-- Marketplace classifier v3 (2026-08-23 finer-categorisation program, PR 1).
--
-- Two changes, both measured against the live corpus first (queries + counts
-- in the PR description):
--
-- (1) A NEW third tier: marketplace_subcategory_fine(subcategory, title) —
--     a nullable fine bucket UNDER subcategory_group. NULL means "no finer
--     evidence", never 'other': the client falls back to the group tile and
--     fine-facet counts stay honest. Dry-run yields on the live corpus:
--     tops 90% fine (tanks 3,604 / t_shirts 2,225 / jerseys 1,135),
--     outerwear 97%, bottoms 75%, underwear 56% (briefs 1,406, binders 124,
--     packing_underwear 53 — gender-affirming garments are first-class fine
--     buckets and STAY in the underwear department, no rating change),
--     fetish_gear 59% (latex/leather/rubber), accessories 41%. Books resolve
--     only 6% from titles — book genre lives in descriptions and is covered
--     by the genre-* attribute tags (PR 3), not this tier.
--
-- (2) Residual-'other' vocabulary. v2 already took 'other' from 24% to 4.0%
--     (2,481 of 61,641 active); what remains is a long German/adult-niche
--     tail (census 2026-08-23): Masken/Kopfmaske -> hoods_masks,
--     Basques/Corselettes/Bodystocking/Pasties -> lingerie, Vibro-Ei/
--     Analvibrator -> vibrators, Liebespuppe -> masturbators, Ovipositor ->
--     dildos, Penishülle -> cock_rings, Gerte -> impact_play, Toy Cleaner ->
--     safer_sex, Verzögerungsspray/Peniscreme/Körperlotion/Lipgloss ->
--     grooming, Sunga/Square Cut -> swimwear, Bermudas -> bottoms,
--     Long Johns -> underwear, Perücke/wigs/earplugs -> accessories,
--     Aprons/Schürzen -> home_goods, Sex Furniture -> bondage.
--     NOTE on umlauts: the group normalizer strips [^a-z0-9] to spaces, so
--     'Perücke' arrives as 'per cke' — the German rules below deliberately
--     spell the post-normalization form (v2 precedent: unterw\w*, halsb\w*).
--
-- No new groups and no new departments in v3 — everything maps into the
-- existing 40-group vocabulary, so marketplace_department() is UNCHANGED.
-- The companion 20260926100100 regenerates the STORED columns (group +
-- department recompute; subcategory_fine + attributes columns added there).
-- Client mirror: src/lib/marketplaceTaxonomy.ts (GROUP_FINE / FINE_LABELS).

-- ── Rule engine v3 (1-arg form; the 2-arg overload from v2 delegates here) ───
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
    WHEN n ~ '\y(apparel|clothing|clothes|garments?|menswear|womenswear|wear|fashion|sportswear|loungewear|sports?|uniforms?|suits?|dresses?|robes?|chaps|abbigliamento|ropa|kleidung|activewear|cycling)\y' THEN 'apparel'
    WHEN n ~ '\y(films?|movies?|dvds?|blu ?rays?|cinema|documentaries?|filme)\y'      THEN 'film'
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

-- ── Fine tier: nullable third level under subcategory_group ──────────────────
-- Group-scoped regex ladders over the normalized subcategory+title text.
-- Rules only exist where the corpus proved volume (dry-run 2026-08-23); a
-- group with no ladder — or a row with no match — returns NULL, and the UI
-- treats NULL as "just the group". First-hit-wins inside each group.
CREATE OR REPLACE FUNCTION public.marketplace_subcategory_fine(p_subcategory text, p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
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
    -- intimacy/sex_toys
    WHEN g = 'sex_toys' AND n ~ '\y(strap ?ons?|strapon|umschnall\w*)\y'            THEN 'strap_ons'
    WHEN g = 'sex_toys' AND n ~ '\y(packers?|stps?)\y'                              THEN 'packers_stp'
    WHEN g = 'sex_toys' AND n ~ '\y(nipples?|clamps?|nippelklemmen?)\y'             THEN 'nipple_play'
    WHEN g = 'sex_toys' AND n ~ '\y(estim|e stim|electro\w*)\y'                     THEN 'estim'
    WHEN g = 'sex_toys' AND n ~ '\y(sounds?|urethral)\y'                            THEN 'sounding'
    WHEN g = 'sex_toys' AND n ~ '\y(kegel|liebeskugel\w*|love ?eggs?)\y'            THEN 'kegel'
    WHEN g = 'sex_toys' AND n ~ '\y(machines?)\y'                                   THEN 'sex_machines'
    WHEN g = 'sex_toys' AND n ~ '\y(dolls?|torsos?|puppen?)\y'                      THEN 'dolls'
    -- intimacy/anal_toys
    WHEN g = 'anal_toys' AND n ~ '\y(butt ?plugs?|buttplugs?|analplugs?|plugs?)\y'  THEN 'butt_plugs'
    WHEN g = 'anal_toys' AND n ~ '\y(beads?|analkette\w*|analkugel\w*)\y'           THEN 'anal_beads'
    WHEN g = 'anal_toys' AND n ~ '\y(prostate|prostata)\y'                          THEN 'prostate'
    -- intimacy/dildos
    WHEN g = 'dildos' AND n ~ '\y(fantasy|dragon|knot\w*|ovipositor\w*|tentacle\w*)\y' THEN 'fantasy_dildos'
    WHEN g = 'dildos' AND n ~ '\y(realistic\w*)\y'                                  THEN 'realistic_dildos'
    WHEN g = 'dildos' AND n ~ '\y(double|doppel\w*)\y'                              THEN 'double_dildos'
    -- intimacy/vibrators
    WHEN g = 'vibrators' AND n ~ '\y(wands?)\y'                                     THEN 'wands'
    WHEN g = 'vibrators' AND n ~ '\y(rabbits?)\y'                                   THEN 'rabbits'
    WHEN g = 'vibrators' AND n ~ '\y(eggs?|vibro ?ei\w*|liebesei\w*)\y'             THEN 'egg_vibrators'
    WHEN g = 'vibrators' AND n ~ '\y(bullets?)\y'                                   THEN 'bullets'
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

-- ── Helper for the generated sizes/colors arrays (20260926100100) ────────────
-- Must be IMMUTABLE (generated-column requirement); returns NULL-free text[]
-- from a jsonb array, NULL for anything that is not an array.
CREATE OR REPLACE FUNCTION public.jsonb_text_array(p jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN jsonb_typeof(p) = 'array'
    THEN (SELECT array_agg(x) FROM jsonb_array_elements_text(p) AS t(x) WHERE x IS NOT NULL)
    ELSE NULL
  END;
$function$;

-- The fine-tier count RPC lives in 20260926100100 — a LANGUAGE sql body is
-- parse-checked at CREATE, and subcategory_fine only exists after the regen.
