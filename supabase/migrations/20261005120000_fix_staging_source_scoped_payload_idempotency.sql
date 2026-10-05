-- Scope byte-identical staging payload idempotency to the concrete source.
--
-- source_type describes the transport (api, scrape, feed, ...), so using it
-- alone makes unrelated sources with the same source_entity_id and payload
-- collide. source_name is the stable connector identity and already scopes the
-- newer idempotency_key index.

CREATE UNIQUE INDEX IF NOT EXISTS uk_ingestion_staging_source_payload_idem
  ON public.ingestion_staging (
    (coalesce(source_name, source_type)),
    source_entity_id,
    payload_hash
  )
  WHERE source_entity_id IS NOT NULL AND payload_hash IS NOT NULL;

DROP INDEX IF EXISTS public.uk_ingestion_staging_idem;

-- A source may legitimately use the same external slug for a venue and an
-- event. Include target_table so those two entity kinds do not block each
-- other while preserving one active row per source entity within each table.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_staging_source_target_idem
  ON public.ingestion_staging (
    (coalesce(source_name, source_type)),
    target_table,
    idempotency_key
  )
  WHERE idempotency_key IS NOT NULL AND disposition <> 'rejected';

DROP INDEX IF EXISTS public.ux_ingestion_staging_source_idem;
