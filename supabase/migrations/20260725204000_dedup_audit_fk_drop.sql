-- Dedup Truth Engine — follow-up: merge_audit_id must not FK entity_merge_audit
--
-- approve_dedup_review dispatches per type: venue → merge_venues (audits into
-- venue_merge_audit), city → merge_cities (city_merge_audit), everything else →
-- merge_entities (entity_merge_audit). The FK on dedup_review_queue.merge_audit_id
-- referenced only entity_merge_audit, so approving a venue/city pair failed with
-- a FK violation (caught by the prod UI e2e on the Hong Kong ⇄ Hongkong pair;
-- the whole approve transaction rolled back, so no partial merges happened).
-- The audit table is implied by entity_type — keep the column as a plain uuid.

ALTER TABLE public.dedup_review_queue
  DROP CONSTRAINT IF EXISTS dedup_review_queue_merge_audit_id_fkey;
