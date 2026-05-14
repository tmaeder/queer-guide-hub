-- ADR 0002 MIG-1 phase A — make `is_featured` available on venues + events
-- without breaking callers of the old `featured` column name.
--
-- DEVIATION FROM ORIGINAL ADR: the ADR proposed RENAME + view alias. A
-- view alias does NOT shield Supabase clients that query the table
-- directly (.from('venues').select('featured')). RENAME would runtime-
-- error every such call site immediately. This add-column + sync-trigger
-- pattern keeps both names working through Phase B.
--
-- Phase B: codemod ~48 callers from `featured` → `is_featured`. Both
-- column names work meanwhile via the bidirectional sync trigger.
-- Phase C (separate migration, after grep confirms zero callers of
-- `featured`): drop the trigger + drop the `featured` column.
--
-- Already applied to prod via Supabase MCP on 2026-05-02 across 3
-- migration steps:
--   mig1_phase_a_add_columns_only            — add columns
--   mig1_phase_a_backfill_is_featured        — backfill 806 venues + 6 events
--   mig1_phase_a_sync_trigger_and_indexes    — install trigger + indexes
-- This file consolidates them for new-environment setup.

-- ── Add columns ─────────────────────────────────────────────────────
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- ── Backfill (only the small subset where featured=true needs work) ─
-- The DEFAULT false handles the rest implicitly. Only 806 venues + 6 events.
UPDATE public.events SET is_featured = true WHERE featured = true AND is_featured = false;
UPDATE public.venues SET is_featured = true WHERE featured = true AND is_featured = false;

-- ── Bidirectional sync trigger ──────────────────────────────────────
-- Logic: on INSERT/UPDATE, mirror whichever column the caller wrote
-- into the other. If both written with conflicting values, the
-- canonical (is_featured) wins. If neither changed, no-op.
CREATE OR REPLACE FUNCTION public.sync_featured_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_featured IS NULL AND NEW.featured IS NULL THEN
      NEW.is_featured := false; NEW.featured := false;
    ELSIF NEW.is_featured IS NULL THEN
      NEW.is_featured := NEW.featured;
    ELSIF NEW.featured IS NULL THEN
      NEW.featured := NEW.is_featured;
    ELSIF NEW.is_featured IS DISTINCT FROM NEW.featured THEN
      NEW.featured := NEW.is_featured;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_featured IS DISTINCT FROM OLD.is_featured
       AND NEW.featured IS NOT DISTINCT FROM OLD.featured THEN
      NEW.featured := NEW.is_featured;
    ELSIF NEW.featured IS DISTINCT FROM OLD.featured
          AND NEW.is_featured IS NOT DISTINCT FROM OLD.is_featured THEN
      NEW.is_featured := NEW.featured;
    ELSIF NEW.is_featured IS DISTINCT FROM NEW.featured THEN
      NEW.featured := NEW.is_featured;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_featured_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS venues_sync_featured ON public.venues;
CREATE TRIGGER venues_sync_featured
  BEFORE INSERT OR UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.sync_featured_columns();

DROP TRIGGER IF EXISTS events_sync_featured ON public.events;
CREATE TRIGGER events_sync_featured
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sync_featured_columns();

-- ── Partial indexes for the new column (matches existing FK-index pattern) ─
CREATE INDEX IF NOT EXISTS idx_venues_is_featured ON public.venues (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_events_is_featured ON public.events (is_featured) WHERE is_featured = true;
