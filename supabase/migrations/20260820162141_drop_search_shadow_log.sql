-- Orphaned residue from the Meili-vs-Postgres search shadow-mode cutover
-- (decommissioned 2026-06-07). Zero code references, no triggers, no
-- functions read/write it, last row written 2026-06-01. Created directly
-- against prod outside the migration path (schema drift) -- see the sibling
-- cleanup in 20260715120000 which missed this table.
DROP TABLE IF EXISTS public.search_shadow_log;
