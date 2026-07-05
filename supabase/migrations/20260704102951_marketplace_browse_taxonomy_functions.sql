-- Reconstructed from live supabase_migrations.schema_migrations.statements
-- (version 20260704102951, applied 2026-07-04 via MCP apply_migration without
-- a committed file — this file heals the repo<->history drift that blocked
-- CI db push; content is byte-faithful to what already ran, CI will skip it).
CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT btrim(regexp_replace(lower(coalesce(p_subcategory,'')), '[^a-z0-9]+', ' ', 'g')) AS n
  )
  SELECT CASE
    WHEN n ~ '\y(anal|analplugs?|buttplugs?|plugs?|prostate|beads?)\y'              THEN 'anal_toys'
    WHEN n ~ '\y(dildos?|dongs?|realistics?)\y'                                     THEN 'dildos'
    WHEN n ~ '\y(masturbators?|masturbatoren|strokers?|fleshlights?|vaginas?|onanism|sleeves?)\y' THEN 'masturbators'
    WHEN n ~ '\y(vibrators?|vibes?|wands?)\y'                                       THEN 'vibrators'
    WHEN n ~ '\y(cock ?rings?|cockrings?|cock ?straps?|ball ?stretchers?|sheaths?|glans|foreskin)\y' THEN 'cock_rings'
    WHEN n ~ '\y(chastity|cages?|cbt)\y'                                            THEN 'chastity'
    WHEN n ~ '\y(pumps?|enlarge|enlargement)\y'                                     THEN 'pumps'
    WHEN n ~ '\y(lubes?|lubricants?|gleitgel|gleitmittel)\y'                        THEN 'lubes'
    WHEN n ~ '\y(aromas?|poppers?)\y'                                               THEN 'poppers'
    WHEN n ~ '\y(condoms?|kondome|douches?|enema|safer sex)\y'                       THEN 'safer_sex'
    WHEN n ~ '\y(sex ?toys?|sextoys?|strap ?ons?|strapon|better sex|nipples?|clamps?|sounds?|urethral|estim)\y' THEN 'sex_toys'
    WHEN n ~ '\y(pups?|puppy|pet play|kitten|neko|pony)\y'                          THEN 'pup_play'
    WHEN n ~ '\y(bondage|restraints?|handcuffs?|cuffs?|leash\w*|ropes?|shibari|spreaders?|slings?)\y' THEN 'bondage'
    WHEN n ~ '\y(floggers?|paddles?|whips?|canes?|impact|punishment|spank)\y'       THEN 'impact_play'
    WHEN n ~ '\y(gags?|muzzles?)\y'                                                 THEN 'gags'
    WHEN n ~ '\y(hoods?|blindfolds?|masks?)\y'                                      THEN 'hoods_masks'
    WHEN n ~ '\y(harness|harnesses)\y'                                             THEN 'harnesses'
    WHEN n ~ '\y(collars?)\y'                                                       THEN 'collars'
    WHEN n ~ '\y(fetish|leather|latex|rubber|neoprene|sleaze|bdsm|kink|dungeon)\y'  THEN 'fetish_gear'
    WHEN n ~ '\y(jocks?|jockstraps?)\y'                                             THEN 'jockstraps'
    WHEN n ~ '\y(thongs?|g ?strings?)\y'                                            THEN 'thongs'
    WHEN n ~ '\y(lingerie)\y'                                                       THEN 'lingerie'
    WHEN n ~ '\y(underwear|undies|briefs?|boxers?)\y'                               THEN 'underwear'
    WHEN n ~ '\y(swim|swimwear|swimsuits?|speedos?|swim ?trunks?|beachwear)\y'      THEN 'swimwear'
    WHEN n ~ '\y(jewelry|jewellery|necklaces?|bracelets?|earrings?|pendants?|rings?|chokers?|chains?|anklets?|brooch\w*)\y' THEN 'jewelry'
    WHEN n ~ '\y(socks?)\y'                                                         THEN 'socks'
    WHEN n ~ '\y(jackets?|coats?|hoodies?|sweaters?|sweatshirts?|jumpers?|knits?|knitwear|cardigans?|outwears?|outerwear|parkas?)\y' THEN 'outerwear'
    WHEN n ~ '\y(jumpsuits?|onesies?|rompers?|bodysuits?|catsuits?)\y'              THEN 'bodywear'
    WHEN n ~ '\y(shoes?|boots?|sneakers?|footwear|trainers?)\y'                     THEN 'footwear'
    WHEN n ~ '\y(caps?|hats?|beanies?|snapbacks?|headwear)\y'                       THEN 'headwear'
    WHEN n ~ '\y(bottoms?|pants?|trousers?|shorts?|jeans?|denim|leggings?|joggers?|chinos?)\y' THEN 'bottoms'
    WHEN n ~ '\y(tops?|t ?shirts?|tees?|tanks?|singlets?|shirts?|polos?|jerseys?|rugby|blouses?|vests?)\y' THEN 'tops'
    WHEN n ~ '\y(accessor\w*|accessoires?|bags?|backpacks?|wallets?|belts?|ties?|bandanas?|armbands?|scarf|scarves|gloves?|sunglass\w*|patch\w*|flags?|pins?|badges?|keychains?|lanyards?|stickers?)\y' THEN 'accessories'
    WHEN n ~ '\y(apparel|clothing|clothes|garments?|menswear|womenswear|wear|fashion|sportswear|loungewear|sports?|uniforms?|suits?|dresses?|robes?|chaps)\y' THEN 'apparel'
    WHEN n ~ '\y(books?|magazines?|zines?|comics?|novels?|ebooks?)\y'               THEN 'books'
    WHEN n ~ '\y(art|arts|prints?|posters?|paintings?|photography|illustrations?|artwork)\y' THEN 'art'
    WHEN n ~ '\y(hygiene|skincare|skin care|grooming|cosmetics?|makeup|make up|mascaras?|soaps?|shampoos?|deodorants?|fragrances?|perfumes?|cologne|lotions?|beard|shave|shaving|razors?|toothbrush|care|wash)\y' THEN 'grooming'
    WHEN n ~ '\y(mental health|therapy|coaching|coach|training|events?|planning|consultation|services?|booking|sessions?|workshops?)\y' THEN 'services'
    ELSE 'other'
  END
  FROM s;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_department(p_subcategory text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
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
    WHEN 'books'       THEN 'books_art' WHEN 'art'         THEN 'books_art'
    WHEN 'grooming'    THEN 'hygiene'
    WHEN 'services'    THEN 'services'
    ELSE 'other'
  END;
$$;
