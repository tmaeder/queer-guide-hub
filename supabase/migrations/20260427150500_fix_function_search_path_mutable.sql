-- Pin search_path on functions flagged by supabase-advisor rule 0011
-- (function_search_path_mutable). Empty search_path forces unqualified
-- references to resolve via pg_catalog only; all three functions already use
-- pg_catalog builtins or schema-qualified objects, so behavior is preserved.

ALTER FUNCTION public.news_sources_track_auto_publish() SET search_path = '';
ALTER FUNCTION public.cms_run_scheduled_publish()       SET search_path = '';
ALTER FUNCTION public.assert_content_metadata_target()  SET search_path = '';
