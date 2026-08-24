-- Merge the 14 "queer village" rows that are not districts but whole cities.
--
-- `queer_villages` is the district/Stadtteil entity. 14 of its 190 rows carry
-- the SAME name as their parent city (West Hollywood, Palm Springs,
-- Provincetown, Wilton Manors, Sitges, Rehoboth Beach, Ogunquit, Saugatuck,
-- Guerneville, Asbury Park, Hudson, New Hope, Northampton, Pine City) — gay
-- resort towns that were imported as if the town were a neighbourhood of
-- itself. Each one publishes a second competing page (`/villages/x` next to
-- `/city/x`) about the same place, and between them they hold 123 venues and
-- 14 hotels whose district pointer means nothing.
--
-- The decision (2026-08-24) is a HARD merge into the city: the village row is
-- deleted, not archived.
--
-- Why a new function rather than `_queer_village_merge_core`: that core is
-- village->village. There is no village->city path, and the FK topology makes
-- the order load-bearing — `venues.queer_village_id`, `events.queer_village_id`
-- and `hotels.queer_village_id` reference `geo_village_profiles(place_id)` with
-- NO `ON DELETE`, so a DELETE before unlinking simply errors.
--
-- Why the audit table rather than `entity_merge_audit`: that table is keyed
-- (entity_type, keep_id, drop_id) with both ids the same type, and
-- `unmerge_entities` dispatches off it — a row whose keep_id is a CITY would be
-- handed to the village unmerge path. It also has no room for a full snapshot,
-- and a snapshot is the whole point here: `cities` has NO `history` column,
-- while all 14 villages carry 205-1375 characters of queer local history. That
-- prose has nowhere to land on the city page and would otherwise be destroyed.
-- `village_row` is its only remaining copy. (Rendering it needs a
-- `cities.queer_history` column — deliberately a separate decision.)
--
-- The redirect does NOT live in `village_slug_redirects`: that table cascades
-- away with the deleted spine row, and it only ever resolves to another
-- `/villages/:slug`. Cross-type redirects are 301s in `public/_redirects`
-- (same shape as the `/cities/:slug -> /city/:slug` rule already there) plus
-- the client-side map in `src/lib/mergedVillageRedirects.ts`.

-- ── 1. Audit ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.village_city_merge_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id   uuid NOT NULL,          -- deliberately NO FK: the row is gone
  city_id      uuid NOT NULL,          -- no FK either: this is a historical record
  village_slug text NOT NULL,
  city_slug    text NOT NULL,
  village_row  jsonb NOT NULL,         -- full snapshot, incl. `history`
  unlinked     jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor        uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.village_city_merge_audit IS
  'One row per queer_villages row hard-merged into its city. village_row is the ONLY surviving copy of the deleted row (notably `history`, which cities cannot hold).';

CREATE INDEX IF NOT EXISTS idx_village_city_merge_audit_village
  ON public.village_city_merge_audit (village_id);

ALTER TABLE public.village_city_merge_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.village_city_merge_audit FROM anon, authenticated;
GRANT ALL ON TABLE public.village_city_merge_audit TO service_role;

-- ── 2. The merge ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.merge_village_into_city(
  p_village_id uuid,
  p_city_id    uuid,
  p_actor      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_village public.queer_villages%ROWTYPE;
  v_city    record;
  v_venues  int := 0;
  v_hotels  int := 0;
  v_events  int := 0;
  v_trips   int := 0;
  v_filled  jsonb := '{}'::jsonb;
  v_stamp   jsonb;
BEGIN
  SELECT * INTO v_village FROM public.queer_villages WHERE id = p_village_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_village_into_city: village % not found', p_village_id;
  END IF;

  SELECT id, slug, description, image_url, editorial_hook, field_provenance
    INTO v_city
    FROM public.cities WHERE id = p_city_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_village_into_city: city % not found', p_city_id;
  END IF;

  -- The village must actually belong to the city it is merged into. Without
  -- this a typo silently strands 39 venues.
  IF v_village.city_id IS DISTINCT FROM p_city_id THEN
    RAISE EXCEPTION 'merge_village_into_city: village % sits in city %, not %',
      p_village_id, v_village.city_id, p_city_id;
  END IF;

  -- Children: keep the city, drop the district pointer. `city_id` is only
  -- FILLED where empty, never overwritten — 2 of the 123 venues carry a
  -- city_id that disagrees with the village's, and the venue's own value is
  -- the more trustworthy of the two.
  UPDATE public.venues
     SET city_id = COALESCE(city_id, v_village.city_id), queer_village_id = NULL
   WHERE queer_village_id = p_village_id;
  GET DIAGNOSTICS v_venues = ROW_COUNT;

  UPDATE public.hotels
     SET city_id = COALESCE(city_id, v_village.city_id), queer_village_id = NULL
   WHERE queer_village_id = p_village_id;
  GET DIAGNOSTICS v_hotels = ROW_COUNT;

  UPDATE public.events
     SET city_id = COALESCE(city_id, v_village.city_id), queer_village_id = NULL
   WHERE queer_village_id = p_village_id;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  UPDATE public.trip_destinations SET village_id = NULL WHERE village_id = p_village_id;
  GET DIAGNOSTICS v_trips = ROW_COUNT;

  -- Editorial: fill EMPTY city columns from the village, never overwrite.
  v_stamp := jsonb_build_object(
    'source', 'merged:queer_village',
    'village_id', p_village_id,
    'village_slug', v_village.slug,
    'at', to_jsonb(now())
  );
  IF v_city.description IS NULL AND NULLIF(v_village.description, '') IS NOT NULL THEN
    v_filled := v_filled || jsonb_build_object('description', v_stamp);
  END IF;
  IF v_city.image_url IS NULL AND v_village.image_url IS NOT NULL THEN
    v_filled := v_filled || jsonb_build_object('image_url', v_stamp);
  END IF;
  IF v_city.editorial_hook IS NULL AND NULLIF(v_village.editorial_hook, '') IS NOT NULL THEN
    v_filled := v_filled || jsonb_build_object('editorial_hook', v_stamp);
  END IF;

  IF v_filled <> '{}'::jsonb THEN
    UPDATE public.cities c
       SET description      = COALESCE(c.description, NULLIF(v_village.description, '')),
           image_url        = COALESCE(c.image_url, v_village.image_url),
           editorial_hook   = COALESCE(c.editorial_hook, NULLIF(v_village.editorial_hook, '')),
           field_provenance = COALESCE(c.field_provenance, '{}'::jsonb) || v_filled
     WHERE c.id = p_city_id;
  END IF;

  INSERT INTO public.village_city_merge_audit
    (village_id, city_id, village_slug, city_slug, village_row, unlinked, actor)
  VALUES (
    p_village_id, p_city_id, v_village.slug, v_city.slug,
    to_jsonb(v_village),
    jsonb_build_object('venues', v_venues, 'hotels', v_hotels, 'events', v_events,
                       'trip_destinations', v_trips, 'city_fields_filled', v_filled),
    p_actor
  );

  -- `trg_sync_geo_spine` removes geo_places/geo_village_profiles, which
  -- cascades village_slug_redirects / village_quality_signals /
  -- village_coverage_gaps / village_review_queue_legacy, and fires
  -- trg_search_documents_village_del. That last one ENQUEUES into
  -- search_reindex_queue rather than deleting inline (pipeline overhaul P1), so
  -- the search document survives this transaction and disappears on the next
  -- search_reindex_drain minute -- verified in a rolled-back dry run, not
  -- assumed.
  DELETE FROM public.queer_villages WHERE id = p_village_id;

  RETURN jsonb_build_object(
    'village_id', p_village_id, 'village_slug', v_village.slug,
    'city_id', p_city_id, 'city_slug', v_city.slug,
    'venues', v_venues, 'hotels', v_hotels, 'events', v_events,
    'trip_destinations', v_trips, 'city_fields_filled', v_filled
  );
END; $$;

ALTER FUNCTION public.merge_village_into_city(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_village_into_city(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_village_into_city(uuid, uuid, uuid) TO service_role;

-- ── 3. One-shot: the 14 reviewed rows ───────────────────────────────────────
--
-- Pinned to an explicit slug list rather than re-deriving
-- `dedup_despace(v.name) = dedup_despace(c.name)` at apply time. The predicate
-- is how the 14 were FOUND, but a village added between authoring and CI would
-- silently widen a destructive one-shot. These 14 were each read by hand.

DO $$
DECLARE
  v_slugs text[] := ARRAY[
    'asbury-park','guerneville','hudson-ny','new-hope-pa','northampton','ogunquit',
    'palm-springs','pine-city','provincetown','rehoboth-beach','saugatuck','sitges',
    'west-hollywood','wilton-manors'
  ];
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT v.id AS village_id, v.city_id, v.slug
    FROM public.queer_villages v
    WHERE v.slug = ANY(v_slugs)
    ORDER BY v.slug
  LOOP
    PERFORM public.merge_village_into_city(r.village_id, r.city_id, NULL);
    n := n + 1;
  END LOOP;

  IF n > array_length(v_slugs, 1) THEN
    RAISE EXCEPTION 'village->city one-shot matched % rows for % slugs', n, array_length(v_slugs, 1);
  END IF;
  RAISE NOTICE 'merged % of % village rows into their city', n, array_length(v_slugs, 1);
END $$;
