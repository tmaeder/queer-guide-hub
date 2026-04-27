-- Drop leftover backup table _cleanup_personalities_2026_04_26.
-- One-off snapshot taken before the 2026-04-26 personalities cleanup; no
-- code references it. Surfaced by Supabase advisor (rls_disabled_in_public)
-- because the table is in the public schema without RLS. Same pattern as
-- 20260427170000_drop_tag_category_assignments_backup_v1.sql.

DROP TABLE IF EXISTS public._cleanup_personalities_2026_04_26;
