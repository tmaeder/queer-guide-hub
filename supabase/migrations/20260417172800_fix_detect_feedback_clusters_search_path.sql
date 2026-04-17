-- detect_feedback_clusters was created without `extensions` in its search_path
-- (only `public`), so similarity() from pg_trgm and the <=> operator from
-- pgvector couldn't be resolved at runtime. Mirrors the search_path already
-- set on detect_feedback_duplicates. Applied in-prod on 2026-04-17.
ALTER FUNCTION public.detect_feedback_clusters(real, real, integer, integer)
  SET search_path = public, extensions;
