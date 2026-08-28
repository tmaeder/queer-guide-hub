-- Delete 57 `cities` rows that are not cities.
--
-- `public.cities` carried a row "Hessen" — a German Bundesland, population
-- 6,045,425, zero venues/events/hotels/news/villages — reachable from site
-- search as a city card. It was not an outlier. 1,832 rows are stamped
-- `data_source='personality-birth-place'`, minted from a personality's
-- birth-place FREE TEXT; every one carries a `tmp-` slug and NOT ONE has a
-- `wikidata_qid`, so nothing downstream ever corroborated them. 1,456 hold no
-- place content at all and all of them are live in `search_documents` (the city
-- indexer filters only `duplicate_of_id`), so "Hessen", "Texas", "Americas" and
-- "Czechoslovakia" all answered a search with a city result.
--
-- The 57 ids below are the hand-reviewed non-places out of that cohort:
-- first-level subdivisions (Hessen, Mississippi, Amazonas, Rio Grande do Sul,
-- Manitoba, Yucatán, Westbengalen, England, Schottland), counties and districts
-- (Ventura, Sonoma, Stanislaus, Prince William, Tolland, Comanche, Wythe, Page,
-- Lake, Shefford, Parry Sound, Havana Province, Niigata Prefecture), countries
-- in German and English (Russland, Frankreich, Kanada, Australien, Irak,
-- Irland, Indien, Kenia, Südafrika, …), one continent ("Americas", population
-- 1,035,298,985) and one historic polity ("Electorate of Saxony").
--
-- Provenance: `scripts/data-quality/classify-nonplace-cities.mjs` ranks
-- candidates against dr5hn's ISO-3166-2 subdivision list, mledoze's
-- multilingual country names and dr5hn's gazetteer; the arms RANK, a human
-- decides, and the nine rows a human took back out are recorded with reasons in
-- `scripts/data-quality/out/nonplace-city-review.json`. Rows whose name is
-- attested both as a container and as a settlement are never deleted — Bursa,
-- Tucumán and every Thai province are cities their province was named after,
-- and Singapur/Luxemburg/Hong Kong are city-states with canonical rows holding
-- 77/15/83 pieces of content.
--
-- WHY THE ORDER BELOW IS LOAD-BEARING. `cities.id` has exactly TWO foreign keys
-- left (`cities.duplicate_of_id`, `queer_villages.city_id`) — the ~26 FK columns
-- in the baseline were dropped by the Geo P2 flips (20260726114743-115926). So
-- a bare DELETE succeeds and silently leaves dangling uuids in
-- `personalities.city_id`, `city_quality_signals.city_id` and two dozen other
-- unconstrained columns. Every pointer is cleared here, by hand, because the
-- database will not do it and will not complain.
--
-- This is the first hard DELETE on `cities` in the repo's history; the standing
-- convention is the reversible `archive_city_as_nonplace` (20260801135950).
-- Deletion was chosen deliberately, so `nonplace_city_deletion_audit` carries a
-- full jsonb snapshot of every deleted row — that table is the only way back.
--
-- `search_documents` needs no statement here: the delete fires
-- `trg_sync_geo_spine` -> the `geo_places` row goes -> `trg_search_documents_city_del`
-- enqueues -> `search_reindex_drain` (*/1) does `DELETE FROM search_documents`
-- before re-indexing. `entity_review_queue` is likewise cleaned by the existing
-- `trg_erq_cascade` AFTER DELETE trigger.

-- ── 1. Audit ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nonplace_city_deletion_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       uuid NOT NULL,        -- deliberately NO FK: the row is gone
  city_name     text NOT NULL,
  country_code  text,
  reason        text NOT NULL,        -- which classifier arms fired
  city_row      jsonb NOT NULL,       -- full snapshot; the ONLY surviving copy
  spine_row     jsonb,                -- the geo_places row, same
  refs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nonplace_city_deletion_audit IS
  'One row per cities row hard-deleted as a non-place (Bundesland/state/county/country/continent misfiled as a city by the personality-birth-place path). city_row is the only surviving copy of the deleted row; refs records which personalities pointed at it.';

CREATE INDEX IF NOT EXISTS idx_nonplace_city_deletion_audit_city
  ON public.nonplace_city_deletion_audit (city_id);

ALTER TABLE public.nonplace_city_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nonplace_city_deletion_audit FROM anon, authenticated;
GRANT ALL ON TABLE public.nonplace_city_deletion_audit TO service_role;

-- ── 2. The reviewed list ────────────────────────────────────────────────────
--
-- An explicit id list, never a predicate. A predicate deletes what matches at
-- apply time; this deletes what a human read.

DROP TABLE IF EXISTS _nonplace_ids;
CREATE TEMP TABLE _nonplace_ids (
  id uuid PRIMARY KEY,
  city_name text NOT NULL,
  country_code text,
  reason text NOT NULL
) ON COMMIT DROP;

INSERT INTO _nonplace_ids (id, city_name, country_code, reason) VALUES
    ('2cc6134e-374d-459b-8463-0d834c788ec4'::uuid, 'Americas', 'US', 'macro_region'),
    ('4a14f906-4641-4023-8fdd-a740905ee03c'::uuid, 'Russland', 'RU', 'country'),
    ('303acc30-610a-443b-ac14-5b3eec5ba1a2'::uuid, 'Sumatra', 'ID', 'subdivision'),
    ('50f004f9-73dd-43f9-b1fa-9babaa466052'::uuid, 'Frankreich', 'FR', 'country'),
    ('7d7af474-ccb7-407d-b2e1-44698163557e'::uuid, 'Rio Grande do Sul', 'BR', 'subdivision'),
    ('d3305fbf-a563-4872-9f23-bc3f31a49d86'::uuid, 'England', 'GB', 'subdivision'),
    ('afd1c886-0aed-4593-b060-16f7fd13db7b'::uuid, 'Irak', 'IQ', 'country'),
    ('499c8bd5-9bba-4999-ac2e-81456188baf0'::uuid, 'Irland', 'IE', 'country'),
    ('9f82e1ad-2aff-4205-9426-bc9c05c91d74'::uuid, 'Hessen', 'DE', 'subdivision'),
    ('3afcdb4d-5b72-4189-977d-6b7e2539e6a2'::uuid, 'Amazonas', 'BR', 'subdivision'),
    ('5ecdc3f5-1e17-4c61-b0cb-0a0fb7e191e7'::uuid, 'Mississippi', 'US', 'subdivision'),
    ('dce67684-3d79-487d-b9fe-f31310dd532e'::uuid, 'Brussels metropolitan area', 'GB', 'suffix'),
    ('b875fed4-4ba8-4023-9fb3-e7a79d330327'::uuid, 'Yucatán', 'MX', 'subdivision'),
    ('81b69958-f59b-4373-8fb4-3383fe3c092b'::uuid, 'Niigata Prefecture', 'JP', 'suffix'),
    ('daca6207-8090-42a8-89da-b7d7ae78f750'::uuid, 'Havana Province', 'CU', 'suffix'),
    ('a8ba41cf-7a64-4368-8d97-b37e4f6edb84'::uuid, 'Libanon', 'LB', 'country'),
    ('105a11d4-48a7-4fdc-acd8-849f8fcbdc2d'::uuid, 'Manitoba', 'CA', 'subdivision'),
    ('60badbc2-38bb-4886-bfa6-f16774bdc87e'::uuid, 'Saskatchewan', 'AU', 'subdivision_other_country'),
    ('b9910f98-3c9c-4ed0-b54e-a96a6d608c05'::uuid, 'Electorate of Saxony', 'DE', 'historic_polity'),
    ('e2c490d2-1e2f-490e-98da-b069dee5ced4'::uuid, 'Lanarkshire', 'GB', 'suffix'),
    ('40fe5000-b0ec-4066-8034-1d62deca3f7c'::uuid, 'Ventura County', 'US', 'suffix'),
    ('8b5577bd-1407-41f6-9c5b-71322c345155'::uuid, 'Stanislaus County', 'US', 'suffix'),
    ('181c8cf5-4843-4e0e-a904-98fd08ca5546'::uuid, 'Changyang Tujia Autonomous County', 'CN', 'suffix'),
    ('cf9265fb-3458-4881-9718-3e9213fba835'::uuid, 'Sonoma County', 'US', 'suffix'),
    ('ddf48cd5-ec49-4cf3-8125-796f3a9f14a2'::uuid, 'Prince William County', 'US', 'suffix'),
    ('d74f7d9a-be12-4bfa-bd71-9832633df8cc'::uuid, 'Tolland County', 'US', 'suffix'),
    ('5ae0aea6-72c1-4507-aa03-5dfa3d05e175'::uuid, 'Comanche County', 'US', 'suffix'),
    ('a1f918eb-4467-4018-b2a7-2833d431a15b'::uuid, 'Brecknockshire', 'GB', 'suffix'),
    ('b201d8b3-fdf4-4d75-99f6-eebc8dc378b9'::uuid, 'Tobago', 'TT', 'subdivision'),
    ('d82a49d8-db5d-456c-9123-3b019534c6fd'::uuid, 'Wythe County', 'US', 'suffix'),
    ('ae2ed47a-078b-4c0a-b216-834eff8e732f'::uuid, 'Page County', 'US', 'suffix'),
    ('093b426d-0a16-4b70-b11a-4ffbc8550702'::uuid, 'South Dakota', 'US', 'subdivision'),
    ('a4602bf9-0c72-48a5-b7c4-640c4b4b8755'::uuid, 'Lake County', 'US', 'suffix'),
    ('16e934e9-821a-4b85-86d5-b5a9555c844e'::uuid, 'San Isidro Canton', 'CR', 'suffix'),
    ('3453b22f-be13-40ba-b7b5-26a42b6bf04a'::uuid, '*Deutschland', 'DE', 'country'),
    ('3b9a6697-ded9-41e5-a99b-a3ebf1431c03'::uuid, 'Algerien', 'DZ', 'country'),
    ('d7d1f26d-92c6-4660-afd2-a08b038c6a6b'::uuid, 'Amerikanisch-Samoa', 'AS', 'subdivision_other_country+country'),
    ('5ad38a03-e805-46b8-9c04-da4e814f4644'::uuid, 'Australien', 'AU', 'country'),
    ('398d363c-d14c-4b9b-bcf7-8c711d83a959'::uuid, 'Baskenland', 'ES', 'subdivision'),
    ('7f6fc3f7-c687-43bd-924f-59f21b3c0b2d'::uuid, 'Indien', 'IN', 'country'),
    ('c5ff96d8-09aa-4892-a3e5-0eee0265e336'::uuid, 'Indonesien', 'ID', 'country'),
    ('6da11bce-fbe8-4035-8c86-9a31596030d0'::uuid, 'Jamaika', 'JM', 'country'),
    ('0a90c7f6-3795-4331-802c-6e692ad084eb'::uuid, 'Kamerun', 'CM', 'country'),
    ('dff8a252-acdd-4f0f-9e89-5b6579d6ed0a'::uuid, 'Kanada', 'CA', 'country'),
    ('24463e0d-5445-4f94-9305-88b4fa9c3031'::uuid, 'Kenia', 'KE', 'country'),
    ('5fea898f-b705-411c-869a-3561a8e5312e'::uuid, 'Neuseeland', 'NZ', 'country'),
    ('30f1e908-2f94-45f0-aac2-56850552a9f9'::uuid, 'Nybro church parish', 'SE', 'suffix'),
    ('92a0a6ff-0bef-4359-8f87-21c6af547dc9'::uuid, 'Palästina', 'PS', 'country'),
    ('087b27ba-a74d-44cd-837f-86e0d02eb1f4'::uuid, 'Philippinen', 'PH', 'country'),
    ('e47fc955-4395-4da8-8658-0d3c795da52b'::uuid, 'Sambia', 'ZM', 'country'),
    ('c83d8742-ad07-4931-aaf9-297450ebffc0'::uuid, 'Schottland', 'GB', 'subdivision'),
    ('b394d250-ae9b-4662-b614-9a6d1abf125c'::uuid, 'Shefford County', 'CA', 'suffix'),
    ('b77688c1-b423-48e8-8e29-a67eae5f63aa'::uuid, 'Simbabwe', 'ZW', 'country'),
    ('e7ab8d65-d056-4ca3-8bbf-846394422ad7'::uuid, 'Südafrika', 'ZA', 'country'),
    ('9a3c0d8a-3d21-4dac-81c6-b1ba4b0bac1b'::uuid, 'Südkorea', 'KR', 'country'),
    ('ebf5c081-dfc4-43ae-ae05-d7309ab223ae'::uuid, 'Trinidad und Tobago', 'TT', 'country'),
    ('e59141fb-c5b8-4944-a882-ca1e9a932c31'::uuid, 'Westbengalen', 'IN', 'subdivision');

-- ── 3. Guard ────────────────────────────────────────────────────────────────
--
-- A row can change between authoring this file and CI applying it. If any
-- listed row has since gained real content, it is no longer the row that was
-- reviewed, and nothing here may run. (Missing ids are tolerated: an absent row
-- is already in the desired state, and failing forever on it would wedge CI.)

DO $$
DECLARE
  v_present  integer;
  v_content  integer;
  v_merged   integer;
  v_names    text;
BEGIN
  SELECT count(*) INTO v_present
  FROM public.cities c JOIN _nonplace_ids t ON t.id = c.id;

  SELECT count(*), coalesce(string_agg(c.name, ', '), '')
    INTO v_content, v_names
  FROM public.cities c
  JOIN _nonplace_ids t ON t.id = c.id
  WHERE EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.events e WHERE e.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.hotels h WHERE h.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.queer_villages q WHERE q.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.news_article_cities n WHERE n.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.milestones m WHERE m.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.trip_destinations td WHERE td.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.trip_places tp WHERE tp.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.city_favorites f WHERE f.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.guides g WHERE g.city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.trips tr WHERE tr.primary_city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.user_travel_preferences u WHERE u.home_city_id = c.id);

  IF v_content > 0 THEN
    RAISE EXCEPTION 'nonplace delete aborted: % reviewed row(s) gained content since review (%)', v_content, v_names;
  END IF;

  -- A reviewed row can also be merged away by concurrent work rather than gain
  -- content. That happened between review and this PR: `Tunesien` was merged
  -- into `Tunis` by 20260929110000_city_exonym_merges, which set
  -- `duplicate_of_id`, wrote a `city_merge_audit` row and made the row a
  -- redirect. Deleting such a row breaks the redirect and makes
  -- `unmerge_cities` impossible, so it is no longer an unreferenced non-place
  -- and must not be deleted here. `Tunesien` was taken off the list by hand;
  -- this guard catches the next one instead of trusting that it was the last.
  SELECT count(*), coalesce(string_agg(c.name, ', '), '')
    INTO v_merged, v_names
  FROM public.cities c
  JOIN _nonplace_ids t ON t.id = c.id
  WHERE c.duplicate_of_id IS NOT NULL;

  IF v_merged > 0 THEN
    RAISE EXCEPTION 'nonplace delete aborted: % reviewed row(s) were merged away since review (%)', v_merged, v_names;
  END IF;

  RAISE NOTICE 'nonplace delete: % of 57 reviewed rows present', v_present;
END $$;

-- ── 4. Snapshot ─────────────────────────────────────────────────────────────

INSERT INTO public.nonplace_city_deletion_audit (city_id, city_name, country_code, reason, city_row, spine_row, refs)
SELECT
  c.id,
  t.city_name,
  t.country_code,
  t.reason,
  to_jsonb(c),
  (SELECT to_jsonb(g) FROM public.geo_places g WHERE g.id = c.id),
  jsonb_build_object(
    'personality_birth', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'birth_place', p.birth_place)), '[]'::jsonb)
                          FROM public.personalities p WHERE p.city_id = c.id),
    'personality_death', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'death_place', p.death_place)), '[]'::jsonb)
                          FROM public.personalities p WHERE p.death_city_id = c.id)
  )
FROM public.cities c
JOIN _nonplace_ids t ON t.id = c.id;

-- ── 5. Preserve the readable birth place BEFORE its only source disappears ──
--
-- Measured across the whole shell cohort: 75 personalities carry a city_id and
-- no birth_place text at all, so for those the city NAME is the only human-
-- readable record of where the person was born. Six of them sit on these 57.
-- `personalities.country_id` is untouched and stays set, so the person keeps a
-- country either way.

UPDATE public.personalities p
SET birth_place = c.name
FROM public.cities c
JOIN _nonplace_ids t ON t.id = c.id
WHERE p.city_id = c.id
  AND coalesce(p.birth_place, '') = '';

UPDATE public.personalities p
SET death_place = c.name
FROM public.cities c
JOIN _nonplace_ids t ON t.id = c.id
WHERE p.death_city_id = c.id
  AND coalesce(p.death_place, '') = '';

-- ── 6. Clear every pointer the database will not clear itself ───────────────
--
-- No FK covers any of these. A missed column here is a dangling uuid nobody
-- ever gets an error about. Counts measured on prod before writing this:
-- city_quality_signals 494, personalities.city_id 88, content_embeddings 57,
-- city_coverage_gaps 57, image_asset_links 20, city_review_queue_legacy 17,
-- personalities.death_city_id 2. `geo_city_profiles` is NOT listed because its
-- FK to `geo_places` really does CASCADE, and `entity_review_queue` (19) is
-- handled by `trg_erq_cascade`.

UPDATE public.personalities SET city_id = NULL
WHERE city_id IN (SELECT id FROM _nonplace_ids);

UPDATE public.personalities SET death_city_id = NULL
WHERE death_city_id IN (SELECT id FROM _nonplace_ids);

DELETE FROM public.city_quality_signals    WHERE city_id IN (SELECT id FROM _nonplace_ids);
DELETE FROM public.city_coverage_gaps      WHERE city_id IN (SELECT id FROM _nonplace_ids);
DELETE FROM public.city_review_queue_legacy WHERE city_id IN (SELECT id FROM _nonplace_ids);
DELETE FROM public.image_asset_links       WHERE entity_id IN (SELECT id FROM _nonplace_ids);
DELETE FROM public.content_embeddings      WHERE content_type = 'city' AND content_id IN (SELECT id FROM _nonplace_ids);

-- ── 7. Delete ───────────────────────────────────────────────────────────────

DELETE FROM public.cities WHERE id IN (SELECT id FROM _nonplace_ids);

-- ── 8. Assert ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_left      integer;
  v_snapshot  integer;
  v_spine     integer;
  v_personal  integer;
  v_queued    integer;
BEGIN
  SELECT count(*) INTO v_left FROM public.cities c JOIN _nonplace_ids t ON t.id = c.id;
  IF v_left > 0 THEN RAISE EXCEPTION 'nonplace delete: % row(s) survived', v_left; END IF;

  SELECT count(*) INTO v_spine FROM public.geo_places g JOIN _nonplace_ids t ON t.id = g.id;
  IF v_spine > 0 THEN RAISE EXCEPTION 'nonplace delete: % spine row(s) survived', v_spine; END IF;

  SELECT count(*) INTO v_personal
  FROM public.personalities p JOIN _nonplace_ids t ON t.id = p.city_id OR t.id = p.death_city_id;
  IF v_personal > 0 THEN RAISE EXCEPTION 'nonplace delete: % dangling personality pointer(s)', v_personal; END IF;

  SELECT count(*) INTO v_snapshot FROM public.nonplace_city_deletion_audit;
  SELECT count(*) INTO v_queued
  FROM public.search_reindex_queue q JOIN _nonplace_ids t ON t.id = q.entity_id AND q.entity_type = 'city';

  RAISE NOTICE 'nonplace delete done: % snapshotted, % queued for search removal', v_snapshot, v_queued;
END $$;
