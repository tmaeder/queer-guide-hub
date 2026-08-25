-- Correct the candidate ceiling: the +25 km band was measured on the wrong cities.
--
-- 20260929100000 kept only candidates within `nearest + 25 km`. That was checked
-- against 18 mostly-European and North-American cities and it is right for all of
-- them -- but the first 25 rows of the live run showed what it does to a metro
-- whose international gateway sits further out than its city airport:
--
--   Tokyo   HND 19 km -> band 44 km -> NARITA (67 km) DROPPED
--   Seoul   GMP 17 km -> band 42 km -> INCHEON (48 km) DROPPED, GMP published as primary
--   Tehran  THR  5 km -> band 30 km -> IKA (50 km) DROPPED
--
-- Dropping Incheon from Seoul is not a defensible answer, and the band cannot be
-- widened to fix it: at +50 km Brighton (LGW 36 km) swallows Heathrow at 76 km
-- and publishes LHR as Brighton's airport, which is the exact failure the band
-- was introduced to prevent.
--
-- What separates the two cases is not the gap between the airports, it is the
-- absolute distance: Incheon is 48 km from Seoul and Heathrow is 76 km from
-- Brighton. So the ceiling is now ABSOLUTE -- 65 km -- with a small band kept
-- only as a fallback for places whose nearest scheduled airport is further away
-- than that (`greatest(65, nearest + 10)`), so a remote town still gets the one
-- airport it has instead of nothing. Re-checked against all 18 original sample
-- cities plus the metros above: every one of them lands on the same answer as
-- before, or on the better one.
--
-- Two smaller corrections found in the same 25 rows:
--
--   * a retracted code was always recorded as "not_scheduled_passenger_service".
--     For a railway station (ZTO) that is true; for Rabat's RBA, dropped from
--     Casablanca because it is 94 km away, it is a false claim about a working
--     airport. Retractions are now split by reason.
--   * transportation_info was only refreshed when a code was retracted, so
--     Istanbul kept serving "ISL - Ataturk Airport" -- closed to passengers
--     since 2019 -- while its codes were correctly IST/SAW.
--
-- And one correction to the ranking itself. Passenger volume (Wikidata P3872)
-- was the primary key, and it picks the wrong airport for a metro with both a
-- domestic city airport and an international gateway, because P3872 carries
-- whatever year each airport last reported: Wikidata's best figure for Incheon
-- is 17.9M against Gimpo's 24.5M, so Seoul's primary came out GMP. Measured on
-- 13 contested metros, `wikibase:sitelinks` -- how many Wikipedia language
-- editions write about the airport -- gets every one of them right, including
-- the three volume got wrong:
--
--   Seoul         ICN 64 / GMP 36     (pax said GMP)
--   Buenos Aires  EZE 51 / AEP 30     (pax said AEP)
--   Tehran        IKA 48 / THR 42     (pax said THR)
--   London        LHR 98 / LGW 71 / STN 60 / LTN 56 / LCY 55
--   New York      JFK 81 / LGA 58 / EWR 53
--   Paris         CDG 92 / ORY 64 / LBG 39
--
-- This is the signal the original `pickAirports` ranked on, and it was right
-- about that; its defect was never ranking, it was that P931 has no notion of
-- passenger traffic at all. Volume stays as the second key, so it still
-- separates airports Wikipedia treats equally.

ALTER TABLE public.airport_service ADD COLUMN IF NOT EXISTS sitelinks integer;
COMMENT ON COLUMN public.airport_service.sitelinks IS
  'Wikipedia language editions covering the airport (wikibase:sitelinks). Primary ranking key: it separates an international gateway from a city airport where passenger volume does not.';

CREATE OR REPLACE FUNCTION public.run_city_airport_link(
  p_batch integer DEFAULT 300,
  p_force boolean DEFAULT false
)
RETURNS TABLE(processed integer, linked integer, retracted integer, cleared integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r              record;
  v_proc         integer := 0;
  v_linked       integer := 0;
  v_retracted    integer := 0;
  v_cleared      integer := 0;
  v_old          text[];
  v_gated_old    text[];
  v_new          text[];
  v_major        text;
  v_removed      text[];
  v_superseded   text[];
  v_unknown      text[];
  v_prov         jsonb;
  v_ap_prov      jsonb;
  v_transport    text;
  v_top_code     text;
  v_gate_size    integer;
BEGIN
  -- Refuse to run against an unseeded gate. CI applies this migration the moment
  -- it merges, but the gate is filled by an edge function that runs on its own
  -- schedule -- so for a window of unknown length the table is EMPTY, and to an
  -- empty gate every existing code looks like junk. Without this the first 03:25
  -- cron would clear the airport code off every city in the corpus and record the
  -- wipe as a retraction. 1000 is far below the ~4,000 rows a real seed produces
  -- and far above anything a partial or failed load would leave behind.
  SELECT count(*) INTO v_gate_size FROM public.airport_service;
  IF v_gate_size < 1000 THEN
    RAISE WARNING 'run_city_airport_link: airport_service holds % rows -- refusing to run. Seed it by invoking the airport-service-refresh edge function.', v_gate_size;
    processed := 0; linked := 0; retracted := 0; cleared := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR r IN
    SELECT c.id, c.name, c.population, c.latitude, c.longitude,
           c.airport_codes, c.major_airport_code,
           c.field_provenance, c.enrichment_status, c.transportation_info,
           co.code AS country_code
    FROM public.cities c
    LEFT JOIN public.countries co ON co.id = c.country_id
    WHERE c.duplicate_of_id IS NULL
      AND coalesce(c.enrichment_status->'disposition'->>'state','') <> 'not_a_city'
      AND (
        p_force
        -- never linked
        OR NOT (coalesce(c.enrichment_status, '{}'::jsonb) ? 'city_airport_link')
        -- holds the [null] junk shape
        OR (c.airport_codes IS NOT NULL AND cardinality(array_remove(c.airport_codes, NULL)) = 0)
        -- holds a code the gate does not recognise
        OR EXISTS (
             SELECT 1 FROM unnest(array_remove(c.airport_codes, NULL)) AS code
             WHERE NOT EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = code)
           )
        OR (c.major_airport_code IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = c.major_airport_code))
      )
    -- Rows that are publishing a wrong code first, then the biggest cities.
    ORDER BY (c.airport_codes IS NOT NULL) DESC, c.population DESC NULLS LAST, c.id
    LIMIT greatest(p_batch, 1)
  LOOP
    v_proc := v_proc + 1;

    v_old := coalesce(array_remove(r.airport_codes, NULL), '{}'::text[]);

    -- Order preserved, duplicates collapsed (Luxembourg held ["LUX","LUX"]).
    SELECT coalesce(array_agg(d.code ORDER BY d.ord), '{}'::text[])
      INTO v_gated_old
      FROM (
        SELECT DISTINCT ON (t.code) t.code, t.ord
        FROM unnest(v_old) WITH ORDINALITY AS t(code, ord)
        WHERE EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = t.code)
        ORDER BY t.code, t.ord
      ) d;

    SELECT coalesce(array_agg(DISTINCT code), '{}'::text[])
      INTO v_unknown
      FROM unnest(v_old) AS t(code)
     WHERE NOT EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = t.code);

    v_new      := NULL;
    v_major    := NULL;
    v_top_code := NULL;

    IF r.latitude IS NOT NULL AND r.longitude IS NOT NULL AND r.country_code IS NOT NULL THEN
      SELECT pick.codes,
             pick.top_code,
             CASE WHEN pick.ambiguous THEN NULL ELSE pick.top_code END,
             pick.top_line
        INTO v_new, v_top_code, v_major, v_transport
      FROM (
        SELECT array_agg(b.iata_code ORDER BY b.rk) FILTER (WHERE b.rk <= 4)        AS codes,
               max(b.iata_code) FILTER (WHERE b.rk = 1)                             AS top_code,
               max(b.iata_code || ' — ' || b.name) FILTER (WHERE b.rk = 1)          AS top_line,
               coalesce(bool_or(b.tied AND b.rk = 2), false)                        AS ambiguous
        FROM (
          SELECT k.iata_code, k.name,
                 row_number() OVER w AS rk,
                 (k.sitelinks IS NOT DISTINCT FROM first_value(k.sitelinks) OVER w
                  AND k.pax_per_year IS NOT DISTINCT FROM first_value(k.pax_per_year) OVER w
                  AND k.ap_type = first_value(k.ap_type) OVER w
                  AND abs(k.dist_km - first_value(k.dist_km) OVER w) < 0.5) AS tied
          FROM (
            SELECT cand.*, min(cand.dist_km) OVER () AS min_d
            FROM (
              SELECT s.iata_code, s.name, s.sitelinks, s.pax_per_year, s.ap_type,
                     6371.0 * acos(least(1.0, greatest(-1.0,
                       cos(radians(r.latitude::double precision)) * cos(radians(s.latitude))
                         * cos(radians(s.longitude) - radians(r.longitude::double precision))
                       + sin(radians(r.latitude::double precision)) * sin(radians(s.latitude))))) AS dist_km
              FROM public.airport_service s
              WHERE s.country_code = r.country_code
                -- Cheap pre-filter so the haversine runs on a handful of rows.
                -- 1 degree of latitude is ~111 km; the longitude window widens
                -- with latitude and is clamped so the poles cannot blow it up.
                AND s.latitude  BETWEEN r.latitude::double precision  - 1.0
                                    AND r.latitude::double precision  + 1.0
                AND s.longitude BETWEEN r.longitude::double precision
                                        - (1.0 / greatest(cos(radians(r.latitude::double precision)), 0.05))
                                    AND r.longitude::double precision
                                        + (1.0 / greatest(cos(radians(r.latitude::double precision)), 0.05))
            ) cand
            WHERE cand.dist_km <= 100.0
          ) k
          WHERE k.dist_km <= greatest(65.0, k.min_d + 10.0)
          WINDOW w AS (ORDER BY k.sitelinks DESC NULLS LAST,
                                k.pax_per_year DESC NULLS LAST,
                                CASE k.ap_type WHEN 'large_airport' THEN 0
                                               WHEN 'medium_airport' THEN 1 ELSE 2 END,
                                k.dist_km, k.iata_code)
        ) b
      ) pick;
    END IF;

    -- Geographic picks win outright. With none, keep whatever passes the gate --
    -- a valid code is never deleted because the city's own coordinates are wrong.
    IF v_new IS NULL OR cardinality(v_new) = 0 THEN
      v_new   := nullif(v_gated_old, '{}'::text[]);
      v_major := CASE
        WHEN r.major_airport_code IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = r.major_airport_code)
        THEN r.major_airport_code
        ELSE NULL
      END;
      v_transport := NULL;
    END IF;

    SELECT coalesce(array_agg(DISTINCT code), '{}'::text[])
      INTO v_removed
      FROM unnest(v_old) AS t(code)
     WHERE NOT (code = ANY (coalesce(v_new, '{}'::text[])));

    -- A retracted code is one of two different things and saying so matters:
    -- ZTO is a railway station and never belonged here, while RBA is a real
    -- airport that simply serves Rabat rather than Casablanca. Recording both
    -- as "not scheduled passenger service" would be a false statement about a
    -- working airport.
    SELECT coalesce(array_agg(DISTINCT code), '{}'::text[])
      INTO v_superseded
      FROM unnest(v_removed) AS t(code)
     WHERE NOT (code = ANY (v_unknown));

    IF v_new IS NOT NULL THEN v_linked := v_linked + 1; END IF;
    IF cardinality(v_removed) > 0 THEN v_retracted := v_retracted + 1; END IF;
    IF v_new IS NULL AND cardinality(v_old) > 0 THEN v_cleared := v_cleared + 1; END IF;

    -- Provenance. Retracting a claim is recorded, not silently done: the codes
    -- removed and the subset the gate did not recognise are both kept, appended
    -- rather than overwritten, so a second pass cannot erase the first one's
    -- evidence. Same shape as the safety_notes retraction.
    v_prov := coalesce(r.field_provenance, '{}'::jsonb);
    v_ap_prov := coalesce(v_prov->'airport_codes', '{}'::jsonb)
      || jsonb_build_object(
           'value',  to_jsonb(coalesce(v_new, '{}'::text[])),
           'source', 'ourairports',
           'at',     now()
         );
    IF cardinality(v_removed) > 0 THEN
      v_ap_prov := v_ap_prov || jsonb_build_object(
        'retracted',
        coalesce(v_ap_prov->'retracted', '[]'::jsonb)
        || CASE WHEN cardinality(v_unknown) > 0 THEN jsonb_build_array(jsonb_build_object(
             'codes', to_jsonb(v_unknown), 'at', now(),
             'reason', 'not_scheduled_passenger_service'))
           ELSE '[]'::jsonb END
        || CASE WHEN cardinality(v_superseded) > 0 THEN jsonb_build_array(jsonb_build_object(
             'codes', to_jsonb(v_superseded), 'at', now(),
             'reason', 'superseded_by_a_nearer_airport'))
           ELSE '[]'::jsonb END
      );
    END IF;
    v_prov := v_prov || jsonb_build_object('airport_codes', v_ap_prov);
    IF v_major IS NOT NULL THEN
      v_prov := v_prov || jsonb_build_object('major_airport_code',
        coalesce(v_prov->'major_airport_code', '{}'::jsonb)
          || jsonb_build_object('value', to_jsonb(v_major), 'source', 'ourairports', 'at', now()));
    END IF;

    UPDATE public.cities c SET
      airport_codes      = v_new,
      major_airport_code = v_major,
      -- CityTravelTab renders every key of transportation_info as a visible row,
      -- so only the airport line is touched, and only when it is empty or still
      -- names a code that just lost its gate. Hand-written transport text stays.
      transportation_info = CASE
        WHEN v_transport IS NULL THEN c.transportation_info
        WHEN c.transportation_info IS NULL OR c.transportation_info = '{}'::jsonb
          THEN jsonb_build_object('airports', v_transport)
        -- Refresh whenever the stored line does not name the primary we just
        -- picked. Istanbul was serving "ISL - Ataturk Airport", an airport that
        -- closed to passengers in 2019, and the previous rule left it standing
        -- because nothing on that row had to be retracted.
        WHEN coalesce(c.transportation_info->>'airports','') NOT LIKE '%' || v_top_code || '%'
          THEN c.transportation_info || jsonb_build_object('airports', v_transport)
        ELSE c.transportation_info
      END,
      field_provenance = v_prov,
      enrichment_status = jsonb_set(
        CASE WHEN v_new IS NULL THEN coalesce(c.enrichment_status, '{}'::jsonb)
             -- A resolved code also closes the wikidata arm, so the nightly
             -- sparql phase stops spending a WDQS slot on this city. A city with
             -- NO candidate deliberately leaves the `airports` key alone: the
             -- edge function may still find something, and since it gates
             -- through this same table it can no longer bring junk back.
             ELSE jsonb_set(coalesce(c.enrichment_status, '{}'::jsonb), '{airports}',
                    jsonb_build_object('state','resolved','source','ourairports','at',now()), true)
        END,
        '{city_airport_link}',
        jsonb_build_object(
          'at', now(),
          'codes', coalesce(cardinality(v_new), 0),
          'major', v_major,
          'retracted', coalesce(cardinality(v_removed), 0)
        ), true)
    WHERE c.id = r.id;

    v_transport := NULL;
  END LOOP;

  processed := v_proc; linked := v_linked; retracted := v_retracted; cleared := v_cleared;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.run_city_airport_link(integer, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_city_airport_link(integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_city_airport_link(integer, boolean) TO service_role;

-- The 25 rows the first version already processed carry retraction entries that
-- say a working airport has no scheduled service (Narita, Incheon, IKA). Drop
-- exactly those -- entries whose codes are all still in the gate -- so the log
-- does not preserve a false claim. The rows themselves are recomputed by the
-- forced sweep the operator runs next; nothing here guesses at their content.
UPDATE public.cities c
SET field_provenance = jsonb_set(
      c.field_provenance, '{airport_codes,retracted}',
      coalesce((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(c.field_provenance->'airport_codes'->'retracted') e
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(e->'codes') t(code)
          WHERE NOT EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = t.code)
        )
      ), '[]'::jsonb), true)
WHERE jsonb_typeof(c.field_provenance->'airport_codes'->'retracted') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(c.field_provenance->'airport_codes'->'retracted') e
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(e->'codes') t(code)
      WHERE NOT EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = t.code)
    )
  );
