-- Event/venue extraction from forwarded emails (workstream B phase 2).
--
-- A forwarded newsletter / event announcement (not a personal booking) can now
-- carry extracted event/venue candidates. The conversational thread proposes
-- "Add to queer.guide" cards; on confirm they stage into ingestion_staging
-- (source_type='email-ingest') and flow through the existing normalize →
-- validate → dedupe → quality → review-gate → commit pipeline. Never
-- auto-committed — user-forwarded content stays review-gated.

-- parsed_type gains 'event','venue'; parse_status gains 'staged'.
ALTER TABLE public.trip_inbox_items DROP CONSTRAINT IF EXISTS trip_inbox_items_parsed_type_check;
ALTER TABLE public.trip_inbox_items ADD CONSTRAINT trip_inbox_items_parsed_type_check
  CHECK (parsed_type IS NULL OR parsed_type IN (
    'lodging','flight','rail','restaurant','activity','event','venue','unknown'
  ));

ALTER TABLE public.trip_inbox_items DROP CONSTRAINT IF EXISTS trip_inbox_items_parse_status_check;
ALTER TABLE public.trip_inbox_items ADD CONSTRAINT trip_inbox_items_parse_status_check
  CHECK (parse_status IN ('pending','parsed','failed','slotted','dismissed','staged'));

-- Extracted event/venue candidates: { events: [...], venues: [...] } — the
-- same shape source-email-ingestions reads from email_ingestions.ai_extraction.
ALTER TABLE public.trip_inbox_items
  ADD COLUMN IF NOT EXISTS extracted_entities jsonb;
