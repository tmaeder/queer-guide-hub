-- Zürich: structural location repairs
--
-- Three faults found while auditing the Zürich corpus. All three are wrong FKs or
-- fabricated coordinates -- not taxonomy, not duplicates. The ~60 rows in `venues`
-- that are not venues at all (party names, Vereine, street names, TomTom "Club"
-- false positives, Regenbogenhaus room fragments) are deliberately NOT touched here:
-- the established convention for that disposition is reversible soft-archival after
-- human review (archive_city_as_nonplace, archive_personality_as_nonperson,
-- decide_venue_nonvenue), and the review queue is a separate change.
--
-- Fault 1 -- Zürich CH content filed under Zurich, Kansas
-- ------------------------------------------------------
-- `cities` holds two Zurichs: Zürich CH (35d1d772, slug 'zuerich', pop 447,082) and
-- Zurich, Kansas (eafd0504, slug 'zurich', pop 5,675). The US row owns the
-- UNQUALIFIED slug, and it had collected one event and one venue.
--
-- The event ("BLOWN AWAY", 1a8fff21) carries coordinates 47.3744/8.5410 -- 500 m from
-- the Zürich CH centroid, 7,000 km from Kansas -- while country='US' and currency='USD'.
-- Its own LLM enrichment had already written the contradiction down verbatim:
--
--   "In the United States, where the event is not actually located, LGBTQ+ individuals
--    have a high level of legal protection [...] However, the event is actually located
--    in Switzerland"
--
-- plus extracted_address "Zurich, Switzerland" and extracted_venue_name "Komplex Klub".
-- The model detected the mismatch, published a safety note derived from the wrong
-- country anyway, and nothing downstream acted on it. That is the same failure class as
-- the 86 city safety notes retracted in 20260816112824: a derived field written once and
-- never revalidated against the input it was derived from silently outlives that input.
-- The note is retracted (preserved under enrichment_status.agentic.retracted) rather
-- than edited -- withdrawing a claim is safer than restating it.
--
-- The venue ("Long Island Eagle", 89d42756) came from spartacus with external_id
-- 'spartacus:long-island-eagle:' -- note the EMPTY trailing city segment. It has no
-- address, no coordinates and no website, and its name names Long Island, New York.
-- It is unlinked and flagged, NOT re-pointed at a New York city: there is no evidence
-- for which one, and a null city_id is recoverable where a wrong one is not.
--
-- Nulling `city` text is load-bearing, not cosmetic. `resolveCity` in geo-link-content
-- no longer falls back to the most-populous candidate, but it still anchors on the
-- country: with city='Zurich' and country='US' it finds exactly one US Zurich and
-- re-links Kansas within the hour. That anchor is how this row got here.
--
-- Fault 2 -- nude-places stamps a REGION centroid as the venue coordinate
-- ---------------------------------------------------------------------
-- Four Zürich-area naturist sites (Naspo, Naturistengelände SonnenBad Schönhalde,
-- Natürlich Sitzberg, Rehwinkel) share the byte-identical coordinate 47.5172328 /
-- 8.4144567 and the city text "Canton of Zurich" -- a canton, not a city. They are
-- distinct places kilometres apart. This is systemic, not a Zürich accident: across
-- data_source='nude-places', 177 rows sit in 57 such clusters, the largest being 21
-- venues covering all of Languedoc-Roussillon on ONE point, with city="Languedoc-Roussillon".
--
-- A centroid is precisely what venue_coord_guard already refuses to write, in its own
-- words: "a plausible-looking lie -- it renders as a precise pin, it is indistinguishable
-- from a real coordinate downstream, and every consumer (map, distance, near me) treats
-- it as fact." The guard cannot reach these rows because it only runs when city_id IS
-- NOT NULL, and all four are unlinked. Their addresses are name-only, so they satisfy the
-- guard's own v_name_only test; nulling is the disposition the guard would have applied.
--
-- ONLY the four Zürich rows are repaired here, because Zürich is the agreed scope. The
-- other 173 are left standing on purpose and are the obvious next batch -- they are one
-- WHERE clause away, and well inside the 300-row search_documents budget.

BEGIN;

-- ── Fault 1a: the event ────────────────────────────────────────────────────────────
--
-- Naming `country` in the SET list is required twice over. derive_entity_geo_address
-- raises its self-contradiction flag when the row's country text disagrees with the
-- linked city's country code, and that flag suppresses the `city` and `state` fills --
-- so setting city_id alone would leave state NULL. And trg_events_set_currency is scoped
-- BEFORE UPDATE OF (country_id, country): a column-scoped trigger fires on the columns
-- named in the UPDATE STATEMENT, not on what an earlier BEFORE trigger mutated, so
-- without `country` here the currency would stay USD. BEFORE triggers run in NAME order,
-- which puts geo_derive (g) ahead of set_currency (s) -- country_id is already CH by then.
--
-- timezone has no trigger at all and is set explicitly.
UPDATE public.events e
SET city_id  = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf',
    country  = 'CH',
    timezone = 'Europe/Zurich',
    field_provenance = jsonb_set(
      coalesce(e.field_provenance, '{}'::jsonb), '{city_id}',
      jsonb_build_object(
        'source', 'manual:zurich_collision_repair',
        'evidence', 'own coordinates 47.3744/8.5410 are 0.5 km from Zürich CH, 7000 km from Zurich KS')),
    enrichment_status =
      -- Retract the safety note derived from country='US'. Preserved, not deleted:
      -- unpublishing removes a claim rather than making a new one.
      (coalesce(e.enrichment_status, '{}'::jsonb)
        || jsonb_build_object('agentic',
             (coalesce(e.enrichment_status->'agentic', '{}'::jsonb) - 'safety_notes')
             || jsonb_build_object('retracted', jsonb_build_object(
                  'safety_notes', e.enrichment_status->'agentic'->>'safety_notes',
                  'reason', 'derived from country=US while the event is in Switzerland',
                  'at', now()))))
      || jsonb_build_object('zurich_collision_repair', jsonb_build_object(
           'at', now(), 'from_city_id', 'eafd0504-bbb2-46ef-a201-b230342d9385'))
WHERE e.id = '1a8fff21-0cc0-4095-b5ed-6703511944bf'
  AND e.city_id = 'eafd0504-bbb2-46ef-a201-b230342d9385';

-- ── Fault 1b: the venue ────────────────────────────────────────────────────────────
--
-- Unlink, do not re-point. `city` must go with `city_id` or geo-link-content's country
-- anchor puts it straight back into Kansas. `country`/`country_id` stay US: that part
-- is not in doubt, and derive_entity_geo_address leaves them alone when city_id is NULL.
UPDATE public.venues v
SET city_id = NULL,
    city    = NULL,
    state   = NULL,
    needs_attention = true,
    enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
      || jsonb_build_object('zurich_collision_repair', jsonb_build_object(
           'at', now(),
           'was_city_id', 'eafd0504-bbb2-46ef-a201-b230342d9385',
           'was_city', v.city,
           'was_state', v.state,
           'reason', 'spartacus row with an empty city segment in its external_id; '
                     || 'named for Long Island, New York and filed under Zurich, Kansas. '
                     || 'No address, coordinates or website to resolve the real city from.'))
WHERE v.id = '89d42756-8fb8-4119-b37c-72b1f57622d3'
  AND v.city_id = 'eafd0504-bbb2-46ef-a201-b230342d9385';

-- ── Fault 2: the four shared-centroid naturist rows ────────────────────────────────
--
-- city text goes too: "Canton of Zurich" is a canton, so it can never resolve, and
-- leaving it invites a future linker to attach all four to the city of Zürich -- which
-- would be a second fabricated fact on top of the first. `state` already holds "Zurich"
-- and is correct at canton granularity, so it stays.
UPDATE public.venues v
SET latitude  = NULL,
    longitude = NULL,
    city      = NULL,
    needs_attention = true,
    enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
      || jsonb_build_object('region_centroid_retract', jsonb_build_object(
           'at', now(),
           'was_lat', v.latitude, 'was_lng', v.longitude, 'was_city', v.city,
           'source', 'nude-places',
           'reason', 'region centroid shared byte-identically by 4 distinct venues; '
                     || 'a centroid renders as a precise pin and is indistinguishable '
                     || 'from a real coordinate downstream'))
WHERE v.data_source = 'nude-places'
  AND v.duplicate_of_id IS NULL
  AND v.latitude  = 47.51723280
  AND v.longitude = 8.41445670;

-- ── Verification ───────────────────────────────────────────────────────────────────
-- Assert the postconditions rather than trusting the trigger chain, because most of the
-- work here is done BY triggers (country_id, currency, state, city, safety_gated) and a
-- scoping change to any of them would silently produce a half-repaired row.
DO $$
DECLARE
  v_left     int;
  v_currency text;
  v_country  text;
  v_state    text;
  v_tz       text;
  v_centroid int;
BEGIN
  SELECT count(*) INTO v_left
  FROM (SELECT 1 FROM public.events WHERE city_id = 'eafd0504-bbb2-46ef-a201-b230342d9385'
        UNION ALL
        SELECT 1 FROM public.venues WHERE city_id = 'eafd0504-bbb2-46ef-a201-b230342d9385') t;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'Zurich KS still holds % row(s)', v_left;
  END IF;

  SELECT currency, country, state, timezone INTO v_currency, v_country, v_state, v_tz
  FROM public.events WHERE id = '1a8fff21-0cc0-4095-b5ed-6703511944bf';

  IF v_country <> 'CH' THEN
    RAISE EXCEPTION 'event country is %, expected CH', v_country;
  END IF;
  IF v_currency <> 'CHF' THEN
    RAISE EXCEPTION 'event currency is %, expected CHF -- trg_events_set_currency did not fire', v_currency;
  END IF;
  IF coalesce(v_state, '') = '' THEN
    RAISE EXCEPTION 'event state is empty -- derive_entity_geo_address flagged a contradiction';
  END IF;
  IF v_tz <> 'Europe/Zurich' THEN
    RAISE EXCEPTION 'event timezone is %, expected Europe/Zurich', v_tz;
  END IF;

  SELECT count(*) INTO v_centroid FROM public.venues
  WHERE data_source = 'nude-places' AND latitude = 47.51723280 AND longitude = 8.41445670;
  IF v_centroid <> 0 THEN
    RAISE EXCEPTION '% nude-places row(s) still on the shared centroid', v_centroid;
  END IF;
END $$;

COMMIT;
