-- Non-venue flagging, round 2 -- German legal forms, bare street names, party names
--
-- 20260810120400 shipped five rules (pride/parade/festival, English org forms, junk
-- names, queer-village names, city names). Auditing Zürich showed the recall: of roughly
-- 60 rows in that one city that are not venues, the existing rules reach 4.
--
-- The gap is not subtle. The rules are English-only, so a German corpus slips straight
-- past them, and they have no notion of a bare street name or a recurring party.
--
-- The bigger finding: one of v1's own rules has never matched anything
-- -------------------------------------------------------------------
-- The deployed function's org pattern reads `e\.v\.` where the migration file in this
-- repo reads `e\.?v\.?`. The `?` quantifiers are absent in the database. That single
-- difference makes the branch DEAD, not merely stricter: the alternation is followed by
-- `\M`, and `\M` needs a word character to its left. With the trailing `\.` mandatory the
-- match always ends on a dot, so `\M` can never be satisfied and there is nothing to
-- backtrack to. With `\.?` optional the engine falls back to `e.v` and `\M` holds.
-- Verified rather than reasoned:
--
--   'csd nordwest e.v.' ~ '\m(...|e\.v\.|...)\M'   -> false
--   'csd nordwest e.v.' ~ '\m(...|e\.?v\.?|...)\M' -> true
--
-- So `venue_nonvenue_flag` has run nightly since 2026-08-10, reported `success` every
-- night, and returns `flagged: 0` today with 148 rows sitting in front of it that match
-- its own intended rule -- every German registered association in the corpus. The
-- German rule below adds 10 rows; REPAIRING THIS ONE adds 148.
--
-- Two things worth keeping from that. A pattern is not a rule until something has been
-- observed to match it -- a regex that silently matches nothing looks exactly like a
-- clean corpus. And this is drift in a FUNCTION BODY, which no migration-version check
-- can see: `schema_migrations` agreed with the repo file the whole time. The repair here
-- is a plain CREATE OR REPLACE from the file, so the two converge again.
--
-- The pattern also gains `\s?` (`e. V.` with a space is common in German registry
-- names and failed under BOTH spellings).
--
-- Rules ADDED (each measured against the whole corpus before shipping)
-- -------------------------------------------------------------------
--   looks_like_organization  Verein | Stiftung | Genossenschaft            10 rows
--                            (beyond the 148 the repaired e.V. pattern recovers)
--       German parity with the existing association|society|foundation rule; `e.V.`
--       was already covered. Sampled 8/8 organisations. Shipped WITHOUT a second
--       signal, matching how the English rule is already scoped.
--
--   looks_like_event         party | afterhour | afterparty                39 rows
--       Sampled 10/10 events ("Emergency-Party", "Scream Party", "Qocirca Queer
--       Party"). `night`, `nacht` and `show` were deliberately NOT included: "Night
--       Club" and "Showbar" are venue TYPES, so those words would flag the corpus's
--       own vocabulary.
--
--   looks_like_street        strasse|straße|gasse|allee|weg|platz SUFFIX,   18 rows
--                            plus no website AND no description
--       Note 20260910153000 already measured a street KEYWORD rule at ~50% precision
--       and rejected it -- it flagged "Lighthouse Bar & Grill". This is a different
--       rule: the token must END the name, and two corroborating absences are
--       required. A real venue named for its street ("Schaafenstraße") almost always
--       carries one of the two. Even so it stays flag-only, and it should: the sample
--       contains Nollendorfplatz and Schaafenstraße, which are famous gay districts
--       and probably belong in `queer_villages` rather than being archived -- exactly
--       the judgement a person should make and a regex cannot.
--
-- Rules MEASURED AND REJECTED (recorded so they are not re-attempted)
-- ------------------------------------------------------------------
--   trailing GmbH / AG                    38 rows, real FPs
--       A legal form is not proof: "FKK Campingplatz am Rätzsee - Campingzeit am
--       Rätzsee GmbH" IS a venue, and so is "Kulturhaus Karlstorbahnhof e.V.".
--       Adding the usual corroboration (no address AND no website) left TWO rows,
--       one of them that same campsite. The rule is all false positive and no yield.
--
--   ALL-CAPS multi-word name              80 rows, ~75% FP
--       "EL PANCHO", "RAMEN DO", "GITE LE CLOS DU VERGER", "CLUBE RIO'S FOR MAN" are
--       venues. Spanish- and Portuguese-language sources simply write venue names in
--       capitals, so this rule mostly detects the source language.
--
--   street SUFFIX with no corroboration   23 rows
--       Picks up "SAL Lindaplatz" (a real theatre) and "Strandbad Mythenquai" (a real
--       lido). `quai` is dropped from the token list entirely for the same reason --
--       Zürich alone has several real -quai places.
--
--   address shared with another venue     476 rows, overwhelmingly FP
--       Shared addresses are malls, complexes and sloppy geocoding, not evidence.
--       Flags "Federal Delicatessen", "Mrs Robinson", "Ricos Lanches".
--
--   ...tightened to: no website AND no phone AND no description AND no images,
--   AND the address demonstrably belongs to a DIFFERENT venue that has contact
--   details                                56 rows, still ~80% FP
--       This one looked good on its first sample (San Francisco walking tours,
--       Turkish estate agents, an LGBT hotline) and was very nearly shipped. A second
--       random sample killed it: "Cine Hoyts Plaza Egaña", "Fierros el Jaguar",
--       "Galpón Victor Manuel", "Play Cuernavaca" -- real Latin American venues
--       sharing a plaza address. Two samples, opposite verdicts; the first was luck.
--
-- What this does NOT reach, and cannot
-- -----------------------------------
-- The repair plus the three new rules bring the queue to 316 pending flags corpus-wide
-- and 9 in Zürich, against ~60 Zürich rows that are not venues. The remainder are bare event titles -- "DRAG RACE
-- GERMANY", "NIGHT PRIDE", "2000-er", "FRIYEAH!", "BERLIN CALLING", "Behave wird 13".
-- They carry a plausible address (their host club's), a city link and a category, so
-- structurally they are indistinguishable from a venue. Every rule tested that caught
-- them also caught real venues at 50% or worse. There is no safe automatic rule for
-- that class; it needs eyes, which is what the review queue is for.

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_venue_nonvenue_flag(p_batch integer DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- 300: trg_search_documents_venue re-indexes on every UPDATE (disk-constrained DB).
  v_batch   int := GREATEST(1, LEAST(coalesce(p_batch, 300), 300));
  v_flagged int := 0;
BEGIN
  PERFORM public.assert_admin_or_internal();

  -- The reason is computed ONCE in `scored` and the batch is taken after filtering on
  -- it. v1 spelled every predicate twice -- once in a CASE and once again in a WHERE
  -- that had to mirror it exactly -- so a rule could silently be added to one and not
  -- the other. It also applied LIMIT before that filter, which meant a nightly run
  -- could examine 300 rows and flag a handful.
  WITH scored AS (
    SELECT v.id,
      CASE
        WHEN lower(btrim(v.name)) ~ '\m(pride|parade|festival|mardi gras|circuit party)\M'
          THEN 'looks_like_event'
        -- NEW: recurring parties. Not `night`/`nacht`/`show` -- those are venue types.
        WHEN lower(btrim(v.name)) ~ '\m(party|after ?hour|after ?party)\M'
          THEN 'looks_like_event'
        WHEN lower(btrim(v.name)) ~ '\m(foundation|association|e\.?\s?v\.?|society|non-?profit|charity|coalition|alliance)\M'
          THEN 'looks_like_organization'
        -- NEW: German legal forms, parity with the English rule above.
        WHEN lower(btrim(v.name)) ~ '\m(verein|stiftung|genossenschaft)\M'
          THEN 'looks_like_organization'
        WHEN lower(btrim(v.name)) ~ '^[0-9]+$' OR length(btrim(v.name)) <= 2
          THEN 'junk_name'
        -- The place-name rules carry their corroboration INSIDE the branch. In v1 it
        -- lived in the WHERE clause instead, so folding the two into one expression
        -- silently dropped it -- measured, that flags 92 city-name rows that DO have
        -- an address or a website, which is the "Paradise" / "Douglas" / "Chico"
        -- false positive the rule was written to avoid.
        WHEN EXISTS (SELECT 1 FROM public.queer_villages qv
                     WHERE lower(qv.name) = lower(btrim(v.name)))
             AND coalesce(btrim(v.address), '') = ''
             AND v.website IS NULL
             AND coalesce(btrim(v.description), '') = ''
          THEN 'matches_queer_village_name'
        WHEN EXISTS (SELECT 1 FROM public.cities c
                     WHERE lower(c.name) = lower(btrim(v.name)))
             AND coalesce(btrim(v.address), '') = ''
             AND v.website IS NULL
             AND coalesce(btrim(v.description), '') = ''
          THEN 'matches_city_name'
        -- NEW: a bare street or square. Suffix-anchored, and corroborated by two
        -- absences -- a venue named after its street nearly always has one of them.
        WHEN lower(btrim(v.name)) ~ '(strasse|straße|gasse|allee|weg|platz)\s*$'
             AND v.website IS NULL
             AND coalesce(btrim(v.description), '') = ''
          THEN 'looks_like_street'
      END AS reason
    FROM public.venues v
    WHERE v.duplicate_of_id IS NULL
      AND v.category = 'other'
      AND NOT (coalesce(v.enrichment_status, '{}'::jsonb) ? 'nonvenue_candidate')
  ),
  cand AS (
    SELECT id, reason FROM scored
    WHERE reason IS NOT NULL
    ORDER BY id
    LIMIT v_batch
  )
  UPDATE public.venues v
  SET needs_attention = true,
      enrichment_status = jsonb_set(
        coalesce(v.enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
        jsonb_build_object('reason', c.reason, 'status', 'review', 'source', 'name_heuristic'))
  FROM cand c
  WHERE v.id = c.id;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;
  RETURN jsonb_build_object('flagged', v_flagged);
END;
$$;

COMMENT ON FUNCTION public.run_venue_nonvenue_flag(integer) IS
  'Flags probable non-venues (events / organisations / bare street names / place names '
  '/ junk) sitting in venues for human review. Flag-only and reversible: clears by '
  'removing the enrichment_status.nonvenue_candidate key. Place-name and street rules '
  'require corroboration (no website, no description) because a name match alone is '
  'not proof. Rules measured and rejected -- trailing GmbH/AG, ALL-CAPS names, shared '
  'addresses -- are documented in 20260914130100 so they are not re-attempted.';

REVOKE ALL ON FUNCTION public.run_venue_nonvenue_flag(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_venue_nonvenue_flag(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Let the queue be worked one city at a time
-- ---------------------------------------------------------------------------
-- The queue holds ~1,300 non-venue candidates with no way to scope them, so
-- "clean up Zürich" meant paging through the world. Reviewing by city is also the
-- only way a reviewer has the local knowledge to decide: whether "Nollendorfplatz"
-- is a street, a district or a bar is not a question anyone can answer globally.
--
-- The filter is on the city TEXT, not city_id, for two reasons. There is no city picker
-- component in the admin tree, so a uuid parameter would have had no caller -- and a
-- parameter with no caller is not a feature. And the text is what makes the dirty rows
-- findable: this corpus contains city values like
-- 'Zurich (CH) (https://www.notion.so/Zurich-CH-78f9...)' and 'Canton of Zurich', which
-- carry no city_id at all and are precisely the rows a cleanup wants to see.
--
-- DROP before CREATE: adding a defaulted parameter to an existing signature produces
-- an OVERLOAD, not a replacement, and the frontend's 3-named-argument call would then
-- match both candidates and fail 42725 (same trap as cluster_news_backfill).
DROP FUNCTION IF EXISTS public.venue_review_candidates(text, integer, integer);

CREATE FUNCTION public.venue_review_candidates(
  p_kind    text    DEFAULT 'category',   -- 'category' | 'nonvenue'
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0,
  p_city    text    DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  name         text,
  city         text,
  country      text,
  website      text,
  description  text,
  suggested    text,
  confidence   numeric,
  reason       text,
  source_tags  text,
  data_source  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    v.id,
    v.name,
    v.city,
    v.country,
    v.website,
    left(coalesce(v.description, ''), 300),
    CASE WHEN p_kind = 'category'
         THEN v.enrichment_status->'category_backfill'->>'suggested' END,
    CASE WHEN p_kind = 'category'
         THEN (v.enrichment_status->'category_backfill'->>'confidence')::numeric END,
    CASE WHEN p_kind = 'nonvenue'
         THEN v.enrichment_status->'nonvenue_candidate'->>'reason' END,
    (SELECT string_agg(DISTINCT s.payload->'raw'->>'tags', ' · ')
       FROM public.venue_sources s WHERE s.venue_id = v.id),
    v.data_source
  FROM public.venues v
  WHERE v.duplicate_of_id IS NULL
    AND v.closed_at IS NULL
    AND coalesce(v.review_status, '') <> 'archived'
    AND (coalesce(btrim(p_city), '') = '' OR v.city ILIKE '%' || btrim(p_city) || '%')
    AND (
      (p_kind = 'category'
        AND v.enrichment_status->'category_backfill'->>'status' = 'review')
      OR
      (p_kind = 'nonvenue'
        AND v.enrichment_status->'nonvenue_candidate'->>'status' = 'review')
    )
  ORDER BY
    CASE WHEN p_kind = 'category'
         THEN (v.enrichment_status->'category_backfill'->>'confidence')::numeric
         END DESC NULLS LAST,
    v.id
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
$$;

ALTER FUNCTION public.venue_review_candidates(text, integer, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.venue_review_candidates(text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_review_candidates(text, integer, integer, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.venue_review_candidates(text, integer, integer, text) IS
  'Review worklist for venue category suggestions and non-venue candidates. '
  'p_city is a substring match on the venue city TEXT -- reviewing by city is what '
  'makes the local judgement possible (street vs district vs bar), and the text '
  'match also reaches rows whose city never resolved to a city_id.';
