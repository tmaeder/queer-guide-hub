-- Marketplace classifier: two optional-plural tokens that cannot match their
-- own singular, and the re-derive of the rows they misfiled.
--
-- THE BUG. The apparel arm of marketplace_subcategory_group() spells the
-- garment token `dresses?`. In POSIX regex that is `dresse` + optional `s`, so
-- it matches "dresse" and "dresses" and NEVER the singular "dress". A subcategory
-- of "Pride > Print > Print Slip Dress" therefore falls PAST the apparel arm and
-- lands on the later art arm, which matches on `prints?`.
--
-- Measured on prod before this migration:
--   marketplace_subcategory_group('Pride > Print > Print Slip Dress') -> 'art'
--   289 ACTIVE listings whose subcategory contains "dress" sat in
--   subcategory_group='art', department='books_art' — satin and print slip
--   dresses published under Books & Art. 4 more ("Cheongsam Mini Dress") in
--   'other'.
--
-- Every `[a-z]+es\?` token in the ladder was audited. All 40 are correct because
-- their singular ends in `e` (badge, beanie, blouse, robe, tee, …) so `Xe` + `s?`
-- covers both forms. Exactly two are broken:
--   `dresses?`       -> 289 rows affected. The reason this file exists.
--   `documentaries?` -> never matches "documentary"; 0 rows affected today.
-- The second is fixed here anyway, not for its zero rows but because the guard
-- test asserts the BUG CLASS ("no `Xes?` whose stem cannot match its singular")
-- and leaving one known offender would require an exception list — which is
-- exactly how the next `dresses?` gets waved through.
--
-- GROUP CHOICE: 'apparel', and it is not a compromise. The apparel arm already
-- sits ABOVE the art arm, so repairing the token moves these rows without
-- reordering a 50-arm ladder. marketplace_department() already maps
-- 'apparel' -> 'apparel'. And `dress(es)?` is a strict superset of `dresses?`
-- in practice — the only string it stops matching is the non-word "dresse" —
-- so this change can only ADD matches. Rows already on subcategory "Dresses"
-- resolve to apparel today and stay there: zero lateral moves.
--
-- NOT 'bodywear': that arm is one-piece stretch garments (jumpsuits, onesies,
-- rompers, bodysuits, catsuits), and routing dresses there would drag the
-- existing "Dresses" rows OUT of apparel — an unrequested second behaviour
-- change on rows nobody reported.
--
-- Client mirror: src/lib/marketplaceTaxonomy.ts. No mirror change is required
-- for this migration — 'apparel' is a pre-existing classifier group — though
-- the same PR adds it to DEPARTMENT_GROUPS/GROUP_LABELS, where it had been
-- missing since v3 (782 SFW listings that the browse index silently dropped).

-- Session scope, NOT `SET LOCAL`. `supabase db push` does not wrap a migration
-- file in an explicit transaction block, so `SET LOCAL` raises
-- `WARNING (25P01): SET LOCAL can only be used in transaction blocks` and the
-- value is never applied — a WARNING, so the migration continues and nothing
-- downstream reports the missing setting. Precedent for the bare form:
-- 00000000000000_baseline.sql:31 (`SET statement_timeout = 0`).
--
-- It is needed because the cluster default is 2min and the DO block below is
-- ONE top-level statement: the timeout is armed once when the block starts, so
-- batching inside it does NOT give each batch its own budget.
--
-- MEASURED on prod in a rolled-back transaction rather than inferred: 50 rows
-- re-derived in 27,119 ms = **542 ms/row**, so the ~297 affected rows are
-- roughly 161 s. (20260927130000 cites ~377 ms/row for the backfill RPC; this
-- path is slower, so sizing against that older figure would have put the run at
-- ~110 s and made 120 s look survivable. It is not.) 600 s leaves 3.7x headroom.
set statement_timeout = '600s';

-- ── The classifier, v3 body carried forward with exactly two tokens changed ──
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

-- The 2-arg overload, marketplace_subcategory_fine() and marketplace_department()
-- are deliberately NOT touched: all three delegate to the function above, so one
-- edit repairs every call site. That is the root-cause shape.

-- ── Re-derive the rows the broken token misfiled ─────────────────────────────
--
-- THE VERB IS `taxonomy_v3_at = NULL`, and the obvious alternative is a silent
-- no-op. marketplace_listings_derive_taxonomy() recomputes only when
--   TG_OP='INSERT' OR NEW.taxonomy_v3_at IS NULL
--   OR NEW.subcategory IS DISTINCT FROM OLD.subcategory
--   OR NEW.title IS DISTINCT FROM OLD.title
-- so the idiom run_marketplace_taxonomy_backfill() uses — `SET subcategory =
-- m.subcategory` — is dead now that the stamp is non-null on every row: the
-- self-assignment makes all four conditions false. It would fire the search
-- reindex trigger for nothing and derive NOTHING. Nulling the stamp is the one
-- form the trigger acts on, and it re-stamps now() in the SAME row version, so
-- the NULL never reaches disk and the backfill cron's work list stays empty.
--
-- SOFT ON PRECONDITIONS. The work set is "rows whose stored group disagrees
-- with the classifier", scoped by a cheap text prefilter — not a row count and
-- not a frozen id list. A row that appears, vanishes or is edited between
-- authoring and merge is handled, and re-running this migration is a no-op.
--
-- The prefilter is provably COMPLETE rather than merely convenient: the only
-- thing this migration changes is how the two stems `dress` and `documentar`
-- match, so any row whose classification can move must contain one of them in
-- its subcategory OR its title. Title is included because the 2-arg overload
-- falls back to the title whenever the subcategory resolves to 'other'.
--
-- No `status` filter: an inactive row keeps its wrong group otherwise, and
-- reactivation changes neither subcategory nor title, so the trigger would
-- never revisit it and the bug would resurface on the next reactivation.
do $repair$
declare
  v_n integer;
  v_total integer := 0;
begin
  loop
    update public.marketplace_listings m
       set taxonomy_v3_at = null          -- BEFORE trigger recomputes + re-stamps
     where m.id in (
       -- MATERIALIZED is load-bearing, not cosmetic. Without the optimisation
       -- barrier the planner may evaluate marketplace_subcategory_group()
       -- (default COST 100) across all ~62k rows before applying the cheap
       -- regex. Materialising the prefilter pins the classifier to ~600 calls.
       with candidate as materialized (
         select l.id, l.subcategory, l.title, l.subcategory_group
           from public.marketplace_listings l
          where l.subcategory ~* '(dress|documentar)'
             or l.title       ~* '(dress|documentar)'
       )
       select c.id
         from candidate c
        where c.subcategory_group
              is distinct from public.marketplace_subcategory_group(c.subcategory, c.title)
        limit 100
     );
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    -- Hard cap so a mis-specified predicate cannot loop the whole corpus under
    -- a 600s timeout. Measured scope is ~293 rows; widen only with a fresh
    -- measurement, never to make a run finish.
    exit when v_n = 0 or v_total >= 2000;
  end loop;
  raise notice 'marketplace dress/documentary re-derive: % row(s)', v_total;
end
$repair$;

-- ── Postconditions: HARD, and asserted positively ───────────────────────────
do $verify$
declare
  v_drift integer;
begin
  -- (a) FUNCTIONAL — the state this file exists to reach, asserted on the
  --     classifier itself so no amount of listing churn can empty it out.
  --     A count of repaired ROWS would be the brittle exact-match premise the
  --     repo forbids: marketplace listings turn over constantly.
  if public.marketplace_subcategory_group('Pride > Print > Print Slip Dress') <> 'apparel' then
    raise exception 'slip dress still misclassified: %',
      public.marketplace_subcategory_group('Pride > Print > Print Slip Dress');
  end if;
  if public.marketplace_subcategory_group('Satin Slip Dress') <> 'apparel' then
    raise exception 'satin slip dress still misclassified: %',
      public.marketplace_subcategory_group('Satin Slip Dress');
  end if;
  if public.marketplace_subcategory_group('Documentary') <> 'film' then
    raise exception 'documentary still misclassified: %',
      public.marketplace_subcategory_group('Documentary');
  end if;
  -- The superset claim from the header, asserted rather than trusted: the
  -- plural form must keep working, or this "fix" silently moves existing rows.
  if public.marketplace_subcategory_group('Dresses') <> 'apparel' then
    raise exception 'plural dresses regressed: %',
      public.marketplace_subcategory_group('Dresses');
  end if;

  -- (b) DATA — nothing left disagreeing with the now-correct classifier. The
  --     only way this fails is the 2000 cap being hit, which is a genuine
  --     surprise worth aborting on.
  select count(*) into v_drift
    from (
      with candidate as materialized (
        select l.subcategory, l.title, l.subcategory_group
          from public.marketplace_listings l
         where l.subcategory ~* '(dress|documentar)'
            or l.title       ~* '(dress|documentar)'
      )
      select 1
        from candidate c
       where c.subcategory_group
             is distinct from public.marketplace_subcategory_group(c.subcategory, c.title)
    ) d;
  if v_drift <> 0 then
    raise exception 'dress/documentary re-derive incomplete: % row(s) still drifted', v_drift;
  end if;
end
$verify$;

reset statement_timeout;
