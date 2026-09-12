-- `marketplace_listings.merchant_id` had TWO writers with TWO meanings. This gives it one.
--
-- The commit path resolved the merchant out of the wrong registry:
--
--     SELECT id INTO v_merchant_id FROM public.affiliate_partners
--      WHERE v_merchant_dom = ANY(domains) AND enabled = true LIMIT 1;
--
-- verified live 2026-09-12 in BOTH `commit_marketplace_staging_item` and
-- `commit_marketplace_staging_batch` (`pg_get_functiondef` on each: `affiliate_partners`
-- present, `marketplace_merchants` absent). `affiliate_partners` is the TRAVEL booking
-- registry -- 15 rows, Booking.com / FlixBus / GetYourGuide / Airalo / Omio / Trainline /
-- Hotels.com / DiscoverCars -- while `marketplace_merchants` is the product-shop registry
-- with 99. MEASURED ON PROD, 2026-09-12:
--
--     marketplace_listings                                       70,416
--       with a merchant_id                                       69,737
--       whose merchant_id resolves in `marketplace_merchants`    69,737   (100%)
--       whose merchant_id resolves in `affiliate_partners`            0   (0%)
--     listings whose merchant_domain matches an ENABLED affiliate partner domain:  0
--
-- So that lookup could never match a product listing, has never matched one, and left
-- `v_merchant_id` NULL on every commit. Every populated row was written by the merchant
-- sync (`20260822135651`) instead. The column's VALUES were always merchant ids; only the
-- ingest path believed otherwise.
--
-- THE RESOLVER IS THE SYNC'S OWN PREDICATE, NOT A NEW ONE. `marketplace_resolve_merchant_id`
-- reproduces `20260822135651` exactly: strip a leading `www.` from `shop_domain` (listings
-- store bare domains, the registry stores www-prefixed ones for 9 merchants -- same
-- merchants, different spelling), and where one domain has several registry rows require
-- `slug = source_type` to disambiguate. That is not decoration: salzgeber.shop has three
-- rows (buch/film/other) and the listing's `source_type` IS the merchant slug. With no
-- disambiguating slug the resolver returns NULL rather than picking one -- a null
-- merchant_id is recoverable, a wrong one attributes a listing to the wrong shop.
--
-- Agreement was MEASURED before this was written, not assumed. Running the resolver over
-- the whole table against what the sync already wrote:
--
--     agree                  69,737      disagree                 0
--     resolver returns NULL where a value exists      0
--     rows the resolver would newly fill            671
--     both null                                       8
--
-- Zero disagreements is what makes this a unification rather than a second opinion, and it
-- is asserted at the bottom of this file rather than trusted.
--
-- `is_enabled` is deliberately NOT filtered (the old affiliate lookup demanded
-- `enabled = true`). The sync does not filter it either, `admin_merchant_overview` counts
-- listings for disabled merchants, and linking a listing to its shop is bookkeeping, not
-- activation -- a disabled merchant is still the merchant that sells the thing.
--
-- THE FK HAD TO MOVE FIRST OR THIS BREAKS EVERY COMMIT. `marketplace_listings_merchant_id_fkey`
-- still reads `REFERENCES affiliate_partners(id)` on prod, is flagged `convalidated = true`,
-- and all four of its RI triggers are enabled -- yet all 69,737 populated rows violate it
-- (they were orphaned by some path that bypassed FK enforcement; guessing at which one
-- would be fiction). It is NOT inert: probed on prod in a rolled-back transaction, writing
-- a real `marketplace_merchants` id into `merchant_id` raises 23503 today. So a commit path
-- that started resolving merchants would fail on the FIRST listing it matched. The repoint
-- is therefore part of this change and not a prerequisite left to another PR.
--
-- It is written soft-on-precondition: already-repointed is a no-op notice, still pointing at
-- `affiliate_partners` is repaired, anything else aborts rather than guessing. A concurrent
-- branch carries the same repoint (`20710101095000`), and either order works -- whichever
-- lands second finds nothing to do. `ADD CONSTRAINT` validates by default, so the statement
-- is itself the proof that all 69,737 rows resolve.
--
-- NO READER ASSUMED THE AFFILIATE SEMANTICS. Checked across migrations, `src/`,
-- `supabase/functions/` and `workers/`: the only places joining this column to
-- `affiliate_partners` were the constraint itself and these two lookups. Everything that
-- READS it already treats it as a merchant id -- `admin_merchant_overview` documents its
-- linkage ladder as slug/slug/shop_domain, `affiliate-conversions-sync` resolves a listing's
-- merchant through `marketplace_merchants` by `slug` or `shop_domain`, and
-- `MarketplaceQualityStatsPanel` labels the null count "No merchant link".
--
-- Both function bodies below are the LIVE definitions read back from prod with
-- `pg_get_functiondef`, with exactly one edit each: the affiliate SELECT replaced by the
-- helper call. `v_src_slug` is already assigned above that point in both.

-- ---------------------------------------------------------------------------
-- 1. The FK, repointed idempotently.
-- ---------------------------------------------------------------------------

do $fk$
declare v_target text;
begin
  select cl.relname into v_target
    from pg_constraint c
    join pg_class cl on cl.oid = c.confrelid
   where c.conrelid = 'public.marketplace_listings'::regclass
     and c.conname = 'marketplace_listings_merchant_id_fkey';

  if v_target is null then
    raise exception 'marketplace_listings_merchant_id_fkey is missing';
  elsif v_target = 'marketplace_merchants' then
    raise notice 'merchant FK already points at marketplace_merchants -- nothing to do';
  elsif v_target = 'affiliate_partners' then
    alter table public.marketplace_listings
      drop constraint marketplace_listings_merchant_id_fkey;
    alter table public.marketplace_listings
      add constraint marketplace_listings_merchant_id_fkey
      foreign key (merchant_id) references public.marketplace_merchants(id) on delete set null;
    raise notice 'merchant FK repointed: affiliate_partners -> marketplace_merchants';
  else
    raise exception 'merchant FK references %, which is neither registry; refusing to guess', v_target;
  end if;
end $fk$;

-- ---------------------------------------------------------------------------
-- 2. One resolver, matching the merchant sync's predicate exactly.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_resolve_merchant_id(
  p_merchant_domain text,
  p_source_slug     text default null
)
returns uuid
language sql
stable
security invoker
set search_path to 'public'
as $$
  select mm.id
    from public.marketplace_merchants mm
   where nullif(btrim(coalesce(p_merchant_domain, '')), '') is not null
     and nullif(btrim(coalesce(mm.shop_domain, '')), '') is not null
     and regexp_replace(lower(btrim(mm.shop_domain)), '^www\.', '')
         = lower(btrim(p_merchant_domain))
     -- One domain, several registry rows (salzgeber.shop has three): the listing's
     -- source_type IS the merchant slug, so it disambiguates. With no match, resolve to
     -- NULL rather than picking an arbitrary sibling.
     and (
       mm.slug = p_source_slug
       or not exists (
         select 1
           from public.marketplace_merchants mm2
          where mm2.id <> mm.id
            and nullif(btrim(coalesce(mm2.shop_domain, '')), '') is not null
            and regexp_replace(lower(btrim(mm2.shop_domain)), '^www\.', '')
                = lower(btrim(p_merchant_domain))
       )
     )
   order by (mm.slug is not distinct from p_source_slug) desc, mm.id
   limit 1;
$$;

comment on function public.marketplace_resolve_merchant_id(text, text) is
  'marketplace_listings.merchant_id resolver: bare merchant_domain -> marketplace_merchants.id, '
  'www-insensitive, disambiguated by source_type = slug when one domain has several registry '
  'rows. The single writer''s meaning for that column; mirrors the 20260822135651 backfill.';

revoke all on function public.marketplace_resolve_merchant_id(text, text) from public, anon, authenticated;
grant execute on function public.marketplace_resolve_merchant_id(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The two commit paths, live bodies with the lookup repointed.
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.commit_marketplace_staging_item(p_staging_id uuid, p_actor text DEFAULT 'review:individual'::text)
 RETURNS TABLE(listing_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row          RECORD;
  v_norm         JSONB;
  v_enr          JSONB;
  v_meta         JSONB;
  v_class        JSONB;
  v_title        TEXT;
  v_description  TEXT;
  v_category     TEXT;
  v_category_src TEXT;
  v_category_id  UUID;
  v_subcategory  TEXT;
  v_price        NUMERIC;
  v_price_type   TEXT;
  v_currency     TEXT;
  v_business     TEXT;
  v_biz_type     TEXT;
  v_email        TEXT;
  v_phone        TEXT;
  v_website      TEXT;
  v_location     TEXT;
  v_images       TEXT[];
  v_brand        TEXT;
  v_external_url TEXT;
  v_affiliate_url TEXT;
  v_merchant_dom TEXT;
  v_merchant_id  UUID;
  v_availability TEXT;
  v_in_stock     BOOLEAN;
  v_slug         TEXT;
  v_src_slug     TEXT;
  v_src_eid      TEXT;
  v_payload      JSONB;
  v_hash         TEXT;
  v_existing_id  UUID;
  v_prev_price   NUMERIC;
  v_lock_key     BIGINT;
  v_action       TEXT;
  v_result_id    UUID;
  v_relev        NUMERIC;
  v_sens         JSONB;
  v_qscore       INT;
BEGIN
  SELECT * INTO v_row FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_row.target_table <> 'marketplace_listings' THEN
    RAISE EXCEPTION 'not_a_marketplace_staging_item: target=%', v_row.target_table;
  END IF;
  IF v_row.disposition IN ('inserted','updated','committed','rejected') THEN
    listing_id := v_row.target_record_id; action := 'noop'; RETURN NEXT; RETURN;
  END IF;

  v_norm := coalesce(v_row.normalized_data, '{}'::jsonb);
  v_enr  := coalesce(v_row.enriched_data,   '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_row.raw_data, '{}'::jsonb);
  v_class:= coalesce(v_row.classification_result, '{}'::jsonb);

  v_title        := nullif(btrim(coalesce(v_norm->>'name', v_norm->>'title', v_meta->>'product_name', v_meta->>'title')), '');
  v_description  := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description', v_meta->>'description')), '');
  v_category_src := nullif(btrim(coalesce(v_norm->>'category', v_meta->>'category', v_meta->>'category_name')), '');
  v_subcategory  := nullif(btrim(coalesce(v_norm->>'subcategory', v_meta->>'subcategory', v_category_src)), '');
  v_biz_type     := nullif(btrim(coalesce(v_norm->>'business_type', v_meta->>'business_type')), '');
  v_category     := CASE WHEN v_biz_type ILIKE '%service%' THEN 'services' ELSE 'products' END;

  IF v_category_src IS NOT NULL THEN
    SELECT id INTO v_category_id FROM public.marketplace_categories
     WHERE is_active = true
       AND (lower(name) = lower(v_category_src)
            OR lower(slug) = lower(regexp_replace(v_category_src, '[^a-zA-Z0-9]+', '-', 'g')))
     LIMIT 1;
  END IF;

  v_price       := nullif(coalesce(v_meta->>'price', v_norm->>'price', v_meta->>'search_price'), '')::numeric;
  v_price_type  := coalesce(nullif(btrim(coalesce(v_norm->>'price_type', v_meta->>'price_type')), ''), 'fixed');
  v_currency    := coalesce(upper(nullif(btrim(coalesce(v_norm->>'currency', v_meta->>'currency')), '')), 'USD');
  v_business    := nullif(btrim(coalesce(v_norm->>'business_name', v_meta->>'merchant_name', v_meta->>'business_name', v_meta->>'brand_name')), '');
  v_email       := nullif(btrim(coalesce((v_norm->'contacts'->>'email'), v_meta->>'contact_email', v_meta->>'email')), '');
  v_phone       := nullif(btrim(coalesce((v_norm->'contacts'->>'phone'), v_meta->>'contact_phone', v_meta->>'phone')), '');
  v_website     := nullif(btrim(coalesce((v_norm->'contacts'->>'website'), v_meta->>'merchant_url', v_meta->>'website', (v_norm->'urls'->>0))), '');
  v_location    := nullif(btrim(coalesce(v_norm->>'location', v_meta->>'location', (v_norm->'location'->>'address'))), '');
  v_brand       := nullif(btrim(coalesce(v_norm->>'brand', v_meta->>'brand', v_meta->>'brand_name')), '');
  v_external_url := nullif(btrim(coalesce(v_meta->>'merchant_deep_link', v_meta->>'product_url', (v_norm->'urls'->>0), v_website)), '');
  v_affiliate_url:= nullif(btrim(coalesce(v_meta->>'aw_deep_link', v_meta->>'affiliate_url', v_norm->>'affiliate_url')), '');
  v_in_stock    := CASE WHEN v_meta ? 'in_stock' THEN (v_meta->>'in_stock')::boolean
                        WHEN v_norm ? 'in_stock' THEN (v_norm->>'in_stock')::boolean
                        ELSE NULL END;
  v_availability:= CASE WHEN v_in_stock IS TRUE THEN 'in_stock'
                        WHEN v_in_stock IS FALSE THEN 'out_of_stock'
                        ELSE coalesce(v_norm->>'availability', 'unknown') END;

  v_images := ARRAY(
    SELECT value::text FROM jsonb_array_elements_text(coalesce(v_norm->'images', v_enr->'images', '[]'::jsonb))
     WHERE value::text IS NOT NULL AND value::text <> ''
  );

  v_relev := nullif(v_class->>'lgbti_relevance_score', '')::numeric;
  v_sens  := coalesce(v_class->'sensitivity_flags', '[]'::jsonb);
  v_qscore:= nullif(v_row.ai_validation_result->>'quality', '')::int;

  v_src_slug := coalesce(v_row.source_name, v_row.source_type, 'unknown');
  v_src_eid  := coalesce(v_row.source_entity_id, v_meta->>'aw_product_id', v_meta->>'product_id', v_meta->>'id', v_meta->>'external_id');

  IF v_external_url IS NOT NULL THEN
    v_merchant_dom := lower(substring(v_external_url FROM 'https?://(?:www\.)?([^/:?#]+)'));
  ELSIF v_website IS NOT NULL THEN
    v_merchant_dom := lower(substring(v_website FROM 'https?://(?:www\.)?([^/:?#]+)'));
  END IF;

  v_merchant_id := public.marketplace_resolve_merchant_id(v_merchant_dom, v_src_slug);

  IF v_title IS NULL OR length(v_title) < 2 THEN
    UPDATE public.ingestion_staging SET disposition='rejected', error_message='missing_title', updated_at=now() WHERE id = v_row.id;
    listing_id := NULL; action := 'rejected'; RETURN NEXT; RETURN;
  END IF;
  IF v_business IS NULL THEN v_business := coalesce(v_brand, v_merchant_dom, 'unknown'); END IF;

  v_slug := regexp_replace(lower(extensions.unaccent(v_title)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from substring(v_slug FROM 1 FOR 80));
  IF coalesce(v_src_eid,'') <> '' THEN
    v_slug := v_slug || '-' || substring(md5(v_src_slug || ':' || v_src_eid) FOR 8);
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'title', v_title, 'price', v_price, 'business', v_business,
    'external_url', v_external_url, 'availability', v_availability));
  v_hash := md5(v_payload::text);

  v_lock_key := hashtextextended(coalesce(v_src_slug || ':' || v_src_eid, v_title), 42);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_existing_id := v_row.dedup_match_id;
  IF v_existing_id IS NULL AND v_src_eid IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.marketplace_listings
     WHERE source_type = v_src_slug AND source_entity_id = v_src_eid LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.marketplace_listings (
      title, description, category, subcategory, category_id,
      price, price_type, currency,
      business_name, business_type, contact_email, contact_phone, website,
      location, images, status, slug,
      source_type, source_entity_id, external_url, affiliate_url,
      merchant_domain, merchant_id, brand,
      availability, in_stock, last_verified_at, last_seen_at,
      link_health, quality_score, lgbti_relevance_score, sensitivity_flags,
      classified_at, review_status, payload_hash
    ) VALUES (
      v_title, v_description, v_category, v_subcategory, v_category_id,
      v_price, v_price_type, v_currency,
      v_business, v_biz_type, v_email, v_phone, v_website,
      v_location, v_images, 'active', v_slug,
      v_src_slug, v_src_eid, v_external_url, v_affiliate_url,
      v_merchant_dom, v_merchant_id, v_brand,
      v_availability, v_in_stock, now(), now(),
      'unchecked', v_qscore, v_relev, v_sens,
      CASE WHEN v_relev IS NOT NULL THEN now() ELSE NULL END,
      coalesce(v_row.review_status,'auto'), v_hash
    ) RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    SELECT price INTO v_prev_price FROM public.marketplace_listings WHERE id = v_existing_id;
    UPDATE public.marketplace_listings SET
      title = coalesce(v_title, title),
      description = coalesce(v_description, description),
      category = v_category,
      subcategory = coalesce(v_subcategory, subcategory),
      category_id = coalesce(v_category_id, category_id),
      price = coalesce(v_price, price),
      currency = coalesce(v_currency, currency),
      business_name = coalesce(v_business, business_name),
      website = coalesce(v_website, website),
      images = CASE WHEN array_length(v_images,1) > 0 THEN v_images ELSE images END,
      external_url = coalesce(v_external_url, external_url),
      affiliate_url = coalesce(v_affiliate_url, affiliate_url),
      merchant_domain = coalesce(v_merchant_dom, merchant_domain),
      merchant_id = coalesce(v_merchant_id, merchant_id),
      brand = coalesce(v_brand, brand),
      availability = v_availability,
      in_stock = coalesce(v_in_stock, in_stock),
      last_verified_at = now(),
      last_seen_at = now(),
      quality_score = coalesce(v_qscore, quality_score),
      lgbti_relevance_score = coalesce(v_relev, lgbti_relevance_score),
      sensitivity_flags = CASE WHEN v_sens <> '[]'::jsonb THEN v_sens ELSE sensitivity_flags END,
      classified_at = CASE WHEN v_relev IS NOT NULL THEN now() ELSE classified_at END,
      payload_hash = v_hash,
      updated_at = now()
    WHERE id = v_existing_id RETURNING id INTO v_result_id;
    v_action := 'updated';

    IF v_price IS NOT NULL AND (v_prev_price IS NULL OR v_prev_price <> v_price) THEN
      INSERT INTO public.marketplace_price_history (listing_id, price, currency, source_slug, availability)
      VALUES (v_result_id, v_price, v_currency, v_src_slug, v_availability);
    END IF;
  END IF;

  INSERT INTO public.marketplace_listing_sources (listing_id, source_slug, source_entity_id, source_url, raw, payload_hash, confidence, is_primary)
  VALUES (v_result_id, v_src_slug, v_src_eid, v_external_url, v_row.raw_data, v_hash, 1.0, v_action = 'inserted')
  ON CONFLICT (source_slug, source_entity_id) WHERE source_entity_id IS NOT NULL
  DO UPDATE SET listing_id = EXCLUDED.listing_id, raw = EXCLUDED.raw, payload_hash = EXCLUDED.payload_hash, last_seen_at = now();

  IF v_action = 'inserted' AND v_price IS NOT NULL THEN
    INSERT INTO public.marketplace_price_history (listing_id, price, currency, source_slug, availability)
    VALUES (v_result_id, v_price, v_currency, v_src_slug, v_availability);
  END IF;

  UPDATE public.ingestion_staging SET
    disposition = 'committed',
    target_record_id = v_result_id,
    payload_hash = v_hash,
    processed_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
  VALUES (v_row.id, 'commit', 'committed', p_actor,
          jsonb_build_object('listing_id', v_result_id, 'action', v_action, 'price', v_price));

  listing_id := v_result_id;
  action := v_action;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_marketplace_staging_batch(p_limit integer DEFAULT 50, p_pipeline_run_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(staging_id uuid, listing_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row          RECORD;
  v_norm         JSONB;
  v_enr          JSONB;
  v_meta         JSONB;
  v_title        TEXT;
  v_description  TEXT;
  v_category     TEXT;
  v_category_src TEXT;
  v_category_id  UUID;
  v_subcategory  TEXT;
  v_price        NUMERIC;
  v_price_type   TEXT;
  v_currency     TEXT;
  v_business     TEXT;
  v_biz_type     TEXT;
  v_email        TEXT;
  v_phone        TEXT;
  v_website      TEXT;
  v_location     TEXT;
  v_images       TEXT[];
  v_brand        TEXT;
  v_external_url TEXT;
  v_affiliate_url TEXT;
  v_merchant_dom TEXT;
  v_merchant_id  UUID;
  v_availability TEXT;
  v_in_stock     BOOLEAN;
  v_slug         TEXT;
  v_src_slug     TEXT;
  v_src_eid      TEXT;
  v_source_url   TEXT;
  v_payload      JSONB;
  v_hash         TEXT;
  v_existing_id  UUID;
  v_prev_price   NUMERIC;
  v_lock_key     BIGINT;
  v_action       TEXT;
  v_result_id    UUID;
  v_class        JSONB;
  v_relev        NUMERIC;
  v_sens         JSONB;
  v_qscore       INT;
  v_biz_type_ok  TEXT;
BEGIN
  FOR v_row IN
    SELECT s.*
      FROM public.ingestion_staging s
     WHERE s.target_table = 'marketplace_listings'
       AND s.disposition = 'pending'
       AND s.ai_validation_status = 'approved'
       -- LGBTQ+ relevance gate: never commit a row the relevance classifier
       -- has not seen (it sets disposition='rejected' itself for fails).
       AND s.classification_result IS NOT NULL
       AND (s.dedup_status IN ('unique','duplicate') OR s.dedup_status IS NULL)
       AND s.review_status IN ('auto','approved')
       AND (p_pipeline_run_id IS NULL OR s.pipeline_run_id = p_pipeline_run_id)
     ORDER BY s.created_at ASC
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_norm := coalesce(v_row.normalized_data, '{}'::jsonb);
      v_enr  := coalesce(v_row.enriched_data,   '{}'::jsonb);
      v_meta := coalesce(v_norm->'metadata', v_row.raw_data, '{}'::jsonb);
      v_class:= coalesce(v_row.classification_result, '{}'::jsonb);

      v_title        := nullif(btrim(coalesce(v_norm->>'name', v_norm->>'title', v_meta->>'product_name', v_meta->>'title')), '');
      v_description  := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description', v_meta->>'description')), '');

      -- Source-level category (e.g. "Bags") stored as subcategory; high-level bucket fits check constraint
      v_category_src := nullif(btrim(coalesce(v_norm->>'category', v_meta->>'category', v_meta->>'category_name')), '');
      v_subcategory  := nullif(btrim(coalesce(v_norm->>'subcategory', v_meta->>'subcategory', v_category_src)), '');
      v_biz_type     := nullif(btrim(coalesce(v_norm->>'business_type', v_meta->>'business_type')), '');
      -- Decide products vs services — default products; services only if business_type or source clearly indicates
      IF v_biz_type IS NOT NULL AND v_biz_type ILIKE '%service%' THEN
        v_category := 'services';
      ELSE
        v_category := 'products';
      END IF;

      -- Resolve category_id from marketplace_categories (case-insensitive name or slug match)
      IF v_category_src IS NOT NULL THEN
        SELECT id INTO v_category_id
          FROM public.marketplace_categories
         WHERE is_active = true
           AND (lower(name) = lower(v_category_src) OR lower(slug) = lower(regexp_replace(v_category_src, '[^a-zA-Z0-9]+', '-', 'g')))
         LIMIT 1;
      END IF;

      v_price        := nullif(coalesce(v_meta->>'price', v_norm->>'price', v_meta->>'search_price'), '')::numeric;
      v_price_type   := coalesce(nullif(btrim(coalesce(v_norm->>'price_type', v_meta->>'price_type')), ''), 'fixed');
      v_currency     := coalesce(upper(nullif(btrim(coalesce(v_norm->>'currency', v_meta->>'currency')), '')), 'USD');
      v_business     := nullif(btrim(coalesce(v_norm->>'business_name', v_meta->>'merchant_name', v_meta->>'business_name', v_meta->>'brand_name')), '');
      v_email        := nullif(btrim(coalesce((v_norm->'contacts'->>'email'), v_meta->>'contact_email', v_meta->>'email')), '');
      v_phone        := nullif(btrim(coalesce((v_norm->'contacts'->>'phone'), v_meta->>'contact_phone', v_meta->>'phone')), '');
      v_website      := nullif(btrim(coalesce((v_norm->'contacts'->>'website'), v_meta->>'merchant_url', v_meta->>'website', (v_norm->'urls'->>0))), '');
      v_location     := nullif(btrim(coalesce(v_norm->>'location', v_meta->>'location', (v_norm->'location'->>'address'))), '');
      v_brand        := nullif(btrim(coalesce(v_norm->>'brand', v_meta->>'brand', v_meta->>'brand_name')), '');
      v_external_url := nullif(btrim(coalesce(v_meta->>'merchant_deep_link', v_meta->>'product_url', (v_norm->'urls'->>0), v_website)), '');
      v_affiliate_url:= nullif(btrim(coalesce(v_meta->>'aw_deep_link', v_meta->>'affiliate_url', v_norm->>'affiliate_url')), '');
      v_in_stock     := CASE WHEN v_meta ? 'in_stock' THEN (v_meta->>'in_stock')::boolean
                             WHEN v_norm ? 'in_stock' THEN (v_norm->>'in_stock')::boolean
                             ELSE NULL END;
      v_availability := CASE WHEN v_in_stock IS TRUE THEN 'in_stock'
                             WHEN v_in_stock IS FALSE THEN 'out_of_stock'
                             ELSE coalesce(v_norm->>'availability', 'unknown') END;

      v_images := ARRAY(
        SELECT value::text
          FROM jsonb_array_elements_text(coalesce(v_norm->'images', v_enr->'images', '[]'::jsonb))
         WHERE value::text IS NOT NULL AND value::text <> ''
      );

      v_relev := nullif(v_class->>'lgbti_relevance_score', '')::numeric;
      v_sens  := coalesce(v_class->'sensitivity_flags', '[]'::jsonb);
      v_qscore:= nullif(v_row.ai_validation_result->>'quality', '')::int;

      v_src_slug := coalesce(v_row.source_name, v_row.source_type, 'unknown');
      v_src_eid  := coalesce(v_row.source_entity_id,
                             v_meta->>'aw_product_id',
                             v_meta->>'product_id',
                             v_meta->>'id',
                             v_meta->>'external_id');
      v_source_url := v_external_url;

      IF v_external_url IS NOT NULL THEN
        v_merchant_dom := lower(substring(v_external_url FROM 'https?://(?:www\.)?([^/:?#]+)'));
      ELSIF v_website IS NOT NULL THEN
        v_merchant_dom := lower(substring(v_website FROM 'https?://(?:www\.)?([^/:?#]+)'));
      END IF;

      v_merchant_id := public.marketplace_resolve_merchant_id(v_merchant_dom, v_src_slug);

      IF v_title IS NULL OR length(v_title) < 2 THEN
        UPDATE public.ingestion_staging SET disposition='rejected', error_message='missing_title', updated_at=now() WHERE id = v_row.id;
        staging_id := v_row.id; listing_id := NULL; action := 'rejected'; RETURN NEXT;
        CONTINUE;
      END IF;
      IF v_business IS NULL THEN v_business := coalesce(v_brand, v_merchant_dom, 'unknown'); END IF;

      v_slug := regexp_replace(lower(extensions.unaccent(v_title)), '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from substring(v_slug FROM 1 FOR 80));
      IF coalesce(v_src_eid,'') <> '' THEN
        v_slug := v_slug || '-' || substring(md5(v_src_slug || ':' || v_src_eid) FOR 8);
      END IF;

      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'title', v_title, 'price', v_price, 'business', v_business,
        'external_url', v_external_url, 'availability', v_availability
      ));
      v_hash := md5(v_payload::text);

      IF v_row.payload_hash = v_hash AND v_row.disposition = 'committed' THEN
        staging_id := v_row.id; listing_id := v_row.target_record_id; action := 'noop'; RETURN NEXT;
        CONTINUE;
      END IF;

      v_lock_key := hashtextextended(coalesce(v_src_slug || ':' || v_src_eid, v_title), 42);
      PERFORM pg_advisory_xact_lock(v_lock_key);

      v_existing_id := v_row.dedup_match_id;
      IF v_existing_id IS NULL AND v_src_eid IS NOT NULL THEN
        SELECT id INTO v_existing_id
          FROM public.marketplace_listings
         WHERE source_type = v_src_slug AND source_entity_id = v_src_eid
         LIMIT 1;
      END IF;

      IF v_existing_id IS NULL THEN
        INSERT INTO public.marketplace_listings (
          title, description, category, subcategory, category_id,
          price, price_type, currency,
          business_name, business_type, contact_email, contact_phone, website,
          location, images, status, slug,
          source_type, source_entity_id, external_url, affiliate_url,
          merchant_domain, merchant_id, brand,
          availability, in_stock, last_verified_at, last_seen_at,
          link_health, quality_score, lgbti_relevance_score, sensitivity_flags,
          classified_at, review_status, payload_hash
        ) VALUES (
          v_title, v_description, v_category, v_subcategory, v_category_id,
          v_price, v_price_type, v_currency,
          v_business, v_biz_type, v_email, v_phone, v_website,
          v_location, v_images, 'active', v_slug,
          v_src_slug, v_src_eid, v_external_url, v_affiliate_url,
          v_merchant_dom, v_merchant_id, v_brand,
          v_availability, v_in_stock, now(), now(),
          'unchecked', v_qscore, v_relev, v_sens,
          CASE WHEN v_relev IS NOT NULL THEN now() ELSE NULL END,
          coalesce(v_row.review_status,'auto'), v_hash
        )
        RETURNING id INTO v_result_id;
        v_action := 'inserted';
      ELSE
        SELECT price INTO v_prev_price FROM public.marketplace_listings WHERE id = v_existing_id;
        UPDATE public.marketplace_listings SET
          title          = coalesce(v_title, title),
          description    = coalesce(v_description, description),
          category       = v_category,
          subcategory    = coalesce(v_subcategory, subcategory),
          category_id    = coalesce(v_category_id, category_id),
          price          = coalesce(v_price, price),
          currency       = coalesce(v_currency, currency),
          business_name  = coalesce(v_business, business_name),
          website        = coalesce(v_website, website),
          images         = CASE WHEN array_length(v_images,1) > 0 THEN v_images ELSE images END,
          external_url   = coalesce(v_external_url, external_url),
          affiliate_url  = coalesce(v_affiliate_url, affiliate_url),
          merchant_domain= coalesce(v_merchant_dom, merchant_domain),
          merchant_id    = coalesce(v_merchant_id, merchant_id),
          brand          = coalesce(v_brand, brand),
          availability   = v_availability,
          in_stock       = coalesce(v_in_stock, in_stock),
          last_verified_at = now(),
          last_seen_at     = now(),
          quality_score    = coalesce(v_qscore, quality_score),
          lgbti_relevance_score = coalesce(v_relev, lgbti_relevance_score),
          sensitivity_flags     = CASE WHEN v_sens <> '[]'::jsonb THEN v_sens ELSE sensitivity_flags END,
          classified_at    = CASE WHEN v_relev IS NOT NULL THEN now() ELSE classified_at END,
          payload_hash     = v_hash,
          updated_at       = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_result_id;
        v_action := 'updated';

        IF v_price IS NOT NULL AND (v_prev_price IS NULL OR v_prev_price <> v_price) THEN
          INSERT INTO public.marketplace_price_history (listing_id, price, currency, source_slug, availability)
          VALUES (v_result_id, v_price, v_currency, v_src_slug, v_availability);
        END IF;
      END IF;

      INSERT INTO public.marketplace_listing_sources (listing_id, source_slug, source_entity_id, source_url, raw, payload_hash, confidence, is_primary)
      VALUES (v_result_id, v_src_slug, v_src_eid, v_source_url, v_row.raw_data, v_hash, 1.0, v_action = 'inserted')
      ON CONFLICT (source_slug, source_entity_id) WHERE source_entity_id IS NOT NULL
      DO UPDATE SET listing_id = EXCLUDED.listing_id, raw = EXCLUDED.raw, payload_hash = EXCLUDED.payload_hash, last_seen_at = now();

      IF v_action = 'inserted' AND v_price IS NOT NULL THEN
        INSERT INTO public.marketplace_price_history (listing_id, price, currency, source_slug, availability)
        VALUES (v_result_id, v_price, v_currency, v_src_slug, v_availability);
      END IF;

      UPDATE public.ingestion_staging SET
        disposition      = 'committed',
        target_record_id = v_result_id,
        payload_hash     = v_hash,
        processed_at     = now(),
        updated_at       = now()
      WHERE id = v_row.id;

      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (v_row.id, 'commit', 'committed', 'commit_marketplace_staging_batch',
              jsonb_build_object('listing_id', v_result_id, 'action', v_action, 'price', v_price));

      staging_id := v_row.id;
      listing_id := v_result_id;
      action     := v_action;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ingestion_staging SET
        disposition   = 'rejected',
        error_message = 'commit_err: ' || SQLERRM,
        updated_at    = now()
      WHERE id = v_row.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (v_row.id, 'commit', 'rejected', 'commit_marketplace_staging_batch',
              jsonb_build_object('error', SQLERRM));
      staging_id := v_row.id;
      listing_id := NULL;
      action     := 'error';
      RETURN NEXT;
    END;
  END LOOP;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4. Postconditions. Assert the state this file exists to reach, not the steps.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_target   text;
  v_item     text;
  v_batch    text;
  v_agree    bigint;
  v_disagree bigint;
  v_probe    uuid;
  v_expect   uuid;
  v_domain   text;
  v_slug     text;
begin
  -- (a) The FK names the registry the column actually holds.
  select cl.relname into v_target
    from pg_constraint c
    join pg_class cl on cl.oid = c.confrelid
   where c.conrelid = 'public.marketplace_listings'::regclass
     and c.conname = 'marketplace_listings_merchant_id_fkey';
  if v_target is distinct from 'marketplace_merchants' then
    raise exception 'merchant FK references %, expected marketplace_merchants', coalesce(v_target, '<missing>');
  end if;

  -- (b) Neither commit path can still read the travel registry, and both go through the
  --     one resolver. Checking the LIVE bodies, not this file's text: a CREATE OR REPLACE
  --     that silently failed to take would leave the old lookup running.
  select pg_get_functiondef(p.oid) into v_item
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commit_marketplace_staging_item';
  select pg_get_functiondef(p.oid) into v_batch
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commit_marketplace_staging_batch';

  if v_item is null or v_batch is null then
    raise exception 'a marketplace commit function is missing';
  end if;
  if v_item like '%affiliate_partners%' then
    raise exception 'commit_marketplace_staging_item still reads affiliate_partners';
  end if;
  if v_batch like '%affiliate_partners%' then
    raise exception 'commit_marketplace_staging_batch still reads affiliate_partners';
  end if;
  if v_item not like '%marketplace_resolve_merchant_id%' then
    raise exception 'commit_marketplace_staging_item does not call the resolver';
  end if;
  if v_batch not like '%marketplace_resolve_merchant_id%' then
    raise exception 'commit_marketplace_staging_batch does not call the resolver';
  end if;

  -- (c) The resolver agrees with the merchant sync on every row the sync has written.
  --     A resolver that returned NULL for everything would pass "0 disagreements", so the
  --     agreement count has to be non-zero too.
  select count(*) filter (where l.merchant_id
                            = public.marketplace_resolve_merchant_id(l.merchant_domain, l.source_type)),
         count(*) filter (where public.marketplace_resolve_merchant_id(l.merchant_domain, l.source_type) is not null
                            and public.marketplace_resolve_merchant_id(l.merchant_domain, l.source_type)
                                is distinct from l.merchant_id)
    into v_agree, v_disagree
    from public.marketplace_listings l
   where l.merchant_id is not null;

  if v_disagree > 0 then
    raise exception 'resolver disagrees with the merchant sync on % listings', v_disagree;
  end if;
  if v_agree = 0 then
    raise exception 'resolver agreed with nothing -- the zero-disagreement check proved nothing';
  end if;

  -- (d) Negative controls: absence must resolve to NULL, not to an arbitrary row.
  if public.marketplace_resolve_merchant_id(null, null) is not null then
    raise exception 'resolver invented a merchant for a null domain';
  end if;
  if public.marketplace_resolve_merchant_id('   ', null) is not null then
    raise exception 'resolver invented a merchant for a blank domain';
  end if;
  if public.marketplace_resolve_merchant_id('no-such-shop.invalid', 'no-such-slug') is not null then
    raise exception 'resolver invented a merchant for an unknown domain';
  end if;

  -- (e) Positive control on a real row, www-stripping included.
  select l.merchant_domain, l.source_type, l.merchant_id
    into v_domain, v_slug, v_expect
    from public.marketplace_listings l
   where l.merchant_id is not null and l.merchant_domain is not null
   order by l.id
   limit 1;
  if v_expect is not null then
    v_probe := public.marketplace_resolve_merchant_id(v_domain, v_slug);
    if v_probe is distinct from v_expect then
      raise exception 'resolver returned % for %/%, expected %', v_probe, v_domain, v_slug, v_expect;
    end if;
  end if;

  raise notice 'merchant_id has one writer and one meaning: % listings agree, 0 disagree', v_agree;
end $verify$;
