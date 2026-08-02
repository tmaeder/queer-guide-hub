-- writeToStaging() refresh mode does one (source_name, source_entity_id) lookup PER
-- PRODUCT. With no matching index that planned as a parallel seq scan over 313,844
-- rows / 1.5 GB: 469 ms each, measured on prod 2026-08-02. A 250-product Shopify page
-- therefore cost ~2 minutes of pure DB time against a 20 s fetch timeout and a ~150 s
-- gateway limit, so no large catalog could ever complete a refresh sweep. Every
-- existing merchant sync was already paying this — it is why MIN_MERCHANT_MS is 45 s.
-- After: index scan, 0.12 ms.
--
-- The nearest existing index (uk_ingestion_staging_idem) leads with source_type, not
-- source_name, and is partial on payload_hash — it can never serve this predicate.
--
-- Already created on prod with CREATE INDEX CONCURRENTLY (which cannot run inside the
-- transaction this migration executes in). IF NOT EXISTS makes prod a no-op and gives
-- CI/local the same index.
CREATE INDEX IF NOT EXISTS ix_ingestion_staging_source_lookup
  ON public.ingestion_staging (source_name, source_entity_id, created_at DESC);
