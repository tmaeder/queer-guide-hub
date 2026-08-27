-- Surface city rows whose coordinates cannot both be right.
--
-- Found while auditing duplicate cities. Two rows sitting on the same point are
-- usually one place under two names -- that is what the merge migration in this
-- pair handles. What is left over is the opposite case: two rows that are NOT
-- name variants of each other and still share a point. One of them is standing
-- somewhere it does not belong. Wernigerode (Harz) and Überlingen (Lake
-- Constance) are 0 m apart in this corpus and ~500 km apart in reality; Baden-
-- Baden and Pirna 265 m; Le Cannet (Côte d'Azur) and Carbonne (Occitania) 0 m.
--
-- It is not cosmetic. `run_event_geo_fill` stamps city centroids onto events
-- (`field_provenance.latitude.source='derived:city_centroid'`), and
-- `run_event_timezone_fill` resolves a timezone from the nearest city within
-- 250 km, which a displaced point answers wrong without ever looking wrong.
--
-- THE FIRST VERSION OF THIS VIEW ASKED THE WRONG QUESTION, and the measurement
-- is worth keeping. It required BOTH rows to carry a wikidata_qid, on the
-- reasoning that two QIDs prove two distinct real places. They do -- and that is
-- exactly why it failed: two well-identified places 500 m apart are usually
-- simply NEIGHBOURS. It returned 49 pairs of which the overwhelming majority
-- were correct data (Manchester/Salford 532 m, Mannheim/Ludwigshafen 1.7 km,
-- Melbourne/Southbank, São Paulo/Liberdade, Üsküdar/Beşiktaş), while every one
-- of the actual displacement cases was MISSING, because a displaced row is
-- typically a thin import shell with no QID at all. Requiring the identifier
-- selected against the population it was meant to find.
--
-- What separates displacement from adjacency is DISTANCE, not identity.
-- Neighbouring places have distinct centroids; two rows under 300 m apart with
-- unrelated names are either one point wearing two labels or a district that was
-- never declared as one. Both need a human, so both belong here.
--
-- Arm 2 is the shape distance alone cannot catch: SIMILAR names, two distinct
-- QIDs, under 2 km. Freiberg (Saxony) sits 1.24 km from Freiburg im Breisgau and
-- carries Baden-Württemberg as its region -- the row took on its neighbour's
-- geography wholesale. Three pairs on the live corpus, so the arm is cheap.
--
-- READ-ONLY, AND DELIBERATELY NOT A FLAG. Which of the two rows holds the bad
-- point is not decidable from the pair, and both sides would have to be marked
-- to be safe -- which would put correct, well-populated cities into the city
-- quality queue as defects. `needs_attention` on venues reached 99.5% exactly
-- that way and stopped meaning anything. The repair path is per row and already
-- exists: re-run `city-factual-backfill` with the relink flag, which re-resolves
-- coordinates from the row's own Wikidata QID.

CREATE OR REPLACE VIEW public.cities_suspect_coordinates
WITH (security_invoker = on) AS
WITH live AS (
  SELECT id, name, country_id, latitude, longitude, wikidata_qid, region_name
    FROM public.cities
   WHERE duplicate_of_id IS NULL
     AND latitude IS NOT NULL AND longitude IS NOT NULL
)
SELECT a.id           AS city_a_id,
       a.name         AS city_a_name,
       a.wikidata_qid AS city_a_qid,
       a.region_name  AS city_a_region,
       b.id           AS city_b_id,
       b.name         AS city_b_name,
       b.wikidata_qid AS city_b_qid,
       b.region_name  AS city_b_region,
       co.code        AS country_code,
       round(public.haversine_m(a.latitude, a.longitude, b.latitude, b.longitude)::numeric, 1) AS distance_m,
       round(similarity(lower(a.name), lower(b.name))::numeric, 3) AS name_similarity,
       CASE WHEN similarity(lower(a.name), lower(b.name)) < 0.35
            THEN 'colocated_unrelated_names'
            ELSE 'similar_names_distinct_entities' END AS reason,
       (SELECT count(*) FROM public.venues v WHERE v.city_id = a.id)
     + (SELECT count(*) FROM public.events e WHERE e.city_id = a.id) AS city_a_content,
       (SELECT count(*) FROM public.venues v WHERE v.city_id = b.id)
     + (SELECT count(*) FROM public.events e WHERE e.city_id = b.id) AS city_b_content
  FROM live a
  JOIN live b
    ON b.country_id = a.country_id
   AND b.id > a.id
   -- bounding box first: haversine across every same-country pair is a seq scan
   AND abs(b.latitude - a.latitude) < 0.02
   AND abs(b.longitude - a.longitude) < 0.02
  JOIN public.countries co ON co.id = a.country_id
 WHERE (
         -- arm 1: sharing a point under unrelated names
         (public.haversine_m(a.latitude, a.longitude, b.latitude, b.longitude) < 300
          AND similarity(lower(a.name), lower(b.name)) < 0.35)
      OR -- arm 2: near-identical names, two identified places, one geography
         (public.haversine_m(a.latitude, a.longitude, b.latitude, b.longitude) < 2000
          AND similarity(lower(a.name), lower(b.name)) >= 0.35
          AND a.wikidata_qid IS NOT NULL AND b.wikidata_qid IS NOT NULL
          AND a.wikidata_qid <> b.wikidata_qid)
       );

REVOKE ALL ON public.cities_suspect_coordinates FROM PUBLIC, anon;
GRANT SELECT ON public.cities_suspect_coordinates TO service_role, authenticated;
COMMENT ON VIEW public.cities_suspect_coordinates IS
  'City pairs whose coordinates cannot both be right: under 300 m apart with unrelated names, or near-identical names on two distinct Wikidata entities within 2 km. Read-only review list — which row holds the bad point is not decidable from the pair; repair via city-factual-backfill relink.';
