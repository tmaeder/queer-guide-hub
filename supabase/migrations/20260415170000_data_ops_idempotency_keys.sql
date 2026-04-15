-- Wave 1 — Idempotency keys on ingestion_staging
-- Goal: prevent cross-run duplicates when commit lags behind dedup.
-- idempotency_key = sha1(source_name || ':' || coalesce(source_entity_id, payload_hash))
-- Already present as nullable text; this migration backfills + enforces uniqueness.

BEGIN;

-- Backfill: deterministic key derived from existing columns
UPDATE ingestion_staging
SET idempotency_key = encode(
      digest(
        coalesce(source_name, source_type, 'unknown')
        || ':' ||
        coalesce(nullif(source_entity_id, ''), payload_hash, id::text),
        'sha1'
      ),
      'hex'
    )
WHERE idempotency_key IS NULL;

-- Helper: compute key for new rows
CREATE OR REPLACE FUNCTION compute_staging_idempotency_key(
  p_source_name text,
  p_source_entity_id text,
  p_payload_hash text,
  p_fallback uuid
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      coalesce(p_source_name, 'unknown')
      || ':' ||
      coalesce(nullif(p_source_entity_id, ''), p_payload_hash, p_fallback::text),
      'sha1'
    ),
    'hex'
  );
$$;

-- BEFORE INSERT trigger: derive idempotency_key when missing.
CREATE OR REPLACE FUNCTION ingestion_staging_set_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.idempotency_key IS NULL THEN
    NEW.idempotency_key := compute_staging_idempotency_key(
      NEW.source_name, NEW.source_entity_id, NEW.payload_hash, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ingestion_staging_idempotency ON ingestion_staging;
CREATE TRIGGER trg_ingestion_staging_idempotency
BEFORE INSERT OR UPDATE OF source_name, source_entity_id, payload_hash
ON ingestion_staging
FOR EACH ROW EXECUTE FUNCTION ingestion_staging_set_idempotency_key();

-- Resolve pre-existing duplicates BEFORE adding the unique index:
-- keep newest non-rejected row, mark earlier ones as 'rejected' with a clear note.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY coalesce(source_name, source_type), idempotency_key
           ORDER BY created_at DESC, id
         ) AS rn
    FROM ingestion_staging
   WHERE idempotency_key IS NOT NULL
     AND disposition NOT IN ('rejected')
)
UPDATE ingestion_staging s
   SET disposition = 'rejected',
       error_message = coalesce(s.error_message,'') ||
         CASE WHEN s.error_message IS NULL OR s.error_message='' THEN '' ELSE '; ' END ||
         'idempotency_key collision (auto-resolved on ' || now()::date || ')',
       updated_at = now()
  FROM ranked r
 WHERE s.id = r.id AND r.rn > 1;

-- Unique index per (source_name, idempotency_key) to block re-ingest of same source row.
-- NOTE: can't use CONCURRENTLY inside a tx — caller accepts brief lock.
-- We DO NOT make idempotency_key NOT NULL globally so legacy rows can heal lazily.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_staging_source_idem
  ON ingestion_staging ((coalesce(source_name, source_type)), idempotency_key)
  WHERE idempotency_key IS NOT NULL AND disposition <> 'rejected';

-- Lookup index for commit-time idempotency checks
CREATE INDEX IF NOT EXISTS ix_ingestion_staging_idem
  ON ingestion_staging (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
