-- Marketplace classifier: fifteen toy fine buckets (2026-10-03 glossary pass).
--
-- Source: a comparison of `subcategory_group`/`subcategory_fine` against two
-- published sex-toy glossaries (letstalksex.net, playblue.ie). Of ~210 terms,
-- ~165 already resolve onto an existing category (Fleshlight -> masturbators,
-- Ben Wa -> kegel, Hitachi -> wands, Pegger -> strap_ons) and ~30 are not
-- categories at all: BRANDS (Bad Dragon, Tenga), MATERIALS (silicone, TPE,
-- cyberskin — already carried by the `mat-*` attribute tags), and AUDIENCE
-- LABELS ("Sex Toys For Women", "Heterosexual Toys", "Lesbian Toys"), which are
-- the gendered framing this codebase has repeatedly repaired OUT of the
-- glossary and are deliberately NOT created here.
--
-- What is left is fifteen product classes with no home. Every one was measured
-- against the live corpus before it was written, and the count is recorded
-- beside its rule — the discipline the v3 header sets ("Rules only exist where
-- the corpus proved volume"). Four of the original candidates came back at 1-8
-- rows; three were recovered by widening the vocabulary (tongue/oral 1 -> 67,
-- edible/massage 1 -> 45, anal hooks 5 -> 17) and the rest ship thin, which
-- has precedent (`uniforms` shipped at 2 listings, `dolls` at 6).
--
-- NO NEW GROUPS, so `marketplace_department()` is UNCHANGED — both overloads
-- of it. Everything here is the nullable third tier, which means a row that
-- matches nothing keeps NULL and the UI falls back to the group tile.
--
-- ORDERING IS LOAD-BEARING (first-hit-wins inside each group). The six new
-- vibrator rules go AFTER the four existing ones, so no row that already
-- resolves to wands/rabbits/eggs/bullets can move; and within the new six the
-- order is mechanism -> target -> wear -> feature. `app_controlled` is LAST on
-- purpose: it is a FEATURE, not a form factor, and a rechargeable app-driven
-- wand is a wand first. Likewise `klitoris ?sauger` sits in `air_pulse`, which
-- precedes `clit_stimulators`' broader `klitoris\w*`.
--
-- Client mirror: src/lib/marketplaceTaxonomy.ts (GROUP_FINE / FINE_LABELS).
-- Presentation (glyph + blurb): src/lib/marketplaceCategoryMeta.ts.

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

COMMENT ON FUNCTION public.marketplace_subcategory_fine(text, text) IS
  'Nullable third tier under subcategory_group. First-hit-wins inside each group; '
  'NULL means no finer evidence and the UI falls back to the group tile. '
  'Client mirror: src/lib/marketplaceTaxonomy.ts (GROUP_FINE/FINE_LABELS).';

-- ── Re-derive the rows this changes, and ONLY those ─────────────────────────
-- THE LIVE SYSTEM IS v4, NOT v3, AND THE DIFFERENCE MATTERS HERE. The derive
-- trigger `marketplace_listings_derive_taxonomy()` takes the GROUP from
-- `marketplace_resolve_taxonomy_group()` and the DEPARTMENT from
-- `marketplace_department_for_group()` — neither of which this file touches —
-- but it still takes the FINE tier from `marketplace_subcategory_fine()`, which
-- is why that function is the right and only lever for this change.
--
-- It re-derives when: INSERT, subcategory/title changed, taxonomy_v3_at IS
-- NULL, or taxonomy_version crosses 3->4. So NULLing the marker is what forces
-- a recompute, and because the trigger is BEFORE and stamps the marker back to
-- now(), a single UPDATE does the whole job in one pass.
--
-- `run_marketplace_taxonomy_backfill()` CANNOT do this. It selects
-- `WHERE taxonomy_v3_at IS NULL` and, measured on prod, that is 0 rows of
-- 70,801 — the job is a finished one-shot marker that has nonetheless run
-- every day this week, booking `success` each time while deriving nothing.
-- Its cron does 100/row/day against a 200 hard cap, so it could not carry
-- these 825 rows in under eight days even if it could see them.
--
-- THE PREDICATE IS A CHEAP TEXT PRE-FILTER, NOT A FUNCTION CALL. Scoping only
-- by group+NULL-fine selects 10,093 rows, and the trigger runs THREE regex
-- ladders per row; a full pass over that set timed out when measured directly.
-- Matching the combined new-rule vocabulary first cuts it to ~825, which is
-- the set that can actually change. Measured on prod before writing this:
-- g_spot 206, aphrodisiacs 96, app_controlled 87, clit_stimulators 76,
-- penis_sleeves 76, wearable_vibes 74, douching_enemas 65, thrusting 57,
-- air_pulse 49, dilators 16, couples_dp 8, cbt 7, tongue_oral 4, anal_hooks 3,
-- edible_massage 1.
--
-- Rows whose v4 group disagrees with the v3 core group have their fine forced
-- to NULL by the trigger and are unaffected; sampled at 1,500 rows, agreement
-- is 97.4-99.8% per group, so that costs 1-2% of the yield.
--
-- No `SET LOCAL statement_timeout` here: it is a NO-OP under `db push`, so it
-- would read as protection while providing none. The narrow predicate IS the
-- protection — holding the touched set near 825 rows is what makes this safe.
UPDATE public.marketplace_listings
SET taxonomy_v3_at = NULL
WHERE subcategory_fine IS NULL
  AND subcategory_group IN ('vibrators','anal_toys','cock_rings','sex_toys','safer_sex','impact_play','grooming')
  AND btrim(regexp_replace(lower(coalesce(subcategory,'') || ' ' || coalesce(title,'')), '[^a-z0-9]+', ' ', 'g'))
      ~ '\y(aphrodisiac\w*|libido|potenz\w*|stimulanzien|arousal|edible|body ?chocolate|essbar\w*|k rperfarben?|tongues?|zungen\w*|lick\w*|oral ?sex|blow ?jobs?|couples?|paar\w*|double penetration|dp ?toys?|dilators?|dilation|dehn\w*|anal ?hooks?|analhaken\w*|hooks?|air ?pulse|airwave|air wave|sonic|suction|druckwellen\w*|klitoris ?sauger|thrust\w*|pulsators?|g ?spots?|g ?punkt\w*|clit\w*|klitoris\w*|butterfly|pocket ?rocket|panty|panties|wearable|slipvibrator\w*|app ?control\w*|remote ?control\w*|bluetooth|smart ?toys?|fernbedienung\w*|sleeves?|sheaths?|penish lle\w*|girth|douches?|enema|intimduschen?|analduschen?|klistier\w*|cbt|humblers?|ball ?crush\w*|figging|parachutes?)\y';

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Asserts the REACHED STATE, not the number of rows this file changed: the
-- function is CREATE OR REPLACE, so a re-run and a concurrent better fix both
-- have to leave these fifteen reachable. Soft on preconditions (nothing above
-- aborts on existing data), hard here.
DO $verify$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO v_missing FROM unnest(ARRAY[
    'air_pulse','thrusting','g_spot','clit_stimulators','wearable_vibes','app_controlled',
    'dilators','anal_hooks','penis_sleeves','tongue_oral','couples_dp','cbt',
    'douching_enemas','aphrodisiacs','edible_massage'
  ]) AS x
  -- COMMENTS ARE STRIPPED BEFORE THE SEARCH, and that is not a formality here.
  -- `pg_get_functiondef()` returns the body INCLUDING its own comments, and
  -- this function's comments NAME every bucket in the list above ("Measured:
  -- air_pulse 53, thrusting 77, g_spot 257…"). Searching the raw definition is
  -- therefore the silently-GREEN failure: it would pass against a ladder whose
  -- rules had been deleted, so long as the prose describing them survived.
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'marketplace_subcategory_fine'
      AND regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
          LIKE '%''' || x || '''%'
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'fine buckets missing from the installed classifier: %', v_missing;
  END IF;

  -- Each new bucket must actually be REACHABLE, not merely present as a string
  -- in the body. A rule placed after a broader sibling is dead code, and the
  -- string check above cannot see that.
  -- NOTE on the dilator case: the probe subcategory is 'Anal Dilators', NOT
  -- 'Analplugs'. The first draft used the latter and this block correctly
  -- REFUSED the migration — `butt_plugs` matches `analplugs?` and fires first,
  -- which is the right answer for a row that calls itself a plug. The rule is
  -- fine; the assertion was wrong. Caught by dry-running this block on prod.
  IF public.marketplace_subcategory_fine('Vibrators', 'G-Spot Vibrator') IS DISTINCT FROM 'g_spot'
     OR public.marketplace_subcategory_fine('Vibrators', 'Air Pulse Stimulator') IS DISTINCT FROM 'air_pulse'
     OR public.marketplace_subcategory_fine('Vibrators', 'Wand Massager') IS DISTINCT FROM 'wands'
     OR public.marketplace_subcategory_fine('Anal Dilators', 'Glass Dilator Set') IS DISTINCT FROM 'dilators'
     OR public.marketplace_subcategory_fine('Anal Hooks', 'Steel Anal Hook') IS DISTINCT FROM 'anal_hooks'
     OR public.marketplace_subcategory_fine('Condoms', 'Anal Douche') IS DISTINCT FROM 'douching_enemas'
  THEN
    RAISE EXCEPTION 'a new fine rule is unreachable — check ladder order';
  END IF;

  -- And the existing tier must be undisturbed: a "training plug" is a butt
  -- plug, not a dilator, and a ball stretcher stays in cock_rings.
  IF public.marketplace_subcategory_fine('Analplugs', 'Training Plug Set') IS DISTINCT FROM 'butt_plugs'
     OR public.marketplace_subcategory_group('Ball Stretchers') IS DISTINCT FROM 'cock_rings'
  THEN
    RAISE EXCEPTION 'an existing classification moved — regression in the ladder';
  END IF;

  -- The re-derive must have LANDED, not merely run. Advisory floor, not the
  -- measured 825: the corpus moves between authoring and apply, and a hard
  -- equality here would abort `db push` on main — and take every migration
  -- queued behind it — because a merchant sync added or retired listings.
  -- Zero, though, means the UPDATE matched nothing and the whole file is
  -- decorative, which is the failure worth refusing.
  IF (SELECT count(*) FROM public.marketplace_listings
      WHERE subcategory_fine IN ('g_spot','app_controlled','clit_stimulators','air_pulse',
                                 'wearable_vibes','thrusting','penis_sleeves','douching_enemas',
                                 'aphrodisiacs','dilators')) < 100 THEN
    RAISE EXCEPTION 'the re-derive produced almost nothing — predicate or ladder order is wrong';
  END IF;

  RAISE NOTICE 'marketplace toy fine buckets: classifier replaced and rows re-derived';
END $verify$;
