-- Say whether the airport is IN the city or only near it.
--
-- Essen is the case that names the problem. It has no airport of its own, and
-- 20260929100100 gave it airport_codes {DUS,DTM,NRN} with DUS as the primary --
-- correct as a list of airports that serve Essen, but the city page renders that
-- primary under the label "AIRPORT", which asserts Essen has one. Düsseldorf is
-- 25 km away and Dortmund 35.
--
-- The frontend already knows how to say this properly: `CityAtAGlance` prefixes
-- a nearby airport with "~" and `CityTravelTab` has a "Nearest airport" fact.
-- Both are gated on `hasAirport`, which is true as soon as airport_codes is
-- non-empty -- so filling the column is exactly what switched the honest label
-- off. What was missing is not data, it is the DISTINCTION.
--
-- Three columns, all derived in the same pass as airport_codes:
--
--   local_airport_codes    airports whose municipality names this city
--   nearest_airport_codes  the rest, in the same rank order
--   nearest_airport_km     distance to the first nearest one
--
-- airport_codes stays exactly what it was -- the union, unchanged -- so every
-- existing reader keeps working.
--
-- `major_airport_code` is deliberately NOT re-pointed at the local airport. That
-- was measured and rejected: it fixes Cologne (CGN over DUS), Liverpool and
-- Dortmund, and breaks Dallas (Love Field over DFW, whose municipality reads
-- "Dallas-Fort Worth"), Taipei (Songshan over Taoyuan), Nagoya (Komaki over
-- Centrair), Bucharest (Băneasa over Otopeni) and Kobe (UKB over Kansai). No
-- signal available here separates a city's own small airport from the metro
-- gateway, so the ranking stays as it is and the new columns only LABEL it.

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS local_airport_codes   text[],
  ADD COLUMN IF NOT EXISTS nearest_airport_codes text[],
  ADD COLUMN IF NOT EXISTS nearest_airport_km    numeric(6,1);

COMMENT ON COLUMN public.cities.local_airport_codes IS
  'Airports from airport_codes that sit IN this city (OurAirports municipality names it). NULL when the city has none of its own.';
COMMENT ON COLUMN public.cities.nearest_airport_codes IS
  'Airports from airport_codes that serve this city from outside it, in the same rank order.';
COMMENT ON COLUMN public.cities.nearest_airport_km IS
  'Great-circle distance to nearest_airport_codes[1], in km.';

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
  v_local        text[];
  v_nearest      text[];
  v_nearest_km   numeric;
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

    v_new        := NULL;
    v_local      := NULL;
    v_nearest    := NULL;
    v_nearest_km := NULL;
    v_major      := NULL;
    v_top_code   := NULL;

    IF r.latitude IS NOT NULL AND r.longitude IS NOT NULL AND r.country_code IS NOT NULL THEN
      SELECT pick.codes,
             pick.local_codes,
             pick.nearest_codes,
             pick.nearest_km,
             pick.top_code,
             CASE WHEN pick.ambiguous THEN NULL ELSE pick.top_code END,
             pick.top_line
        INTO v_new, v_local, v_nearest, v_nearest_km, v_top_code, v_major, v_transport
      FROM (
        SELECT array_agg(b.iata_code ORDER BY b.rk) FILTER (WHERE b.rk <= 4)        AS codes,
               array_agg(b.iata_code ORDER BY b.rk) FILTER (WHERE b.is_local
                                                              AND b.rk <= 4)          AS local_codes,
               array_agg(b.iata_code ORDER BY b.rk) FILTER (WHERE NOT b.is_local
                                                              AND b.rk <= 4)          AS nearest_codes,
               round(min(b.dist_km) FILTER (WHERE NOT b.is_local)::numeric, 1)        AS nearest_km,
               max(b.iata_code) FILTER (WHERE b.rk = 1)                             AS top_code,
               max(b.iata_code || ' — ' || b.name) FILTER (WHERE b.rk = 1)          AS top_line,
               coalesce(bool_or(b.tied AND b.rk = 2), false)                        AS ambiguous
        FROM (
          SELECT k.iata_code, k.name, k.dist_km, k.is_local,
                 row_number() OVER w AS rk,
                 (k.sitelinks IS NOT DISTINCT FROM first_value(k.sitelinks) OVER w
                  AND k.pax_per_year IS NOT DISTINCT FROM first_value(k.pax_per_year) OVER w
                  AND k.ap_type = first_value(k.ap_type) OVER w
                  AND abs(k.dist_km - first_value(k.dist_km) OVER w) < 0.5) AS tied
          FROM (
            SELECT cand.*, min(cand.dist_km) OVER () AS min_d
            FROM (
              SELECT s.iata_code, s.name, s.sitelinks, s.pax_per_year, s.ap_type,
                     -- Does this airport sit IN the city, or merely near it?
                     -- OurAirports' `municipality` is the only signal for that,
                     -- and it is curated well: CGN reads "Köln (Cologne)", DUS
                     -- "Düsseldorf". Split on comma, slash and parentheses and
                     -- require an EXACT token match -- substring matching would
                     -- make York a local airport of New York. Deliberately NOT
                     -- split on hyphens: "Dallas-Fort Worth" stays one token, so
                     -- DFW reads as near-Dallas rather than in-Dallas. That
                     -- understates a few metros and overstates none, which is
                     -- the right direction for a label a reader trusts.
                     EXISTS (
                       SELECT 1
                       FROM unnest(string_to_array(
                              translate(lower(coalesce(s.municipality, '')), '()/', ',,,'), ',')) AS t(part)
                       WHERE btrim(t.part) = lower(btrim(r.name))
                     ) AS is_local,
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
      -- No geographic candidates, so nothing is known about where these codes
      -- sit relative to the city. Leave the partition empty rather than guess.
      v_local      := NULL;
      v_nearest    := NULL;
      v_nearest_km := NULL;
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
      airport_codes        = v_new,
      -- Same set as airport_codes, partitioned by whether the airport is IN the
      -- city. Essen has no airport of its own, so local is NULL and nearest is
      -- {DUS,DTM,NRN}; the city page can then say "nearest airport DUS, 25 km"
      -- instead of asserting Essen has one.
      local_airport_codes  = v_local,
      nearest_airport_codes = v_nearest,
      nearest_airport_km   = v_nearest_km,
      major_airport_code   = v_major,
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

-- Every row already carries the stamp, so the selector would never look at it
-- again and the three new columns would stay NULL forever. Clearing the stamp
-- puts the whole corpus back in the queue; the nightly cron drains it at 300 a
-- night, and the operator can drain it immediately with repeated
-- `SELECT public.run_city_airport_link(600);`.
UPDATE public.cities
   SET enrichment_status = enrichment_status - 'city_airport_link'
 WHERE enrichment_status ? 'city_airport_link';