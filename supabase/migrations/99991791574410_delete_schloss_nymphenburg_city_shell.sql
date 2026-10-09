-- Delete the `cities` row "Schloss Nymphenburg, München" — a palace, not a city.
--
-- Producer: `data_source = 'personality-birth-place'` minted it on 2026-06-10
-- from the free-text birth place of Ludwig II. von Bayern
-- ("Schloss Nymphenburg, München (DE)"). Same producer as the 57 non-places of
-- 20261001120000_delete_nonplace_city_shells.sql. The row was a `placeholder`
-- with a tmp- slug, no QID, no coordinates and no venues/events/hotels/villages,
-- but it was live in `search_documents`, so site search offered a palace as a
-- city.
--
-- Unlike that pass, the one referrer is REPOINTED rather than nulled: the
-- palace sits inside Munich, so `Munich` (fb46a103…, Q1726) is the correct
-- city for Ludwig II.'s birth. `birth_place` text is kept — it is correct.
--
-- Measured before writing: personalities.city_id 1, city_quality_signals 6,
-- city_coverage_gaps 1, content_embeddings 1, search_documents 1, geo_places 1
-- (no children), everything else 0. `cities.id` has no FK that would clear
-- these, so each is handled explicitly. search_documents is removed by the
-- delete trigger chain (geo spine -> search_reindex_queue -> drain).
--
-- Soft on preconditions: an already-deleted row is a no-op. Hard on
-- postconditions.

SELECT set_config('app.actor', 'migration:99991791574410_delete_schloss_nymphenburg_city_shell', true);

DO $$
DECLARE
  c_shell   constant uuid := 'b576ff9c-3f1d-478b-b044-73083555a36d';
  c_munich  constant uuid := 'fb46a103-3465-4112-ae6f-e999722f70fb';
  v_row     public.cities%ROWTYPE;
  v_n       integer;
BEGIN
  SELECT * INTO v_row FROM public.cities WHERE id = c_shell;
  IF NOT FOUND THEN
    RAISE NOTICE 'schloss nymphenburg: row already gone, nothing to do';
    RETURN;
  END IF;

  IF v_row.duplicate_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'schloss nymphenburg aborted: row was merged away since review';
  END IF;

  SELECT (SELECT count(*) FROM public.venues WHERE city_id = c_shell)
       + (SELECT count(*) FROM public.events WHERE city_id = c_shell)
       + (SELECT count(*) FROM public.hotels WHERE city_id = c_shell)
       + (SELECT count(*) FROM public.queer_villages WHERE city_id = c_shell)
  INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'schloss nymphenburg aborted: row gained % piece(s) of content since review', v_n;
  END IF;

  PERFORM 1 FROM public.cities WHERE id = c_munich AND duplicate_of_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'schloss nymphenburg aborted: repoint target Munich missing or merged';
  END IF;

  -- Snapshot: the only way back.
  INSERT INTO public.nonplace_city_deletion_audit (city_id, city_name, country_code, reason, city_row, spine_row, refs)
  SELECT c.id, c.name, 'DE',
         'landmark (palace) misfiled as city by personality-birth-place; personality repointed to Munich',
         to_jsonb(c),
         (SELECT to_jsonb(g) FROM public.geo_places g WHERE g.id = c.id),
         jsonb_build_object(
           'repointed_to', c_munich,
           'personality_birth', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'birth_place', p.birth_place)), '[]'::jsonb)
                                 FROM public.personalities p WHERE p.city_id = c.id),
           'personality_death', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'death_place', p.death_place)), '[]'::jsonb)
                                 FROM public.personalities p WHERE p.death_city_id = c.id))
  FROM public.cities c WHERE c.id = c_shell;

  -- Repoint, never null: the palace is in Munich.
  UPDATE public.personalities SET city_id = c_munich WHERE city_id = c_shell;
  UPDATE public.personalities SET death_city_id = c_munich WHERE death_city_id = c_shell;

  -- Pointers no FK clears.
  DELETE FROM public.city_quality_signals     WHERE city_id = c_shell;
  DELETE FROM public.city_coverage_gaps       WHERE city_id = c_shell;
  DELETE FROM public.city_review_queue_legacy WHERE city_id = c_shell;
  DELETE FROM public.image_asset_links        WHERE entity_id = c_shell;
  DELETE FROM public.content_embeddings       WHERE content_type = 'city' AND content_id = c_shell;

  DELETE FROM public.cities WHERE id = c_shell;

  -- Postconditions.
  SELECT count(*) INTO v_n FROM public.cities WHERE id = c_shell;
  IF v_n > 0 THEN RAISE EXCEPTION 'schloss nymphenburg: city row survived'; END IF;

  SELECT count(*) INTO v_n FROM public.geo_places WHERE id = c_shell;
  IF v_n > 0 THEN RAISE EXCEPTION 'schloss nymphenburg: spine row survived'; END IF;

  SELECT count(*) INTO v_n FROM public.personalities WHERE city_id = c_shell OR death_city_id = c_shell;
  IF v_n > 0 THEN RAISE EXCEPTION 'schloss nymphenburg: % dangling personality pointer(s)', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.personalities WHERE slug = 'ludwig-ii-von-bayern' AND city_id <> c_munich;
  IF v_n > 0 THEN RAISE EXCEPTION 'schloss nymphenburg: Ludwig II. not on Munich'; END IF;

  SELECT count(*) INTO v_n FROM public.nonplace_city_deletion_audit WHERE city_id = c_shell;
  IF v_n <> 1 THEN RAISE EXCEPTION 'schloss nymphenburg: expected 1 audit snapshot, found %', v_n; END IF;

  RAISE NOTICE 'schloss nymphenburg: deleted, referrer repointed to Munich';
END $$;
