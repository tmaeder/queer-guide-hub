-- merchant_id was NULL on 100% of marketplace_listings (measured 2026-08-22):
-- the registry linkage only ever existed as merchant_domain TEXT. Every
-- domain resolves against marketplace_merchants once 'www.' is stripped
-- (listings store bare domains, the registry stores www-prefixed ones for 9
-- merchants — same merchants, different spelling). The one true ambiguity is
-- salzgeber.shop, which has three registry rows (buch/film/other) — those
-- listings' source_type IS the merchant slug, so it disambiguates exactly.
--
-- trg_search_documents_marketplace is UNSCOPED (fires on any UPDATE) and
-- merchant_id feeds nothing in search_documents (facets carry
-- merchant_domain), so the sync is disabled for these statements — otherwise
-- a 69k-row bookkeeping backfill enqueues 69k no-op reindexes into
-- search_reindex_queue (~70 min of drain churn for zero content change).
--
-- Chunked into four UUID-range statements: every UPDATE recomputes the row's
-- STORED generated columns (three regex classifiers), which measured ~11 min
-- for the full table — one statement would blow the 900s statement budget,
-- four get a fresh budget each.
SET statement_timeout = '900s';
SET lock_timeout = '5s';

ALTER TABLE public.marketplace_listings DISABLE TRIGGER trg_search_documents_marketplace;

-- NOTE: four TOP-LEVEL statements, not a DO loop — a DO block is one
-- statement and would share a single 900s budget across all chunks.
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

ALTER TABLE public.marketplace_listings ENABLE TRIGGER trg_search_documents_marketplace;
