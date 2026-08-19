-- ============================================================================
-- Stamp field_provenance.safety_notes.country_id on the pre-existing derived
-- notes, so staleness has a KEY and not only prose.
-- ----------------------------------------------------------------------------
-- 20260816112824 started stamping the country a note was composed FROM, on new
-- auto-published writes only. Nothing backfilled the notes already on disk, and
-- nothing ever will: the job selects a row only when its note is EMPTY or
-- already detectably stale, so a correct note is never revisited and never
-- acquires the key. Measured before this migration — 4,529 published derived
-- notes, 4,390 with no stamp.
--
-- Until a note carries the key, the only staleness detector is the crude text
-- test `safety_notes NOT ILIKE '%' || co.name || '%'`. That test is load-bearing
-- and stays (it is what catches notes written before any key existed), but it is
-- weak in both directions:
--
--   - A relink to a country whose name already appears in the note is invisible
--     to it. "United States" sits inside "United States Virgin Islands", so a
--     USVI row relinked to the US would keep reading as healthy.
--   - It cannot distinguish a legal clause from a city-name clause. Measured:
--     10 of the 4,390 notes name some other country, and ALL TEN are artifacts —
--     "Armenia has 7 LGBTQ+ venues" (Armenia, Colombia), "Montenegro has 1
--     LGBTQ+ venue" (Montenegro, Brazil), "Jersey City", "South Jordan",
--     "New Jersey", "Neuendorf, Switzerland", "Cartagena de Indias", plus the
--     USVI substring above. Every one names its own country correctly in the
--     legal clause, so there is no real staleness hiding in that set.
--
-- THE GATE IS THE POINT. This stamps only rows whose note actually names their
-- CURRENT country — it does not blanket-write c.country_id. All 4,390 qualify at
-- the time of writing, but a row can rot between authoring this and CI applying
-- it: Kołobrzeg was relinked from Germany to Poland inside the 35-minute window
-- between a baseline query and 20260912164200 running, and served German law on
-- a Polish city until the one-shot in that migration caught it. Ungated, such a
-- row would receive a stamp blessing the wrong country and would then be
-- PERMANENTLY invisible to the key check this stamp exists to enable — the crude
-- text test would still catch it, but a future key-based check would not. Gated,
-- it simply goes unstamped and the nightly job retracts it on its own.
--
-- Scope: `source='derived'` only. An `llm+human` note went through
-- approve_city_review and we do not know what it was composed from; inventing a
-- provenance key for it would be a fabrication (81 such rows, untouched).
--
-- What the key buys: RELINK staleness becomes a cheap equality test instead of a
-- substring search. What it does NOT buy: fact drift. A country changing its law
-- leaves both the prose and the key intact, and neither detector fires.
--
-- Batching: 500 per statement. `cities` no longer carries a search trigger —
-- verified against the live catalog, the five non-internal triggers are
-- trg_cities_aa_split_name / trg_cities_normalized / trg_cities_slug /
-- trg_erq_cascade / trg_sync_geo_spine — so the old "trg_search_documents_city
-- → 300/batch" rationale does not apply here. The per-row cost that DOES apply
-- is trg_sync_geo_spine, which dual-writes geo_places + geo_city_profiles on
-- every UPDATE. Hence still a cap, just a different one.
-- ============================================================================

DO $$
DECLARE
  v_n       int;
  v_total   int := 0;
  v_residue int;
BEGIN
  LOOP
    WITH target AS (
      SELECT c.id, c.country_id
      FROM public.cities c
      JOIN public.countries co ON co.id = c.country_id
      WHERE c.field_provenance->'safety_notes'->>'source' = 'derived'
        AND c.safety_notes IS NOT NULL
        AND length(trim(c.safety_notes)) > 0
        AND c.field_provenance->'safety_notes'->'country_id' IS NULL
        -- Corroboration gate: only stamp what the prose already agrees with.
        AND c.safety_notes ILIKE '%' || co.name || '%'
      LIMIT 500
    )
    UPDATE public.cities c
    SET field_provenance = jsonb_set(
          COALESCE(c.field_provenance, '{}'::jsonb),
          ARRAY['safety_notes'],
          COALESCE(c.field_provenance->'safety_notes', '{}'::jsonb)
            || jsonb_build_object('country_id', t.country_id),
          true)
    FROM target t
    WHERE c.id = t.id;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  -- Post-condition: nothing corroborated may be left unstamped. This is the
  -- loop's own termination condition restated against the table, so a silent
  -- partial run (a cap that stops early, a predicate that stops matching) fails
  -- the migration instead of shipping a half-stamped corpus.
  SELECT count(*) INTO v_residue
  FROM public.cities c
  JOIN public.countries co ON co.id = c.country_id
  WHERE c.field_provenance->'safety_notes'->>'source' = 'derived'
    AND c.safety_notes IS NOT NULL
    AND length(trim(c.safety_notes)) > 0
    AND c.field_provenance->'safety_notes'->'country_id' IS NULL
    AND c.safety_notes ILIKE '%' || co.name || '%';

  IF v_residue > 0 THEN
    RAISE EXCEPTION 'stamp backfill incomplete: % corroborated notes still unstamped', v_residue;
  END IF;

  RAISE NOTICE 'stamped % derived city safety notes with country_id', v_total;
END $$;
