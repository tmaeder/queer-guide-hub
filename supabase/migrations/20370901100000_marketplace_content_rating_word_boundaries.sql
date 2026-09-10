-- marketplace_content_rating(): word boundaries for the short tokens, and the
-- two vocabulary gaps that fix exposes.
--
-- THE DEFECT. The rank-4 alternation matched several short tokens as bare
-- SUBSTRINGS, so any word merely ENDING in the token's first characters
-- carried the whole product into `explicit` — i.e. hidden from every Safe Mode
-- reader. `g[- ]?spot` is the reported case: "Parking Spot", "Camping Spot",
-- "Testing Spot" all rate `explicit`, "Test Spot" does not. Measured on prod
-- 2026-08-23, the corpus carries **176 misrated active listings**, and the
-- reported token is the SMALLEST of the four:
--
--     e-?stim         152 rows   "estimated total length", "estimated
--                                shipping", German "bestimmt/abgestimmt",
--                                "testimonials", "underestimate"
--     g[- ]?spot        5 rows   parking/camping/testing spot, "spot clean"
--     strap[- ]?on      4 rows   "jockstrap only", "strap only pouch"
--     ball ?gag         2 rows   "mirrorball gag" (two Disco Daddy T-shirts)
--
-- The casualties are what makes this urgent: 58 queerlit.co.uk BOOKS ("Trans
-- Bodies, Trans Selves", "This Book is Gay", "The Teacher of Auschwitz"), a
-- dancesafe.org reagent test kit, dapperboi button-ups, a cycling kit reading
-- "Never Underestimate A Granny", condoms, and an LGBTQIA+ travel guide — all
-- invisible to the readers most likely to want Safe Mode on.
--
-- WHY EACH FIX IS SHAPED THE WAY IT IS. A blanket left boundary on every token
-- is WRONG for this corpus and was measured before being rejected: German
-- compounds are single words, so `\m` would drop "Silikonvibrator" (453
-- matches), "Klitorisstimulator" (220), "Lederhandschellen", "Doppeldildo",
-- "Analgleitmittel", "Seilbondage", "Kettenharness", "Powerwetlook" and
-- "Homoerotik". That is why the function has no boundaries today, and why the
-- fix is four tokens, not fifty.
--   * `\mg[- ]?spot` / `\mg[- ]?punkt` — left only. A right boundary would
--     drop the German compound "G-Punkt-Vibrator". g-punkt changes 0 rows
--     today (its 4 substring hits are already explicit via other vocabulary);
--     it is fixed as the same defect, in the same token pair.
--   * `\mstrap[- ]?ons?\M` — needs BOTH sides. Left alone still leaves the
--     prose "strap only pouch" (word-initial); right alone still leaves
--     "jockstrap only". A prose "strap on the shoulder" is unreachable in
--     between.
--   * `\me[- ]stim|\mestim\M` — a boundary pair, not a `\m`, because
--     "estimated" IS word-initial. `\mestim\M` keeps the 23 rows where the
--     bare word is the product ("Mystim eStim Rabbit Vibrator", "estim-Geräte"
--     — a trailing hyphen is a word end).
--   * `\mball ?gag` — left only; the sole substring hit is "mirrorball gag".
--
-- WHAT THE FIX UNMASKS, AND WHY THE VOCABULARY GROWS HERE TOO. Seven rows were
-- explicit ONLY by the e-stim accident and would otherwise land at `sfw` —
-- 4 kink3d chastity cages ("Viper/Cobra — No Bottom Crossbar", whose blurb
-- says "Estimated production time") and 3 rodeoh "Silicone Plug | Vault
-- Sample" anal plugs ("Estimated total length"). Shipping the boundary fix
-- alone would open a real Safe Mode hole, so two measured additions close it:
--   * subcategory slug `cage` -> rank 4. All 34 rows carrying it are
--     kink3d.com chastity cages and all 34 are already explicit, so this
--     raises nothing today and holds those 4 rows after the fix.
--   * `silicone plug` and `penis[- ]?extender` -> rank 4. Both only ever
--     RAISE a rating (11 and 9 rows respectively: Avant Kaleido/Twilight
--     plugs, PLUG IT Bud Tunnel, Satisfyer Booty Call, b-Vibe Butties, the
--     Jes-Extender line, Doc Johnson Merci). `silicone plug` cannot reach
--     "silicone ear plugs" — the two words are not adjacent there.
--   * `enema` -> `\menema`, whose only substring hit corpus-wide is the German
--     "daenemark" (Dänemark) on the Jes-Extender listing. Fixing it alone
--     would have dropped a penis extender from `adult` to `sfw`; paired with
--     `penis[- ]?extender` it lands at `explicit`, which is right.
--
-- NET on prod: 156 rows down (116 -> sfw, 32 -> adult, 8 -> suggestive) and
-- 20 up (10 sfw / 9 adult / 1 suggestive -> explicit), all 20 genuine toys.
--
-- RE-MEASURED 2026-09-10, before landing. The numbers above are from
-- 2026-08-23 and the catalogue has grown since; the shape held, the volume
-- did not. Against the live function today the new logic moves **237 rows**
-- (217 down from `explicit`, 20 up to it) — the 20 upgrades match the earlier
-- count exactly, the downgrades grew 156 -> 217. Spot-checked casualties are
-- still live and still `explicit` on prod: "Trans Bodies, Trans Selves",
-- "This Book is Gay", "The Teacher of Auschwitz" and four "Never Underestimate
-- A Granny" cycling kits, every one of them matching `estim` only inside
-- "Underestimate". This migration is the 2026-08-23 draft renumbered from
-- 20260926120000, which sorted below the applied ceiling and so could never
-- have run; its body is unchanged and was diffed against the deployed
-- function first, to confirm it still carries the adult_publications slugs
-- added by 20260802135219 and regresses nothing.
--
-- MEASURED AND DELIBERATELY NOT CHANGED: `\mfessel` has no right boundary and
-- so also matches German "fesselnd" (captivating) — 12 rows — but every one of
-- them is a bondage listing anyway, so it is not a live defect. `cock ?ring`
-- and `ball ?stretch` have the same missing-boundary shape but ZERO substring
-- hits in this corpus (no "peacock ring"); they are left alone rather than
-- "fixed" on speculation. `humbler` matches the English comparative in
-- principle; all 17 corpus hits are the BDSM device.

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
                      'pumps_and_enlargement','chastity','cage','bdsm_and_bondage','pup_and_pet_play')
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
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|\me[- ]stim|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt)'
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
  SELECT CASE (SELECT rank FROM ranked)
           WHEN 4 THEN 'explicit'
           WHEN 3 THEN 'adult'
           WHEN 2 THEN 'suggestive'
           ELSE 'sfw'
         END;
$function$;

-- ── Recompute ────────────────────────────────────────────────────────────────
-- `content_rating` is a STORED generated column, so the CREATE OR REPLACE
-- above changes nothing that is already written. The companion regen of
-- 20260822131224 did this with a full column drop/re-add (a ~134 MB table
-- rewrite); at 176 affected rows a targeted UPDATE is cheaper by orders of
-- magnitude AND fires the row triggers, which is what keeps search in sync
-- (below). The predicate compares the stored value against a fresh call of the
-- new function, so it selects exactly the rows that change and re-running the
-- statement is a no-op — the migration verifies itself.
--
-- TRAP, measured on this instance (PG 17.6): a stored generated column is
-- recomputed on UPDATE **only if the SET list names one of the expression's
-- own base columns**. `SET id = id` left the old value in place; `SET title =
-- title` refreshed it. So `SET updated_at = updated_at` here would run, report
-- 176 rows, and silently change nothing.
--
-- No trigger suppression: `ALTER TABLE ... DISABLE TRIGGER` needs an
-- AccessExclusive lock it loses to the */5 marketplace crons, and we WANT
-- trg_search_documents_marketplace to fire (it enqueues into
-- search_reindex_queue; the drain is delete-then-reindex, so both directions
-- of a rating flip settle within the minute). The other four triggers that
-- could fire are checked: the two image ones are `UPDATE OF images`,
-- marketplace_price_usd_trg is `UPDATE OF price, currency`,
-- auto_slug_from_title only fills an EMPTY slug, and sanitize_website_field
-- nulls a website on a blocked scraper domain — of which this corpus has
-- exactly 0 rows out of 60,853 with a website.
UPDATE public.marketplace_listings m
   SET title = m.title
 WHERE m.content_rating IS DISTINCT FROM
       public.marketplace_content_rating(m.subcategory, m.title, m.description);

-- ── Search reconcile ─────────────────────────────────────────────────────────
-- Belt-and-braces on top of the trigger path, and the only layer that would
-- still be correct if the UPDATE above were ever run with triggers suppressed.
-- search_documents_index_marketplace() admits sfw/suggestive only and never
-- DELETEs a row that has become ineligible, so the newly-explicit rows must be
-- removed explicitly; the newly-eligible ones are enqueued for the drain.
DELETE FROM public.search_documents sd
USING public.marketplace_listings m
WHERE sd.entity_type = 'marketplace' AND sd.entity_id = m.id
  AND coalesce(m.content_rating, 'sfw') NOT IN ('sfw', 'suggestive');

INSERT INTO public.search_reindex_queue (entity_type, entity_id)
SELECT 'marketplace', m.id
FROM public.marketplace_listings m
WHERE m.status = 'active'
  AND coalesce(m.content_rating, 'sfw') IN ('sfw', 'suggestive')
  AND NOT EXISTS (
    SELECT 1 FROM public.search_documents sd
    WHERE sd.entity_type = 'marketplace' AND sd.entity_id = m.id
  );
