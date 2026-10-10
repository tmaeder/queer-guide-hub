-- Delete the `Hinterzarten` placeholder city row.
--
-- Hinterzarten is a real Gemeinde (Breisgau-Hochschwarzwald) made of several
-- Ortsteile (Alpersbach, Bisten, Erlenbruck, Windeck, ...). The row being
-- deleted is NOT that municipality as a curated entity: it is a shell minted on
-- 2026-06-10 by the retired `match_personality_city()` trigger from one
-- personality's birth-place text ('Hinterzarten, Freiburg (DE)'). It carries a
-- `tmp-` slug, no wikidata_qid, no coordinates, no population, is
-- `seo_indexable = false` and `shell_status = 'placeholder'`.
--
-- Measured on prod before writing (2026-10-09): exactly ONE pointer of
-- substance, `personalities.city_id` on Hans Winterhalter (draft), whose
-- `birth_place` text survives the delete. Everything else is residue of the
-- shell itself: city_quality_signals 7, content_embeddings 1, city_coverage_gaps
-- 1, image_asset_links 1 (a Pexels photo of a Munich pride parade — wrong
-- subject), search_documents 1. venues / events / hotels / organizations /
-- queer_villages / news / city_aliases / duplicate_of_id children: 0.
--
-- Decision (user, 2026-10-09): delete it and unlink the personality. A future
-- resolution of Hinterzarten or one of its Ortsteile goes through
-- `city_resolve_or_create`, which needs real evidence (coordinates / QID) to
-- create a row and resolves an Ortsteil onto its Gemeinde (see
-- `*_city_locality_resolves_to_municipality.sql`).
--
-- Pattern copied from 20261001120000_delete_nonplace_city_shells.sql and its
-- audit table is reused: the snapshot there is the only way back.
--
-- Soft on preconditions, hard on postconditions: a row that is already gone is
-- the desired state (no-op); a row that has since gained content, an identity
-- (QID) or been merged is no longer the row that was reviewed and aborts.

DROP TABLE IF EXISTS _hz_ids;
CREATE TEMP TABLE _hz_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _hz_ids VALUES ('4c3590e0-7cb8-4764-878c-dedcf431e6f5'::uuid);

-- Whether the row existed at apply time. On a rebuild from zero it never does
-- (it was data, not schema), so the audit postcondition must not demand a
-- snapshot there.
DROP TABLE IF EXISTS _hz_present;
CREATE TEMP TABLE _hz_present ON COMMIT DROP AS
  SELECT count(*)::int AS n FROM public.cities c JOIN _hz_ids t ON t.id = c.id;

-- ── 1. Guard ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_present integer;
  v_bad     integer;
  v_why     text;
BEGIN
  SELECT count(*) INTO v_present FROM public.cities c JOIN _hz_ids t ON t.id = c.id;
  IF v_present = 0 THEN
    RAISE NOTICE 'hinterzarten delete: row already absent, nothing to do';
    RETURN;
  END IF;

  SELECT count(*),
         string_agg(concat_ws(',',
           CASE WHEN c.duplicate_of_id IS NOT NULL THEN 'merged' END,
           CASE WHEN c.wikidata_qid IS NOT NULL THEN 'has_qid' END,
           CASE WHEN c.name NOT ILIKE 'hinterzarten' THEN 'renamed' END), ';')
    INTO v_bad, v_why
  FROM public.cities c JOIN _hz_ids t ON t.id = c.id
  WHERE c.duplicate_of_id IS NOT NULL
     OR c.wikidata_qid IS NOT NULL
     OR c.name NOT ILIKE 'hinterzarten'
     OR EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = c.id)
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
     OR EXISTS (SELECT 1 FROM public.user_travel_preferences u WHERE u.home_city_id = c.id)
     OR EXISTS (SELECT 1 FROM public.cities d WHERE d.duplicate_of_id = c.id)
     OR EXISTS (SELECT 1 FROM public.city_aliases a WHERE a.city_id = c.id);

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'hinterzarten delete aborted: row changed since review (%)', coalesce(nullif(v_why, ''), 'gained content');
  END IF;
END $$;

-- ── 2. Snapshot (the only surviving copy) ───────────────────────────────────

INSERT INTO public.nonplace_city_deletion_audit (city_id, city_name, country_code, reason, city_row, spine_row, refs)
SELECT
  c.id,
  c.name,
  (SELECT co.code FROM public.countries co WHERE co.id = c.country_id),
  'municipality_placeholder_no_identity',
  to_jsonb(c),
  (SELECT to_jsonb(g) FROM public.geo_places g WHERE g.id = c.id),
  jsonb_build_object(
    'personality_birth', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'birth_place', p.birth_place)), '[]'::jsonb)
                          FROM public.personalities p WHERE p.city_id = c.id),
    'personality_death', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'death_place', p.death_place)), '[]'::jsonb)
                          FROM public.personalities p WHERE p.death_city_id = c.id)
  )
FROM public.cities c
JOIN _hz_ids t ON t.id = c.id;

-- ── 3. Keep the readable place text before its only source disappears ───────

UPDATE public.personalities p SET birth_place = c.name
FROM public.cities c JOIN _hz_ids t ON t.id = c.id
WHERE p.city_id = c.id AND coalesce(p.birth_place, '') = '';

UPDATE public.personalities p SET death_place = c.name
FROM public.cities c JOIN _hz_ids t ON t.id = c.id
WHERE p.death_city_id = c.id AND coalesce(p.death_place, '') = '';

-- ── 4. Clear every pointer no FK clears ─────────────────────────────────────

UPDATE public.personalities SET city_id = NULL WHERE city_id IN (SELECT id FROM _hz_ids);
UPDATE public.personalities SET death_city_id = NULL WHERE death_city_id IN (SELECT id FROM _hz_ids);

DELETE FROM public.city_quality_signals     WHERE city_id IN (SELECT id FROM _hz_ids);
DELETE FROM public.city_coverage_gaps       WHERE city_id IN (SELECT id FROM _hz_ids);
DELETE FROM public.city_review_queue_legacy WHERE city_id IN (SELECT id FROM _hz_ids);
DELETE FROM public.image_asset_links        WHERE entity_id IN (SELECT id FROM _hz_ids);
DELETE FROM public.content_embeddings       WHERE content_type = 'city' AND content_id IN (SELECT id FROM _hz_ids);

-- ── 5. Delete (spine + search follow via trg_sync_geo_spine / reindex queue) ─

DELETE FROM public.cities WHERE id IN (SELECT id FROM _hz_ids);

-- ── 6. Assert the reached state ─────────────────────────────────────────────

DO $$
DECLARE
  v_left     integer;
  v_spine    integer;
  v_personal integer;
  v_audit    integer;
BEGIN
  SELECT count(*) INTO v_left FROM public.cities c JOIN _hz_ids t ON t.id = c.id;
  IF v_left <> 0 THEN RAISE EXCEPTION 'hinterzarten delete: row survived'; END IF;

  SELECT count(*) INTO v_spine FROM public.geo_places g JOIN _hz_ids t ON t.id = g.id;
  IF v_spine <> 0 THEN RAISE EXCEPTION 'hinterzarten delete: spine row survived'; END IF;

  SELECT count(*) INTO v_personal
  FROM public.personalities p JOIN _hz_ids t ON t.id = p.city_id OR t.id = p.death_city_id;
  IF v_personal <> 0 THEN RAISE EXCEPTION 'hinterzarten delete: % dangling personality pointer(s)', v_personal; END IF;

  SELECT count(*) INTO v_audit
  FROM public.nonplace_city_deletion_audit a JOIN _hz_ids t ON t.id = a.city_id;
  IF (SELECT n FROM _hz_present) > 0 AND v_audit < 1 THEN RAISE EXCEPTION 'hinterzarten delete: no audit snapshot'; END IF;
END $$;
