-- Rejected drafts are an appendable review history. Keep the deferred
-- uniqueness of every other status, including transitions within a transaction.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.editorial_drafts
  ADD COLUMN uniqueness_status public.editorial_draft_status
  GENERATED ALWAYS AS (
    CASE WHEN status <> 'rejected'::public.editorial_draft_status THEN status END
  ) STORED;

ALTER TABLE public.editorial_drafts
  DROP CONSTRAINT editorial_drafts_entity_type_entity_id_status_key,
  ADD CONSTRAINT editorial_drafts_entity_status_unique
    UNIQUE (entity_type, entity_id, uniqueness_status)
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN public.editorial_drafts.uniqueness_status IS
  'Generated uniqueness discriminator: rejected drafts retain unlimited history; all other statuses remain unique per entity with deferred enforcement.';
