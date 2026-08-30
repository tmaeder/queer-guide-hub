-- Record-keeping only: bring `commit_hotel_staging_batch` onto the migration path.
--
-- The function exists in the live database and is referenced by
-- `20260822100000_revoke_anon_on_admin_rpcs.sql:89` and
-- `20260823100000_revoke_authenticated_on_cron_rpcs.sql:61`, but there is no
-- CREATE for it anywhere in `supabase/migrations/` or the baseline. It was
-- created outside the migration path.
--
-- ── Dating it, and why recovery is a reconstruction and not a byte recovery ──
--
-- `git log --all -S` puts the string's first appearance in the repo at
-- 2d31528ed (2026-06-10 14:07 UTC), a routine `types.ts` regeneration; the
-- previous regeneration d9bae2950 (2026-06-07 15:33 UTC) does not contain it.
-- So the function entered prod inside that 71-hour window — which straddles
-- 2026-06-10, the day of the 34-duplicate-version history repair (PR #1553).
--
-- The documented recovery route is to pull the bytes out of
-- `supabase_migrations.schema_migrations.statements` and prove them with an md5.
-- **That route does not exist here.** Searched every applied migration:
--
--   select version from supabase_migrations.schema_migrations
--    where array_to_string(statements, E'\n') ilike '%commit_hotel_staging_batch%';
--   → only 20260822100000 and 20260823100000, i.e. the two revokes.
--
-- No applied migration ever created it, so it was raw Management-API SQL, which
-- records no history. The body below is therefore transcribed from the live
-- `pg_get_functiondef` rather than recovered from `statements`.
--
-- It is nonetheless PROVEN byte-exact, not merely plausible. Verified without
-- touching the real function: the body was declared into a scratch schema on
-- prod, its own `pg_get_functiondef` re-rendered with the schema name
-- substituted back, and the md5 compared to the live one —
--
--   reconstructed 2cbfe3e20df787bb5a5d66fbc7f6f215
--   live          2cbfe3e20df787bb5a5d66fbc7f6f215   → equal
--
-- then `drop schema _recovery_check cascade` (confirmed 0 rows left in
-- information_schema.schemata). A scratch schema rather than the documented
-- BEGIN/ROLLBACK because a rollback that silently does not take would have
-- replaced a live function with an unverified transcription — the scratch
-- schema cannot reach `public.commit_hotel_staging_batch` even on failure.
--
-- ── It has never committed a single row, and cannot ─────────────────────────
--
-- Its work loop selects `ingestion_staging WHERE target_table = 'hotels'`.
-- Hotels have no `target_table` of their own — they stage as `target_table =
-- 'venues'` and are discriminated by entity type. Measured on prod: the
-- distinct values of `ingestion_staging.target_table` are news_articles,
-- marketplace_listings, venues, events, personalities, cities, countries.
-- There is no 'hotels'. The loop matches zero rows and always has.
--
-- Nothing calls it either. `_shared/content-registry.ts:96-106` files hotels as
-- `commit: { kind: 'via', type: 'venue' }` — the shipped hotel commit path is
-- `commit_venue_staging_item`, extended with the hotel columns by
-- `20260415130100_hotel_commit_extension.sql`. No edge function, script, worker
-- or frontend file references the batch variant.
--
-- So this migration deliberately changes NOTHING at runtime. It exists so the
-- object is reviewable and so `db push` on a fresh database produces the same
-- schema as prod. **Do not wire it up on the strength of its name** — it writes
-- a `public.hotels` shape that the live pipeline does not produce, and adopting
-- it would be a design decision, not a bug fix.
--
-- CREATE OR REPLACE preserves the ACL of an existing function, so on prod this
-- is a no-op for grants; the REVOKEs at the end restate
-- 20260822100000/20260823100000 so a fresh database lands in the same place
-- rather than inheriting the default EXECUTE-to-PUBLIC.

CREATE OR REPLACE FUNCTION public.commit_hotel_staging_batch(
  p_limit integer DEFAULT 50,
  p_pipeline_run_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(staging_id uuid, hotel_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row RECORD; v_norm JSONB; v_enr JSONB; v_meta JSONB; v_loc JSONB; v_con JSONB; v_class JSONB;
  v_name TEXT; v_desc TEXT; v_type TEXT; v_address TEXT; v_city TEXT; v_country TEXT;
  v_lat DOUBLE PRECISION; v_lng DOUBLE PRECISION; v_city_id UUID; v_country_id UUID;
  v_phone TEXT; v_email TEXT; v_website TEXT; v_booking TEXT;
  v_images TEXT[]; v_amenities TEXT[]; v_price INT; v_stars NUMERIC;
  v_lgbtq BOOLEAN; v_safety TEXT; v_slug TEXT;
  v_src TEXT; v_eid TEXT; v_payload JSONB; v_hash TEXT;
  v_lock_key BIGINT; v_existing_id UUID; v_action TEXT; v_result_id UUID;
  c_types CONSTANT TEXT[] := ARRAY['hotel','bnb','hostel','guesthouse','apartment','resort','other'];
  uuid_rx CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  FOR v_row IN
    SELECT s.* FROM public.ingestion_staging s
     WHERE s.target_table = 'hotels'
       AND s.disposition = 'pending'
       AND s.ai_validation_status = 'approved'
       AND (s.dedup_status IN ('unique','duplicate') OR s.dedup_status IS NULL)
       AND s.review_status IN ('auto','approved')
       AND (p_pipeline_run_id IS NULL OR s.pipeline_run_id = p_pipeline_run_id)
     ORDER BY s.created_at ASC
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_norm := coalesce(v_row.normalized_data, '{}'::jsonb);
      v_enr  := coalesce(v_row.enriched_data,   '{}'::jsonb);
      v_meta := coalesce(v_norm->'metadata', v_row.raw_data, '{}'::jsonb);
      v_loc  := coalesce(v_norm->'location', '{}'::jsonb);
      v_con  := coalesce(v_norm->'contacts', '{}'::jsonb);
      v_class:= coalesce(v_row.classification_result, '{}'::jsonb);

      v_name := nullif(btrim(coalesce(v_norm->>'name', v_norm->>'title', v_meta->>'name')), '');
      v_desc := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description', v_meta->>'description')), '');

      v_type := lower(nullif(btrim(coalesce(v_norm->>'hotel_type', v_norm->>'accommodation_type',
                  v_meta->>'accommodation_type', v_meta->>'hotel_type')), ''));
      IF v_type IS NULL OR NOT (v_type = ANY(c_types)) THEN
        v_type := CASE WHEN v_type IN ('b&b','b and b','bed and breakfast') THEN 'bnb'
                       WHEN v_type IS NULL THEN 'hotel' ELSE 'other' END;
      END IF;

      v_address := nullif(btrim(coalesce(v_loc->>'address', v_norm->>'address', v_meta->>'address')), '');
      v_city    := nullif(btrim(coalesce(v_loc->>'city', v_norm->>'city', v_meta->>'city')), '');
      v_country := nullif(btrim(coalesce(v_loc->>'country', v_norm->>'country', v_meta->>'country')), '');
      v_lat := nullif(coalesce(v_loc->>'lat', v_loc->>'latitude', v_norm->>'latitude'), '')::double precision;
      v_lng := nullif(coalesce(v_loc->>'lng', v_loc->>'longitude', v_norm->>'longitude'), '')::double precision;
      IF coalesce(v_norm->>'city_id','') ~ uuid_rx    THEN v_city_id    := (v_norm->>'city_id')::uuid; END IF;
      IF coalesce(v_norm->>'country_id','') ~ uuid_rx THEN v_country_id := (v_norm->>'country_id')::uuid; END IF;

      v_phone   := nullif(btrim(coalesce(v_con->>'phone', v_norm->>'phone', v_meta->>'phone')), '');
      v_email   := nullif(btrim(coalesce(v_con->>'email', v_norm->>'email', v_meta->>'email')), '');
      v_website := nullif(btrim(coalesce(v_con->>'website', v_norm->>'website', (v_norm->'urls'->>0), v_meta->>'website')), '');
      v_booking := nullif(btrim(coalesce(v_norm->>'booking_url', v_meta->>'booking_url', v_website)), '');

      v_images    := ARRAY(SELECT value FROM jsonb_array_elements_text(coalesce(v_norm->'images', v_enr->'images', '[]'::jsonb)) WHERE nullif(btrim(value),'') IS NOT NULL);
      v_amenities := ARRAY(SELECT value FROM jsonb_array_elements_text(coalesce(v_norm->'amenities', '[]'::jsonb)) WHERE nullif(btrim(value),'') IS NOT NULL);

      v_price := nullif(coalesce(v_norm->>'price_range', v_meta->>'price_range'), '')::int;
      IF v_price IS NOT NULL AND (v_price < 1 OR v_price > 4) THEN v_price := NULL; END IF;
      v_stars := nullif(coalesce(v_norm->>'star_rating', v_meta->>'star_rating'), '')::numeric;
      IF v_stars IS NOT NULL AND (v_stars < 1 OR v_stars > 5) THEN v_stars := NULL; END IF;

      v_lgbtq := CASE
        WHEN (v_norm->>'lgbtq_friendly') IN ('true','t','1') THEN true
        WHEN (v_class->>'lgbtq_friendly') IN ('true','t','1') THEN true
        WHEN nullif(v_class->>'lgbti_relevance_score','')::numeric >= 0.7 THEN true
        ELSE false END;
      v_safety := nullif(btrim(coalesce(v_norm->>'queer_safety_notes', v_enr->>'queer_safety_notes')), '');

      v_src := coalesce(v_row.source_name, v_row.source_type, 'unknown');
      v_eid := coalesce(v_row.source_entity_id, v_meta->>'external_id', v_meta->>'id');

      IF v_name IS NULL OR length(v_name) < 2 THEN
        UPDATE public.ingestion_staging SET disposition='rejected', error_message='missing_name', updated_at=now() WHERE id=v_row.id;
        staging_id:=v_row.id; hotel_id:=NULL; action:='rejected'; RETURN NEXT; CONTINUE;
      END IF;

      v_slug := regexp_replace(lower(extensions.unaccent(v_name)), '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from substring(v_slug FROM 1 FOR 80));
      IF coalesce(v_eid,'') <> '' THEN v_slug := v_slug || '-' || substring(md5(v_src || ':' || v_eid) FOR 8); END IF;
      IF v_slug IS NULL OR v_slug = '' THEN v_slug := 'hotel-' || substring(md5(v_src || ':' || coalesce(v_eid,v_name)) FOR 10); END IF;

      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'name', v_name, 'desc', v_desc, 'type', v_type, 'address', v_address,
        'city', v_city, 'country', v_country, 'lat', v_lat, 'lng', v_lng,
        'phone', v_phone, 'email', v_email, 'website', v_website, 'booking', v_booking,
        'price', v_price, 'stars', v_stars, 'lgbtq', v_lgbtq, 'safety', v_safety,
        'images', to_jsonb(v_images), 'amenities', to_jsonb(v_amenities)));
      v_hash := md5(v_payload::text);

      IF v_row.payload_hash = v_hash AND v_row.disposition = 'committed' THEN
        staging_id:=v_row.id; hotel_id:=v_row.target_record_id; action:='noop'; RETURN NEXT; CONTINUE;
      END IF;

      v_lock_key := hashtextextended(coalesce(v_src || ':' || v_eid, v_name), 73);
      PERFORM pg_advisory_xact_lock(v_lock_key);

      v_existing_id := v_row.dedup_match_id;
      IF v_existing_id IS NULL AND v_eid IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.hotels WHERE data_source=v_src AND external_id=v_eid LIMIT 1;
      END IF;

      IF v_existing_id IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.hotels WHERE slug=v_slug) THEN
          v_slug := v_slug || '-' || substring(md5(coalesce(v_eid,v_name)||now()::text) FOR 6);
        END IF;
        INSERT INTO public.hotels (
          name, slug, description, hotel_type, address, city, city_id, country, country_id,
          latitude, longitude, phone, email, website, booking_url, images, amenities,
          price_range, star_rating, lgbtq_friendly, queer_safety_notes,
          data_source, external_id, payload_hash, last_seen_at, last_verified_at
        ) VALUES (
          v_name, v_slug, v_desc, v_type, v_address, v_city, v_city_id, v_country, v_country_id,
          v_lat, v_lng, v_phone, v_email, v_website, v_booking,
          CASE WHEN array_length(v_images,1)>0 THEN v_images ELSE NULL END,
          CASE WHEN array_length(v_amenities,1)>0 THEN v_amenities ELSE NULL END,
          v_price, v_stars, v_lgbtq, v_safety,
          v_src, v_eid, v_hash, now(), now()
        ) RETURNING id INTO v_result_id;
        v_action := 'inserted';
      ELSE
        UPDATE public.hotels SET
          name = coalesce(v_name, name),
          description = coalesce(v_desc, description),
          hotel_type = coalesce(v_type, hotel_type),
          address = coalesce(v_address, address),
          city = coalesce(v_city, city), city_id = coalesce(v_city_id, city_id),
          country = coalesce(v_country, country), country_id = coalesce(v_country_id, country_id),
          latitude = coalesce(v_lat, latitude), longitude = coalesce(v_lng, longitude),
          phone = coalesce(v_phone, phone), email = coalesce(v_email, email),
          website = coalesce(v_website, website), booking_url = coalesce(v_booking, booking_url),
          images = CASE WHEN array_length(v_images,1)>0 THEN v_images ELSE images END,
          amenities = CASE WHEN array_length(v_amenities,1)>0 THEN v_amenities ELSE amenities END,
          price_range = coalesce(v_price, price_range), star_rating = coalesce(v_stars, star_rating),
          lgbtq_friendly = lgbtq_friendly OR v_lgbtq,
          queer_safety_notes = coalesce(v_safety, queer_safety_notes),
          payload_hash = v_hash, last_seen_at = now(), last_verified_at = now(), updated_at = now()
        WHERE id = v_existing_id RETURNING id INTO v_result_id;
        v_action := 'updated';
      END IF;

      UPDATE public.ingestion_staging
         SET disposition='committed', target_record_id=v_result_id, payload_hash=v_hash, processed_at=now(), updated_at=now()
       WHERE id=v_row.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (v_row.id, 'commit', 'committed', 'commit_hotel_staging_batch',
              jsonb_build_object('hotel_id', v_result_id, 'action', v_action));
      staging_id:=v_row.id; hotel_id:=v_result_id; action:=v_action; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ingestion_staging SET disposition='rejected', error_message='commit_err: '||SQLERRM, updated_at=now() WHERE id=v_row.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (v_row.id, 'commit', 'rejected', 'commit_hotel_staging_batch', jsonb_build_object('error', SQLERRM));
      staging_id:=v_row.id; hotel_id:=NULL; action:='error'; RETURN NEXT;
    END;
  END LOOP;
END;
$function$;

-- Restate the two revokes so a fresh database matches prod. No-ops there.
revoke execute on function public.commit_hotel_staging_batch(p_limit integer, p_pipeline_run_id uuid) from public, anon;
revoke execute on function public.commit_hotel_staging_batch(p_limit integer, p_pipeline_run_id uuid) from authenticated;
