-- ============================================================================
-- "Washington DC" is a RENAME of one city, so it is an alias; the two other
-- abbreviations in this cohort are not, and that is why only one ships here
-- ----------------------------------------------------------------------------
-- 596 live events carry a city name and no `city_id`. 342 of them name a city
-- ABSENT from `cities`, and the cheap-looking fix is a `city_aliases` row so
-- 99991790719640's alias arm picks them up on the next nightly run.
--
-- MEASURED FIRST, AND THE OBVIOUS PREMISE WAS WRONG. The cohort was expected to
-- be accent variants (Cancun -> Cancún, Curacao -> Curaçao). It is not: run
-- against `public.city_name_key` — which unaccents, and whose controls pass
-- (city_name_key('München') = city_name_key('Munchen') is TRUE, and the same for
-- the cedilla) — the unaccented match count is ZERO for every name in the
-- cohort. There is no accented twin to alias TO. `cities` holds no Whistler (33
-- events), no Lansing (31), no Aspen (17), no Port Charlotte (15), no Boca Raton
-- (9). Those are MISSING CITIES, and an alias cannot invent a target.
--
-- A SYSTEMATIC SWEEP, NOT AN EYEBALL. Eleven abbreviation rewrites were applied
-- to every name in the cohort (St./Ste./Mt./Ft. expansion, N./S./E./W.
-- expansion, " DC" -> ", D.C.", and stripping a trailing "/…" or "(…)") and
-- joined back against `cities` unaccented. The sweep returns exactly THREE names
-- whose target exists — Washington DC (5 events), St Louis (2), St Paul (2) —
-- so this class has no long tail and is closed at three.
--
-- ── ONLY ONE OF THE THREE IS SHIPPABLE, AND THE OTHER TWO ARE A DIFFERENT BUG ─
-- `St Louis` and `St Paul` each resolve to a city that is ONE OF A DUPLICATE
-- PAIR, so an alias would pick a side of a defect rather than name a city:
--
--   Saint Louis / Missouri   slug saint-louis   16 events   4 venues   Q38022
--   St. Louis   / Missouri   slug st-louis     203 events  29 venues   no qid
--     -> 4.07 km apart, populations 301,578 and 297,645, and THE ALIAS TABLE
--        ALREADY ASSERTS THEY ARE THE SAME PLACE IN BOTH DIRECTIONS:
--        saint-louis carries alias "St. Louis"[en] and st-louis carries
--        alias "Saint Louis"[it].
--
--   Saint Paul  / Minnesota  slug saint-paul     1 event   11 venues
--   St. Paul    / Minnesota  slug tmp-cd646368…  0 events   0 venues
--     -> 3.41 km apart; the second is a `tmp-` shell.
--
-- Both pairs sit far inside the <10 km gate `place_pair_corroboration` uses, so
-- they are duplicates rather than same-name collisions. Aliasing `St Louis` to
-- `saint-louis` would send events to the 16-event row while the 203-event row
-- stays canonical, entrenching a content split instead of repairing it. The fix
-- there is `merge_cities`, whose DIRECTION is an editorial call with URL
-- consequences (the identifier is on one row and the content on the other), so
-- it is deliberately NOT made here. Those 4 events stay unlinked and visible.
--
-- ── WHY "Washington DC" IS SAFE WHERE THOSE ARE NOT ──────────────────────────
-- `Washington, D.C. / District of Columbia` is a SINGLE canonical row carrying
-- 1,091 events and 124 venues, with no duplicate and no `tmp-` twin, so there is
-- no side to pick. And the alias is a genuine orthographic rename of that one
-- city, not a territory standing in for its capital.
--
-- THE ISLAND-FOR-CAPITAL CASES ARE REFUSED FOR A REASON WORTH RECORDING. The
-- same sweep offers Curacao -> Willemstad, Puerto Rico -> San Juan and Mallorca
-- -> Palma, and all three are accepted by the alias arm's guard. They are still
-- refused, because an alias is a STANDING rule: it would link EVERY future
-- island-wide event to the capital. That is relocating an event, not renaming a
-- city. Read per row, the evidence does not even support it uniformly — Puerto
-- Rico's two events do name San Juan ("Winter Pride Fest San Juan 2026 … in San
-- Juan, Puerto Rico") and Mallorca's Pride names Palma, but BOTH Curaçao events
-- name no city at all ("partying on a Caribbean Island").
--
-- AND `Rio` IS REFUSED BY OUR OWN GUARD, WHICH IS THE GUARD WORKING. Three
-- events say "Rio" (BR) and `Rio de Janeiro` exists — but 99991790719640's rule
-- is that an alias may rename a city and may not DE-QUALIFY one, and the target
-- is exactly the alias plus a trailing space. Verified live rather than reasoned
-- about: with the row inserted, `city_by_alias` returns NULL for Rio while
-- returning the right city for every other candidate. This is the documented
-- cost of that rule (it also refuses Washington -> "Washington, D.C.", which is
-- why THIS alias is on the distinct string "Washington DC" and does not reopen
-- that decision), and it is cheaper than the Springfield class it prevents.
--
-- ── MECHANICS ───────────────────────────────────────────────────────────────
-- `alias_key` is `GENERATED ALWAYS AS city_canonical_key(alias)`, so it must NOT
-- be inserted — doing so raises 428C9. That was established by dry-running the
-- file rather than by reading `information_schema.columns`, whose default
-- projection shows a generated column as merely nullable with no default and so
-- reads exactly like a plain column nobody populates; `is_generated` has to be
-- selected explicitly. Uniqueness is `(city_id, alias_key)`, which is a legal
-- conflict target on a generated column. The key values the postconditions below
-- assert were computed through that same function rather than assumed
-- ('Washington DC' -> `washington dc`, 'St Louis' -> `st louis`), because a key
-- literal the function can never produce makes those checks vacuous.
-- `locale` is 'en' — the abbreviation is English orthography, not a translation.
--
-- No events are linked here. The alias arm of the nightly `event_city_link` cron
-- does that, so guards A and B still apply to every row it touches.
--
-- ── AND THE ALIAS ARM ALREADY HAD A COHORT IT COULD NOT REACH ───────────────
-- Probing how many events the arm would resolve after this alias returned 31,
-- not the 5 "Washington DC" rows, so the number was decomposed rather than
-- reported. The other 26 are `Cancun` (MX), which resolves through an alias that
-- ALREADY EXISTS to `Cancún / Quintana Roo` — and all 26 are unlinked purely
-- because they are STAMPED. This is 99991790719640's stale-stamp class again,
-- one arm over: the stamps date 2026-08-01 (25) and 2026-08-23 (1), carry
-- `linked:false` with no `matched_on`, and predate the alias arm itself, which
-- shipped 2026-09-28. The cron has been correctly skipping rows it can now
-- resolve.
--
-- An earlier note in this session claimed `cities` holds no Cancún. That was
-- wrong, and the error is worth naming: the query that produced it excluded
-- alias-resolvable names by design, so Cancun could never appear in its output.
-- Cancún exists, the alias exists, and only the stamp was in the way.
--
-- The 26 are unambiguous: country MX, exactly one Cancún on earth, and the
-- titles say so in two languages ("I LOVE CANCUN PRIDE PARADE", "GAYFEST EN
-- CANCUN", "Mexico Expo LGBT, Cancun 2012", parties at the real Oasis complex).
-- The release is a stamp DELETION, pinned by the expected region, so the shipped
-- guarded runner does the linking and guards A and B still decide.
-- ============================================================================

INSERT INTO public.city_aliases (city_id, alias, locale)
SELECT c.id, 'Washington DC', 'en'
FROM public.cities c
JOIN public.countries co ON co.id = c.country_id
WHERE co.code = 'US'
  AND c.duplicate_of_id IS NULL
  AND c.name = 'Washington, D.C.'
  AND c.region_name = 'District of Columbia'
ON CONFLICT (city_id, alias_key) DO NOTHING;

-- Release the stale stamps the alias arm can now resolve. Deletes the stamp ONLY;
-- the nightly runner links, so guards A and B still decide. Each name is pinned
-- to the exact city the alias must resolve to, so if `cities` moves under this
-- the row simply does not match and is not released.
--
-- Washington DC needs this as much as Cancun does: all 5 rows were stamped
-- 2026-09-29 by a force-run that happened BEFORE the alias above existed, so the
-- alias on its own would only have helped events arriving in future.
WITH verified(city, cc, target_name, target_region) AS (VALUES
  ('Cancun',        'MX', 'Cancún',           'Quintana Roo'),
  ('Washington DC', 'US', 'Washington, D.C.', 'District of Columbia')
)
UPDATE public.events e
SET enrichment_status = e.enrichment_status - 'event_city_link'
FROM verified v
JOIN public.countries co ON co.code = v.cc
WHERE e.duplicate_of_id IS NULL
  AND e.city_id IS NULL
  AND e.country_id = co.id
  AND btrim(e.city) = v.city
  AND coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link'
  AND e.enrichment_status->'event_city_link'->>'blocked' IS NULL
  AND EXISTS (
    SELECT 1 FROM public.cities c
     WHERE c.id = public.city_by_alias(e.country_id, e.city)
       AND c.name = v.target_name
       AND c.region_name = v.target_region);

DO $verify$
DECLARE
  v_us   uuid;
  v_city uuid;
  v_name text;
  v_n    int;
BEGIN
  SELECT id INTO v_us FROM public.countries WHERE code = 'US';

  -- P1: exactly one alias row, on the canonical DC city.
  SELECT count(*) INTO v_n
  FROM public.city_aliases a
  JOIN public.cities c ON c.id = a.city_id
  WHERE a.alias_key = 'washington dc'
    AND c.name = 'Washington, D.C.';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1: expected exactly 1 "washington dc" alias on Washington, D.C.; found %', v_n;
  END IF;

  -- P2: the alias arm RESOLVES it. This is the behavioural check — a row that
  -- the de-qualification guard refuses would satisfy P1 and link nothing.
  v_city := public.city_by_alias(v_us, 'Washington DC');
  SELECT c.name INTO v_name FROM public.cities c WHERE c.id = v_city;
  IF v_name IS DISTINCT FROM 'Washington, D.C.' THEN
    RAISE EXCEPTION 'P2: city_by_alias(US, ''Washington DC'') resolved to % (expected Washington, D.C.)',
      coalesce(v_name, '<null>');
  END IF;

  -- P3: the two duplicate-pair abbreviations are deliberately NOT aliased, so a
  -- later pass cannot read this file as precedent for picking a side.
  SELECT count(*) INTO v_n
  FROM public.city_aliases
  WHERE alias_key IN ('st louis', 'st paul');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P3: % alias(es) for st louis/st paul exist; those pairs need merge_cities, not an alias', v_n;
  END IF;

  -- P4: and the island-for-capital aliases must stay absent.
  SELECT count(*) INTO v_n
  FROM public.city_aliases
  WHERE alias_key IN ('curacao', 'puerto rico', 'mallorca');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P4: % island-for-capital alias(es) exist; an alias may rename a city, not relocate an event', v_n;
  END IF;

  -- P5: Rio stays refused by the de-qualification rule. Asserted as a CONTROL on
  -- that rule still being live, not as a wish.
  IF public.city_by_alias((SELECT id FROM public.countries WHERE code = 'BR'), 'Rio') IS NOT NULL THEN
    RAISE EXCEPTION 'P5: Rio resolved — the de-qualification rule is not working';
  END IF;

  -- P6: no released name still carries a stamp, for EITHER cohort.
  SELECT count(*) INTO v_n
  FROM public.events e
  JOIN public.countries co ON co.id = e.country_id
  WHERE e.duplicate_of_id IS NULL
    AND e.city_id IS NULL
    AND (co.code, btrim(e.city)) IN (('MX', 'Cancun'), ('US', 'Washington DC'))
    AND coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P6: % event(s) still carry a stale stamp', v_n;
  END IF;

  -- P7: the release is a DELETION, not a link. Writing city_id here would bypass
  -- guards A and B and reimplement the runner.
  --
  -- Keyed on city_id, NOT on the city TEXT: `derive_entity_geo_address` is a
  -- BEFORE trigger that rewrites `events.city` FROM `city_id`, so once a row is
  -- linked its text becomes 'Cancún' and any predicate matching the pre-link
  -- spelling silently reports zero. That cost a wrong "0 linked" reading during
  -- the dry run of this very file.
  SELECT count(*) INTO v_n
  FROM public.events e
  JOIN public.countries co ON co.id = e.country_id
  WHERE e.duplicate_of_id IS NULL
    AND (co.code, btrim(e.city)) IN (('MX', 'Cancun'), ('US', 'Washington DC'))
    AND e.city_id IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'P7: % event(s) were linked by this migration; the runner must do that', v_n;
  END IF;

  RAISE NOTICE 'city_alias_washington_dc: 1 alias resolving to Washington, D.C.; Cancun + Washington DC stamps released; duplicate-pair and island aliases absent';
END $verify$;
