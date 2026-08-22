-- merchant_id backfill from merchant_domain -> marketplace_merchants registry.
-- See repo migration 20260916120200 for rationale. session_replication_role
-- suppresses the unscoped search-sync trigger (merchant_id feeds nothing in
-- search_documents) WITHOUT the table lock that ALTER ... DISABLE TRIGGER
-- needs — that lock kept losing to the */5 marketplace crons.
SET statement_timeout = '900s';
SET session_replication_role = replica;

UPDATE public.marketplace_listings ml
SET merchant_id = mm.id
FROM public.marketplace_merchants mm
WHERE ml.id < '40000000-0000-0000-0000-000000000000'
  AND ml.merchant_id IS NULL AND ml.merchant_domain IS NOT NULL
  AND regexp_replace(lower(coalesce(mm.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)
  AND (mm.slug = ml.source_type OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_merchants mm2
    WHERE mm2.id <> mm.id
      AND regexp_replace(lower(coalesce(mm2.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)));

UPDATE public.marketplace_listings ml
SET merchant_id = mm.id
FROM public.marketplace_merchants mm
WHERE ml.id >= '40000000-0000-0000-0000-000000000000' AND ml.id < '80000000-0000-0000-0000-000000000000'
  AND ml.merchant_id IS NULL AND ml.merchant_domain IS NOT NULL
  AND regexp_replace(lower(coalesce(mm.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)
  AND (mm.slug = ml.source_type OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_merchants mm2
    WHERE mm2.id <> mm.id
      AND regexp_replace(lower(coalesce(mm2.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)));

UPDATE public.marketplace_listings ml
SET merchant_id = mm.id
FROM public.marketplace_merchants mm
WHERE ml.id >= '80000000-0000-0000-0000-000000000000' AND ml.id < 'c0000000-0000-0000-0000-000000000000'
  AND ml.merchant_id IS NULL AND ml.merchant_domain IS NOT NULL
  AND regexp_replace(lower(coalesce(mm.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)
  AND (mm.slug = ml.source_type OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_merchants mm2
    WHERE mm2.id <> mm.id
      AND regexp_replace(lower(coalesce(mm2.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)));

UPDATE public.marketplace_listings ml
SET merchant_id = mm.id
FROM public.marketplace_merchants mm
WHERE ml.id >= 'c0000000-0000-0000-0000-000000000000'
  AND ml.merchant_id IS NULL AND ml.merchant_domain IS NOT NULL
  AND regexp_replace(lower(coalesce(mm.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)
  AND (mm.slug = ml.source_type OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_merchants mm2
    WHERE mm2.id <> mm.id
      AND regexp_replace(lower(coalesce(mm2.shop_domain,'')), '^www\.', '') = lower(ml.merchant_domain)));

SET session_replication_role = DEFAULT;
