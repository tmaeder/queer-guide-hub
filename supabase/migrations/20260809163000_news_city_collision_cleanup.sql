-- Clear news→city links that the new prose collision guard would now refuse.
--
-- `public.cities` holds at most one row per (name, country), so it cannot
-- represent Portland ME alongside Portland OR. Both news linkers matched on
-- name alone, so every Portland article landed on Portland, Oregon: of 132
-- articles linked to that city, 13 named Maine in their own title or excerpt
-- and were visible on https://queer.guide/city/portland.
--
-- The rule below mirrors `proseStateContradiction()` in
-- supabase/functions/_shared/city-collision-guard.ts. Kept deliberately narrow,
-- because the obvious "any disagreeing state blocks" version was measured
-- against this corpus and fired on 873 of 9,538 US city links — overwhelmingly
-- correct links that merely mention another state in passing. Restricting it to
-- names whose twin `cities` cannot represent brings that to 53.
--
-- Both stores are cleaned. `news_articles.city_ids` is unioned on every commit
-- (`city_ids || v_city_ids`), so clearing only the join table would let the
-- wrong link resurrect on the article's next update.

BEGIN;

CREATE TEMP TABLE _news_city_collisions ON COMMIT DROP AS
WITH state_names(nm) AS (
  -- Full names only. Two-letter codes are unusable here: "ME", "OR", "IN" and
  -- "OK" are ordinary English words in prose.
  -- `Washington` is excluded outright — it is a state, a city, and the everyday
  -- name for DC at once, so a mention corroborates nothing.
  VALUES ('Alabama'),('Alaska'),('Arizona'),('Arkansas'),('California'),('Colorado'),
         ('Connecticut'),('Delaware'),('Florida'),('Georgia'),('Hawaii'),('Idaho'),
         ('Illinois'),('Indiana'),('Iowa'),('Kansas'),('Kentucky'),('Louisiana'),
         ('Maine'),('Maryland'),('Massachusetts'),('Michigan'),('Minnesota'),
         ('Mississippi'),('Missouri'),('Montana'),('Nebraska'),('Nevada'),
         ('New Hampshire'),('New Jersey'),('New Mexico'),('New York'),
         ('North Carolina'),('North Dakota'),('Ohio'),('Oklahoma'),('Oregon'),
         ('Pennsylvania'),('Rhode Island'),('South Carolina'),('South Dakota'),
         ('Tennessee'),('Texas'),('Utah'),('Vermont'),('Virginia'),
         ('West Virginia'),('Wisconsin'),('Wyoming')
),
ambiguous_names(nm) AS (
  -- US city names with a well-known twin in another state. Cannot be derived
  -- from `cities` — the table's inability to hold the twin IS the bug.
  VALUES ('Portland'),('Charleston'),('Springfield'),('Columbia'),('Columbus'),
         ('Wilmington'),('Richmond'),('Rochester'),('Manchester'),('Athens'),
         ('Cambridge'),('Jackson'),('Franklin'),('Aurora'),('Glendale'),
         ('Lancaster'),('Salem'),('Newark'),('Bristol'),('Dover'),('Auburn'),
         ('Cleveland'),('Alexandria'),('Pasadena'),('Peoria')
),
links AS (
  SELECT nac.id AS link_id, nac.article_id, nac.city_id,
         c.name AS city_name, c.region_name,
         coalesce(n.title,'') || ' ' || coalesce(n.excerpt,'') AS txt
  FROM public.news_article_cities nac
  JOIN public.cities c    ON c.id  = nac.city_id
  JOIN public.countries co ON co.id = c.country_id
  JOIN public.news_articles n ON n.id = nac.article_id
  WHERE co.code = 'US'
    AND c.region_name IS NOT NULL
    AND c.name IN (SELECT nm FROM ambiguous_names)
)
SELECT l.link_id, l.article_id, l.city_id, l.city_name, l.region_name,
       (SELECT string_agg(s.nm, '/')
          FROM state_names s
         WHERE s.nm <> l.region_name
           AND l.city_name NOT ILIKE ('%' || s.nm || '%')
           AND l.txt ~* ('\y' || s.nm || '\y')) AS claimed_states
FROM links l
-- Naming the candidate's own state anywhere clears it: corroboration outranks
-- a competing mention.
WHERE l.txt !~* ('\y' || l.region_name || '\y')
  AND EXISTS (
    SELECT 1 FROM state_names s
     WHERE s.nm <> l.region_name
       -- Without this, "Kansas City, Missouri" reads every mention of Kansas as
       -- a contradiction — the largest false-positive group when measured.
       AND l.city_name NOT ILIKE ('%' || s.nm || '%')
       AND l.txt ~* ('\y' || s.nm || '\y')
  );

DELETE FROM public.news_article_cities nac
USING _news_city_collisions x
WHERE nac.id = x.link_id;

-- Strip the same pairs from the denormalized array. Aggregated per article on
-- purpose: joining the collision rows directly would match an article with two
-- bad cities twice, and the UPDATE would apply only one of them.
UPDATE public.news_articles n
SET city_ids = coalesce(
      (SELECT array_agg(cid)
         FROM unnest(n.city_ids) AS cid
        WHERE cid <> ALL(agg.bad_ids)),
      '{}'::uuid[]
    )
FROM (
  SELECT article_id, array_agg(DISTINCT city_id) AS bad_ids
    FROM _news_city_collisions
   GROUP BY article_id
) agg
WHERE n.id = agg.article_id
  AND n.city_ids && agg.bad_ids;

COMMIT;
