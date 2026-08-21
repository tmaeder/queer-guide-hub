-- =============================================================================
-- Drop venues.verification_status — dead column
-- =============================================================================
-- Added in 20260414250000_venue_data_ops_foundation.sql, default 'unverified',
-- NOT NULL. Nothing has ever set it to anything else: 100% of live venues are
-- 'unverified' (0 'verified'). `venues.verified` (boolean) is the field
-- actually written (import-venues-csv, twenty-sync) and read (VenueCard,
-- scoring formulas). Already flagged as dead in two 2026-06-05 audits with no
-- follow-up wiring since. No CHECK constraint or trigger depends on it.
-- Distinct from personalities.verification_status / unified_tags.verification_status,
-- which are live and untouched by this migration.
-- =============================================================================

ALTER TABLE public.venues DROP COLUMN IF EXISTS verification_status;
