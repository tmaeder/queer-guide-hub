-- Airport codes for cities, gated on real scheduled passenger service.
--
-- `cities.airport_codes` / `major_airport_code` had exactly one writer: the
-- `sparql` phase of the `city-factual-backfill` edge function, which takes every
-- Wikidata P931 ("place served by transport hub") result carrying an IATA code
-- and ranks it by sitelink count. P931 has no notion of passenger traffic, so
-- 250 of the 934 distinct codes in use (27%, measured 2026-08-25) are not
-- passenger airports at all:
--
--   rail/bus station IATA codes  Boston ZTO (South Station), Halifax XDG, XQC, ZQZ, QHA
--   heliports                    Algeciras AEI
--   closed airports              Berlin SXF, Nicosia NIC, Siem Reap REP, Doncaster DSA
--   general aviation / military  Houston EFD IWS CXO, Palm Springs UDD, Gothenburg GSE,
--                                Moenchengladbach MGL
--   wrong city entirely          Houston HVN (Tweed New Haven, CT), Casablanca RBA (Rabat, 94 km)
--   duplicates                   Luxembourg ["LUX","LUX"]
--
-- That is not cosmetic: `major_airport_code` is a live booking input
-- (src/hooks/useTripBookingContext.ts feeds it to the Aviasales flight search as
-- destinationIata), so a closed or rail-station code produces a broken search.
-- Meanwhile Ibiza, Mykonos, Puerto Vallarta, Brighton, Sitges and Fire Island
-- were all NULL with a scheduled airport inside 40 km.
--
-- Two objects here: a gate table that says which IATA codes are real scheduled
-- passenger airports, and a batched linker that decides which of them belongs to
-- which city. `public.airports` (9,252 rows, the flight-booking dataset) is
-- deliberately NOT reused as the gate -- its `is_major` flag is false on every
-- row and the set includes bush strips like "Onion Bay", so it carries no
-- quality signal at all. It and its consumers (find_nearest_airport,
-- useNearestAirport) stay untouched by decision; a follow-up can filter them on
-- this table.

-- ---------------------------------------------------------------------------
-- 1. The gate: OurAirports rows with scheduled passenger service
-- ---------------------------------------------------------------------------
-- Seeded by the `airport-service-refresh` edge function (section 4) from
-- https://davidmegginson.github.io/ourairports-data/airports.csv, keeping only
-- scheduled_service='yes' AND type IN (large_airport, medium_airport,
-- small_airport) -- 4,009 rows. Heliports, seaplane bases, type='closed' and
-- everything with scheduled_service='no' are never inserted, which is what
-- removes ZTO, AEI, EFD, MGL, GSE, SXF and NIC in one move. small_airport is
-- included on purpose: island destinations with genuine scheduled service
-- (Martha's Vineyard MVY) live in that tier.
--
-- `pax_per_year` is Wikidata P3872 and is a RANKING signal only. It must never
-- be used to decide whether an airport is open: it is historical, so closed SXF
-- still reports 12.8M passengers and a rail station (XDS) reports 800k.
CREATE TABLE IF NOT EXISTS public.airport_service (
  iata_code    text PRIMARY KEY CHECK (iata_code ~ '^[A-Z]{3}$'),
  icao_code    text,
  name         text NOT NULL,
  municipality text,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  ap_type      text NOT NULL CHECK (ap_type IN ('large_airport','medium_airport','small_airport')),
  pax_per_year bigint,
  -- Alternate IATA codes OurAirports lists in its `keywords` column (BSL carries
  -- MLH and EAP for the same EuroAirport). INFORMATIONAL ONLY: the linker never
  -- reads this, it exists so airport_service_unknown_codes() can tell a human
  -- "MLH is not missing, it is Basel" instead of presenting it as junk.
  alt_codes    text[],
  source       text NOT NULL DEFAULT 'ourairports',
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS airport_service_country_idx ON public.airport_service (country_code);
CREATE INDEX IF NOT EXISTS airport_service_geo_idx     ON public.airport_service (latitude, longitude);

COMMENT ON TABLE public.airport_service IS
  'IATA codes with scheduled passenger service (OurAirports large/medium/small + scheduled_service=yes). The gate of record for cities.airport_codes. pax_per_year (Wikidata P3872) ranks candidates and must never be read as proof an airport is open -- it is historical.';
COMMENT ON COLUMN public.airport_service.pax_per_year IS
  'Wikidata P3872, latest reported year. Ranking signal only: closed SXF reports 12.8M.';
COMMENT ON COLUMN public.airport_service.alt_codes IS
  'Alternate IATA codes from the OurAirports keywords column. Informational: never a gate key.';

ALTER TABLE public.airport_service ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS airport_service_select ON public.airport_service;
CREATE POLICY airport_service_select ON public.airport_service FOR SELECT USING (true);

-- New tables need explicit grants in this project.
GRANT SELECT ON public.airport_service TO anon, authenticated;
GRANT ALL    ON public.airport_service TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The linker
-- ---------------------------------------------------------------------------
-- Candidate rule, measured against 18 sample cities:
--
--   1. same country as the city, within 100 km of the city centroid;
--   2. keep only those within min_distance + 25 km. This band is the
--      load-bearing part. Ranking purely by passenger volume gives Brighton
--      -> LHR (76 km, 79M pax) instead of LGW (36 km); ranking purely by
--      distance gives London -> LCY (13 km) instead of LHR and Houston -> HOU
--      instead of IAH. The band picks the right one in every sample;
--   3. inside the band rank by pax desc, then large > medium > small, then
--      distance;
--   4. airport_codes = top 4; major_airport_code = rank 1, left NULL when
--      rank 2 ties it on every key (the "decisive" rule from pickAirports);
--   5. no candidate -> NULL, never a guess.
--
-- Rule 5 has one exception, and it exists because bad city coordinates are real:
-- Key West is stored at 26.59,-83.89, in the Gulf of Mexico 200 km from the
-- actual city, so it has zero candidates. A code that PASSES the gate is
-- therefore never deleted for want of a geographic match -- only codes absent
-- from airport_service are removed. Key West keeps EYW and loses NQX (Boca
-- Chica NAS). Geographic picks win outright when there are any, which is how
-- Casablanca loses RBA (a real airport, 94 km away in Rabat).
--
-- Batch cap 300: a cities UPDATE fires trg_sync_geo_spine -> geo_places ->
-- trg_search_documents_city_ins -> search_reindex_queue, the same per-row chain
-- that caps run_city_safety_backfill.
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
  v_unknown      text[];
  v_prov         jsonb;
  v_ap_prov      jsonb;
  v_transport    text;
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

    v_new   := NULL;
    v_major := NULL;

    IF r.latitude IS NOT NULL AND r.longitude IS NOT NULL AND r.country_code IS NOT NULL THEN
      SELECT pick.codes,
             CASE WHEN pick.ambiguous THEN NULL ELSE pick.top_code END,
             pick.top_line
        INTO v_new, v_major, v_transport
      FROM (
        SELECT array_agg(b.iata_code ORDER BY b.rk) FILTER (WHERE b.rk <= 4)        AS codes,
               max(b.iata_code) FILTER (WHERE b.rk = 1)                             AS top_code,
               max(b.iata_code || ' — ' || b.name) FILTER (WHERE b.rk = 1)          AS top_line,
               coalesce(bool_or(b.tied AND b.rk = 2), false)                        AS ambiguous
        FROM (
          SELECT k.iata_code, k.name,
                 row_number() OVER w AS rk,
                 (k.pax_per_year IS NOT DISTINCT FROM first_value(k.pax_per_year) OVER w
                  AND k.ap_type = first_value(k.ap_type) OVER w
                  AND abs(k.dist_km - first_value(k.dist_km) OVER w) < 0.5) AS tied
          FROM (
            SELECT cand.*, min(cand.dist_km) OVER () AS min_d
            FROM (
              SELECT s.iata_code, s.name, s.pax_per_year, s.ap_type,
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
          WHERE k.dist_km <= k.min_d + 25.0
          WINDOW w AS (ORDER BY k.pax_per_year DESC NULLS LAST,
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
        coalesce(v_ap_prov->'retracted', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'codes',   to_jsonb(v_removed),
            'unknown', to_jsonb(v_unknown),
            'at',      now(),
            'reason',  'not_scheduled_passenger_service'
          ))
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
        WHEN cardinality(v_removed) > 0
             AND EXISTS (SELECT 1 FROM unnest(v_removed) AS t(code)
                         WHERE c.transportation_info->>'airports' LIKE '%' || t.code || '%')
          THEN c.transportation_info || jsonb_build_object('airports', v_transport)
        ELSE c.transportation_info
      END,
      field_provenance = v_prov,
      enrichment_status = jsonb_set(
        CASE WHEN v_new IS NULL THEN coalesce(c.enrichment_status, '{}'::jsonb)
             -- A resolved code also closes the wikidata arm, so the nightly
             -- sparql phase stops spending a WDQS slot on this city. A city with
             -- NO candidate deliberately leaves the `airports` key alone: the
             -- edge function may still find something, and since 3. below gates
             -- it through this same table it can no longer bring junk back.
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

COMMENT ON FUNCTION public.run_city_airport_link(integer, boolean) IS
  'Batched: fills cities.airport_codes / major_airport_code from public.airport_service (scheduled passenger service only), same country, within 100 km, banded to nearest+25 km, ranked by passengers. Removes codes the gate does not recognise and records them under field_provenance.airport_codes.retracted. Never deletes a gate-passing code for want of a geographic match.';

-- ---------------------------------------------------------------------------
-- 2b. The hand-review list
-- ---------------------------------------------------------------------------
-- Absence from OurAirports is NOT evidence of closure, so a code the gate does
-- not recognise is surfaced for a human rather than judged automatically. Two
-- of the 54 found on 2026-08-25 were real: MLH and EAP are alternate codes for
-- Basel EuroAirport (which the file carries only as BSL) and PBI is West Palm
-- Beach, present under ident KPBI but re-coded to DJT after the 2025 rename.
-- The rest were rail stations (XDG, XQC, ZTO, QHA) and closed fields.
--
-- Wikidata P3872 cannot arbitrate this: it is historical, so closed SXF reports
-- 12.8M passengers and the rail station XDS reports 800k.
CREATE OR REPLACE FUNCTION public.airport_service_unknown_codes()
RETURNS TABLE(code text, alias_of text, alias_name text, cities bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT u.code,
         a.iata_code,
         a.name,
         count(*) AS cities
  FROM (
    SELECT c.id, unnest(array_remove(c.airport_codes, NULL)) AS code
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
  ) u
  LEFT JOIN public.airport_service a ON u.code = ANY (a.alt_codes)
  WHERE NOT EXISTS (SELECT 1 FROM public.airport_service s WHERE s.iata_code = u.code)
  GROUP BY u.code, a.iata_code, a.name
  ORDER BY count(*) DESC, u.code;
$$;

REVOKE ALL ON FUNCTION public.airport_service_unknown_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.airport_service_unknown_codes() TO authenticated, service_role;

COMMENT ON FUNCTION public.airport_service_unknown_codes() IS
  'Codes still sitting in cities.airport_codes that the gate does not vouch for, with an alias hint where OurAirports lists the code as an alternate for a real airport. Read by hand before assuming they are junk.';

-- ---------------------------------------------------------------------------
-- 3. Registry row + cron
-- ---------------------------------------------------------------------------
-- 03:25 sits before city_completeness_recompute and city_trust_recompute so a
-- city that gains an airport code is rescored the same night.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'city_airport_link',
  'Link cities to their passenger airport',
  'Nightly: fills cities.airport_codes / major_airport_code from public.airport_service (OurAirports scheduled passenger service only), same country, within 100 km, banded to nearest+25 km and ranked by annual passengers. Also retracts codes that are not passenger airports (rail stations, heliports, closed and GA fields), recording them in field_provenance. 300/run -- cities UPDATE reaches search via the geo spine. The gate table is refreshed monthly by the airport_service_refresh automation.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type','rpc',
    'fn','run_city_airport_link',
    'jobname','city_airport_link',
    'command','SELECT public.run_city_airport_link(300);'
  ),
  '25 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('city_airport_link');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'city_airport_link';

-- ---------------------------------------------------------------------------
-- 4. Gate refresh
-- ---------------------------------------------------------------------------
-- Monthly, because the input is a 12 MB CSV and airports do not open and close
-- weekly. The whole fetch/parse/upsert happens inside the edge function, so the
-- pg_net request here is a small POST; it still carries an explicit timeout
-- because pg_net's 5s default would report a timed_out response for a job that
-- legitimately runs for a minute (a timed_out response is `partial`, never an
-- error -- absence of evidence, not evidence of failure).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'airport_service_refresh',
  'Refresh the passenger-airport gate',
  'Monthly: rebuilds public.airport_service from OurAirports (scheduled_service=yes, large/medium/small) plus Wikidata P3872 passenger figures for ranking. Airports that fall out of the gate are pruned, so a closed airport stops being linkable. run_city_airport_link then re-examines every city still holding a code the gate no longer knows.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type','cron',
    'jobname','airport_service_refresh',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/airport-service-refresh',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$
  ),
  '30 2 1 * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('airport_service_refresh');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, public.admin_automation_effective_command(a.slug, a.action->>'command'))
FROM public.admin_automations a
WHERE a.slug = 'airport_service_refresh';
