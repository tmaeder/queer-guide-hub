-- Venue Tag Vocabulary — apply the Amenity Truth Engine treatment to venues.tags.
--
-- venues.tags held uncontrolled TripAdvisor scraper noise: 2,144 distinct values
-- across 4,370 venues (food ingredients "bacon"/"cauliflower", atmosphere
-- adjectives "casual"/"trendy"/"crowded", source names "misterbandb", geography
-- "park"/"river"). These rendered as clickable /resources/{tag} chips, producing
-- low-value resource pages — exactly the mess the amenity cleanup removed from
-- venues.amenities (2,020 -> 33 distinct).
--
-- Treatment (mirrors _shared/amenity-normalize.ts default-reject):
--   1. Extend the single controlled vocabulary (public.amenities) with a
--      'venue_type' kind — the high-value venue categories (gay-bar, sauna,
--      brewery, …) that only live in tags because venues.category is 30k 'other'.
--   2. normalize_venue_tags(text[]): slugify -> alias -> keep iff canonical is in
--      the queer ∪ venue_type vocabulary, default-reject everything else.
--   3. run_venue_tag_cleanup(batch): reversible, idempotent, batched backfill
--      (≤300 rows/call — trg_search_documents_venue fires per UPDATE and the DB
--      is disk-constrained). Raw tags snapshotted into enrichment_status.
--   4. Wire the normalizer into commit_venue_staging_item (the single ingest
--      write-gate) so scraper noise can never come back. Admin edits stay
--      free-form (trusted).

-- 1 ── extend the controlled vocabulary ─────────────────────────────────────
ALTER TABLE public.amenities DROP CONSTRAINT IF EXISTS amenities_kind_check;
ALTER TABLE public.amenities ADD CONSTRAINT amenities_kind_check
  CHECK (kind = ANY (ARRAY['amenity'::text, 'accessibility'::text, 'queer'::text, 'venue_type'::text]));

INSERT INTO public.amenities (name, icon_name, slug, kind, category_scope, sort_order) VALUES
  ('Gay Bar',          'beer',         'gay-bar',          'venue_type', ARRAY['venue'], 10),
  ('Bar',              'beer',         'bar',              'venue_type', ARRAY['venue'], 11),
  ('Nightclub',        'disc-3',       'nightclub',        'venue_type', ARRAY['venue'], 12),
  ('Sauna',            'flame',        'sauna',            'venue_type', ARRAY['venue'], 13),
  ('Restaurant',       'utensils',     'restaurant',       'venue_type', ARRAY['venue'], 14),
  ('Cafe',             'coffee',       'cafe',             'venue_type', ARRAY['venue'], 15),
  ('Pub',              'beer',         'pub',              'venue_type', ARRAY['venue'], 16),
  ('Lounge',           'sofa',         'lounge',           'venue_type', ARRAY['venue'], 17),
  ('Brewery',          'beer',         'brewery',          'venue_type', ARRAY['venue'], 18),
  ('Beer Bar',         'beer',         'beer-bar',         'venue_type', ARRAY['venue'], 19),
  ('Wine Bar',         'wine',         'wine-bar',         'venue_type', ARRAY['venue'], 20),
  ('Cocktail Bar',     'martini',      'cocktail-bar',     'venue_type', ARRAY['venue'], 21),
  ('Sports Bar',       'trophy',       'sports-bar',       'venue_type', ARRAY['venue'], 22),
  ('Dive Bar',         'beer',         'dive-bar',         'venue_type', ARRAY['venue'], 23),
  ('Gastropub',        'utensils',     'gastropub',        'venue_type', ARRAY['venue'], 24),
  ('Piano Bar',        'piano',        'piano-bar',        'venue_type', ARRAY['venue'], 25),
  ('Jazz Club',        'music',        'jazz-club',        'venue_type', ARRAY['venue'], 26),
  ('Comedy Club',      'mic',          'comedy-club',      'venue_type', ARRAY['venue'], 27),
  ('Music Venue',      'music',        'music-venue',      'venue_type', ARRAY['venue'], 28),
  ('Cabaret',          'drama',        'cabaret',          'venue_type', ARRAY['venue'], 29),
  ('Theater',          'drama',        'theater',          'venue_type', ARRAY['venue'], 30),
  ('Hotel',            'bed-double',   'hotel',            'venue_type', ARRAY['venue','hotel'], 31),
  ('Hostel',           'bed-double',   'hostel',           'venue_type', ARRAY['venue','hotel'], 32),
  ('Guesthouse',       'home',         'guesthouse',       'venue_type', ARRAY['venue','hotel'], 33),
  ('Gym',              'dumbbell',     'gym',              'venue_type', ARRAY['venue'], 34),
  ('Spa',              'sparkles',     'spa',              'venue_type', ARRAY['venue'], 35),
  ('Community Center',  'users',        'community-center', 'venue_type', ARRAY['venue'], 36),
  ('Bookstore',        'book-open',    'bookstore',        'venue_type', ARRAY['venue'], 37),
  ('Beach',            'waves',        'beach',            'venue_type', ARRAY['venue'], 38),
  ('Naturist',         'sun',          'naturist',         'venue_type', ARRAY['venue'], 39)
ON CONFLICT (slug) DO UPDATE SET kind = EXCLUDED.kind, category_scope = EXCLUDED.category_scope,
  name = EXCLUDED.name, icon_name = EXCLUDED.icon_name, is_active = true;

-- 2 ── normalizer: slugify -> alias -> default-reject against the vocabulary ──
CREATE OR REPLACE FUNCTION public.normalize_venue_tags(p_tags text[])
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  -- raw-slug -> canonical-slug. Canonical must exist in the queer ∪ venue_type
  -- vocabulary or it is dropped. Mirrors the alias maps in
  -- supabase/functions/_shared/amenity-normalize.ts.
  v_alias CONSTANT jsonb := '{
    "restaurants":"restaurant","eatery":"restaurant","eateries":"restaurant","bistro":"restaurant","bistros":"restaurant","french-bistros":"restaurant","brasserie":"restaurant","brasseries":"restaurant","diner":"restaurant","diners":"restaurant","theme-restaurant":"restaurant","upstairs-restaurant":"restaurant","vegan-and-vegetarian-restaurant":"restaurant","cafeteria":"cafe",
    "caf":"cafe","coffee":"cafe","coffee-shop":"cafe","coffeeshop":"cafe","coffee-house":"cafe","coffeehouse":"cafe","cafe-coffee-and-tea-house":"cafe","tea-house":"cafe","teahouse":"cafe","tea":"cafe",
    "pubs":"pub","irish-pub":"pub","irish-pubs":"pub","gastropubs":"gastropub","brewpub":"brewery","brewpubs":"brewery",
    "breweries":"brewery","microbrewery":"brewery","taproom":"brewery","tap-room":"brewery",
    "lounges":"lounge",
    "night-club":"nightclub","night-clubs":"nightclub","nightclubs":"nightclub","club":"nightclub","clubs":"nightclub","gay-club":"nightclub","gay-nightclub":"nightclub","disco":"nightclub","discotheque":"nightclub","techno-club":"nightclub",
    "comedy-clubs":"comedy-club","rock-club":"music-venue","live-music-venue":"music-venue","concert-venue":"music-venue",
    "saunas":"sauna","gay-sauna":"sauna","bathhouse":"sauna","bath-house":"sauna","bath-houses":"sauna","gay-bathhouse":"sauna",
    "gay-bars":"gay-bar",
    "hotels":"hotel","gay-hotel":"hotel","hotel-bar":"bar","rooftop-bar":"bar",
    "hostels":"hostel",
    "guest-house":"guesthouse","bed-and-breakfast":"guesthouse","b-and-b":"guesthouse","bnb":"guesthouse","inn":"guesthouse",
    "gyms":"gym","fitness-center":"gym","fitness-centre":"gym",
    "theatre":"theater","theaters":"theater","theatres":"theater","old-theatre":"theater",
    "bookshop":"bookstore","book-shop":"bookstore","book-store":"bookstore","bookstores":"bookstore","bookshops":"bookstore",
    "community-centre":"community-center","lgbt-center":"community-center","lgbtq-center":"community-center","lgbt-centre":"community-center","lgbtq-centre":"community-center","community-space":"community-center","community-centers":"community-center",
    "gay-beach":"beach","nude-beach":"beach","beaches":"beach",
    "nudist":"naturist","nudism":"naturist","nude":"naturist","naked":"naturist","sunbathing":"naturist",
    "sports-bars":"sports-bar","dive-bars":"dive-bar","wine-bars":"wine-bar","beer-bars":"beer-bar","beer-garden":"beer-bar","beer-hall":"beer-bar","cocktail-lounge":"cocktail-bar","piano-bars":"piano-bar","jazz-clubs":"jazz-club",
    "gay-friendly":"queer-friendly","lgbt-friendly":"queer-friendly","lgbtq-friendly":"queer-friendly","lgbtq":"queer-friendly","lgbt":"queer-friendly","lgbtqia":"queer-friendly","lgbtqia+":"queer-friendly","queer":"queer-friendly","gay":"queer-friendly","gay-friendly-venue":"queer-friendly",
    "transgender-friendly":"trans-friendly","transgender-safe-space":"trans-friendly","trans-safe-space":"trans-friendly",
    "gayowned":"gay-owned","lgbt-owned":"lgbtq-owned","queer-owned":"lgbtq-owned",
    "gay-staff":"lgbtq-staff","lgbt-staff":"lgbtq-staff",
    "cruising-area":"cruising","cruisy":"cruising","cruise":"cruising",
    "mens-only":"men-only","men-s-only":"men-only","males-only":"men-only","womens-only":"women-only","women-s-only":"women-only","females-only":"women-only",
    "clothing-optional-accepted":"clothing-optional","clothing-optional-allowed":"clothing-optional"
  }'::jsonb;
  v_keep text[];
  v_raw  text;
  v_slug text;
  v_canon text;
  v_out  text[] := '{}';
BEGIN
  IF p_tags IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(slug) INTO v_keep FROM public.amenities
   WHERE is_active AND kind IN ('queer','venue_type');
  IF v_keep IS NULL THEN v_keep := '{}'; END IF;

  FOREACH v_raw IN ARRAY p_tags LOOP
    v_slug := btrim(regexp_replace(lower(btrim(coalesce(v_raw,''))), '[^a-z0-9]+', '-', 'g'), '-');
    IF v_slug = '' THEN CONTINUE; END IF;
    v_canon := coalesce(v_alias->>v_slug, v_slug);
    IF v_canon = ANY(v_keep) AND NOT (v_canon = ANY(v_out)) THEN
      v_out := v_out || v_canon;
    END IF;
  END LOOP;

  RETURN (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(v_out) x);
END;
$$;

-- 3 ── reversible, idempotent, batched backfill ─────────────────────────────
CREATE OR REPLACE FUNCTION public.run_venue_tag_cleanup(p_batch integer DEFAULT 300)
RETURNS TABLE(processed integer, dropped_terms integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  r       RECORD;
  v_new   text[];
  v_proc  integer := 0;
  v_drop  integer := 0;
BEGIN
  FOR r IN
    SELECT id, tags FROM public.venues
     WHERE tags IS NOT NULL AND cardinality(tags) > 0
       AND public.normalize_venue_tags(tags) IS DISTINCT FROM tags
     ORDER BY id
     LIMIT GREATEST(p_batch, 1)
  LOOP
    v_new  := public.normalize_venue_tags(r.tags);
    v_proc := v_proc + 1;
    v_drop := v_drop + GREATEST(cardinality(r.tags) - cardinality(v_new), 0);
    UPDATE public.venues SET
      tags = v_new,
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{tags_cleanup}',
        jsonb_build_object('at', now(), 'raw', to_jsonb(r.tags)), true)
    WHERE id = r.id;
  END LOOP;
  processed := v_proc; dropped_terms := v_drop; RETURN NEXT;
END;
$$;

-- 4 ── perpetual guard at the single ingest write-gate ──────────────────────
CREATE OR REPLACE FUNCTION public.commit_venue_staging_item(p_staging_id uuid, p_actor text DEFAULT 'pipeline-commit'::text)
 RETURNS TABLE(venue_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_stage       RECORD;
  v_norm        JSONB;
  v_enr         JSONB;
  v_loc         JSONB;
  v_contacts    JSONB;
  v_meta        JSONB;
  v_source_slug TEXT;
  v_source_eid  TEXT;
  v_phone       TEXT;
  v_email       TEXT;
  v_website     TEXT;
  v_phone_n     TEXT;
  v_email_n     TEXT;
  v_domain      TEXT;
  v_name        TEXT;
  v_existing_id UUID;
  v_city_id     UUID;
  v_country_id  UUID;
  v_lat         NUMERIC;
  v_lng         NUMERIC;
  v_address     TEXT;
  v_category    TEXT;
  v_description TEXT;
  v_hours       JSONB;
  v_tags        TEXT[];
  v_images      TEXT[];
  v_relevance   NUMERIC;
  v_payload     JSONB;
  v_hash        TEXT;
  v_lock_key    BIGINT;
  v_action      TEXT;
  v_result_id   UUID;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'venues' THEN RAISE EXCEPTION 'not_a_venue_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text;
    RETURN;
  END IF;

  v_norm     := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr      := coalesce(v_stage.enriched_data,   '{}'::jsonb);
  v_loc      := coalesce(v_norm->'location', '{}'::jsonb);
  v_contacts := coalesce(v_norm->'contacts', '{}'::jsonb);
  v_meta     := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);

  v_name        := nullif(btrim(v_norm->>'name'), '');
  v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description')), '');
  v_address     := nullif(btrim(v_loc->>'address'), '');
  v_lat         := nullif(v_loc->>'lat','')::numeric;
  v_lng         := nullif(v_loc->>'lng','')::numeric;
  v_category    := coalesce(nullif(v_norm->>'category',''), 'unknown');

  v_hours  := CASE WHEN jsonb_typeof(v_norm->'hours') = 'object' THEN v_norm->'hours' END;
  -- Default-reject scraper tag noise against the controlled vocabulary so it can
  -- never re-enter venues.tags via ingestion (see normalize_venue_tags).
  v_tags   := CASE WHEN jsonb_typeof(v_norm->'tags')   = 'array'
                   THEN public.normalize_venue_tags(array(SELECT jsonb_array_elements_text(v_norm->'tags'))) END;
  v_images := CASE WHEN jsonb_typeof(v_norm->'images') = 'array'
                   THEN array(SELECT jsonb_array_elements_text(v_norm->'images')) END;
  v_relevance := nullif(coalesce(
                   v_norm->>'lgbti_relevance_score',
                   v_enr->>'lgbtq_relevance_score',
                   v_enr->>'lgbti_relevance_score'), '')::numeric;

  v_phone   := nullif(btrim(v_contacts->>'phone'), '');
  v_email   := nullif(btrim(v_contacts->>'email'), '');
  v_website := nullif(btrim(v_contacts->>'website'), '');
  v_phone_n := public.normalize_phone(v_phone);
  v_email_n := lower(v_email);
  v_domain  := public.extract_website_domain(v_website);

  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'source_id');

  IF v_name IS NULL THEN RAISE EXCEPTION 'venue_missing_name: staging=%', p_staging_id; END IF;

  v_lock_key := hashtextextended(
    coalesce(v_phone_n, v_email_n, v_domain, public.normalize_name(v_name)), 0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_source_eid IS NOT NULL THEN
    SELECT vs.venue_id INTO v_existing_id FROM public.venue_sources vs
    WHERE vs.source_slug = v_source_slug AND vs.source_entity_id = v_source_eid LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'venues') = 'venues'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;

  IF v_loc->>'city' IS NOT NULL AND length(btrim(v_loc->>'city')) > 0 THEN
    IF nullif(btrim(v_loc->>'country'),'') IS NOT NULL THEN
      SELECT id INTO v_country_id FROM public.countries
      WHERE duplicate_of_id IS NULL
        AND (upper(code) = upper(btrim(v_loc->>'country'))
             OR lower(name) = lower(btrim(v_loc->>'country')))
      LIMIT 1;
    END IF;

    IF v_country_id IS NOT NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.country_id = v_country_id
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_city_id IS NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.venues (
      name, description, address, city, country, latitude, longitude,
      phone, email, website, category, city_id,
      hours, tags, images, lgbti_relevance_score,
      data_source, external_id, last_synced_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_description, coalesce(v_address, v_name),
      nullif(v_loc->>'city',''),
      coalesce(nullif(v_loc->>'country',''), ''),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id,
      v_hours, v_tags, v_images, v_relevance,
      v_source_slug, v_source_eid, now(), now(), now(), now()
    ) RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    UPDATE public.venues SET
      description = coalesce(description, v_description),
      address     = coalesce(nullif(address,''), v_address, address),
      phone       = coalesce(phone, v_phone),
      email       = coalesce(email, v_email),
      website     = coalesce(website, v_website),
      latitude    = coalesce(latitude, v_lat),
      longitude   = coalesce(longitude, v_lng),
      city_id     = coalesce(city_id, v_city_id),
      hours       = coalesce(hours, v_hours),
      lgbti_relevance_score = coalesce(lgbti_relevance_score, v_relevance),
      category    = CASE WHEN coalesce(lower(category),'') IN ('','other','unknown')
                          AND v_category NOT IN ('unknown','other')
                         THEN v_category ELSE category END,
      tags        = CASE WHEN v_tags IS NULL THEN tags
                         ELSE public.normalize_venue_tags(
                                array(SELECT DISTINCT e FROM unnest(coalesce(tags,'{}'::text[]) || v_tags) e
                                      WHERE e IS NOT NULL AND e <> '')) END,
      images      = CASE WHEN v_images IS NULL THEN images
                         ELSE array(SELECT DISTINCT e FROM unnest(coalesce(images,'{}'::text[]) || v_images) e
                                    WHERE e IS NOT NULL AND e <> '') END,
      last_refreshed_at = now(), updated_at = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id;
    v_action    := 'updated';
  END IF;

  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.venue_sources (
      venue_id, source_slug, source_entity_id, source_url, payload, payload_hash,
      confidence, is_primary, first_seen_at, last_seen_at
    ) VALUES (
      v_result_id, v_source_slug, v_source_eid,
      nullif(btrim(v_meta->>'url'), ''), v_payload, v_hash,
      coalesce(v_stage.ai_confidence_score, 1.0),
      v_action = 'inserted', now(), now()
    )
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET
      payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash,
      confidence = EXCLUDED.confidence, last_seen_at = now();
  END IF;

  UPDATE public.ingestion_staging SET
    disposition = v_action, target_record_id = v_result_id,
    processed_at = now(), updated_at = now()
  WHERE id = p_staging_id;

  INSERT INTO public.ingestion_events (staging_id, venue_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, v_result_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid, 'action', v_action));

  RETURN QUERY SELECT v_result_id, v_action;
END;
$function$;
