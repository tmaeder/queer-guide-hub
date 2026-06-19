-- ===========================================================================
-- personalities — birth/death date-order guard
-- ===========================================================================
-- Feedback (4cfdd74c): "Das System muss prüfen, dass der Geburtstag vor dem
-- Todestag liegt." The create dialog (AddPersonalityDialog) already validates
-- this client-side, but the CMS inline editor, CSV import, and ingestion
-- pipeline write birth_date/death_date with no cross-field check — so a
-- born-after-died record can slip in (one such case, Rosa von Praunheim, was
-- reported and has since been corrected).
--
-- A single DB-level CHECK covers every write path. Verified 0 existing rows
-- violate it before adding, so it applies without NOT VALID.
-- ===========================================================================

ALTER TABLE public.personalities
  ADD CONSTRAINT chk_personalities_birth_before_death
  CHECK (birth_date IS NULL OR death_date IS NULL OR death_date >= birth_date);
