-- Consolidation sprint Q2-2026, Batch 2a: fix mutable search_path on 6 functions.
-- Closes advisor item: WARN function_search_path_mutable (×6)
-- Ref: docs/consolidation-2026-Q2-addendum-db-advisors.md
-- Already applied to prod via Supabase MCP on 2026-05-01.

ALTER FUNCTION public.normalize_tag_name(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.position_first_letter(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.search_tags_with_aliases(text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.tags_missing_descriptions(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_personality_internal_notes() SET search_path = public, pg_temp;
ALTER FUNCTION public.unified_tags_normalize_name() SET search_path = public, pg_temp;
