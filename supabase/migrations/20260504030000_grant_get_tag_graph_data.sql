-- Grant EXECUTE on get_tag_graph_data to anon and authenticated roles.
--
-- The function is SECURITY DEFINER with a pinned search_path and uses only
-- parameterised SQL (no dynamic EXECUTE), so it is safe to expose to the
-- frontend roles. Without this grant, the tag-relationship graph view at
-- /resources renders 403 (PostgREST "permission denied for function").
--
-- Bug report: docs/bugreports/2026-05-04-queerguide-resources.md (P0-1).

GRANT EXECUTE ON FUNCTION public.get_tag_graph_data(double precision, uuid)
  TO anon, authenticated;
