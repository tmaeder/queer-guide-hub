-- Safety layer hardening: lock down the include_gated escalation on the
-- worker-only discovery RPCs.
--
-- search_hybrid / search_facets / search_autocomplete / get_recommendations /
-- related_entities gate high-risk-country content behind an include_gated flag
-- (p_filters.include_gated or p_include_gated) that the search-proxy / assistant
-- workers set ONLY after verifying the caller's Supabase JWT. But these functions
-- carried the default EXECUTE-to-PUBLIC grant, so an anonymous client could call
-- them directly via PostgREST with include_gated=true and enumerate gated content
-- — bypassing the gate.
--
-- The frontend never calls these RPCs directly (it goes through the workers, which
-- use the service key), so revoke EXECUTE from PUBLIC + anon and re-grant only to
-- authenticated (entitled to gated content) and service_role (the workers). RLS on
-- the entity tables and the SECURITY-INVOKER search_events are unaffected;
-- rpc_venues_ranked stays anon-callable (it gates on auth.uid(), not a param).

revoke execute on function public.search_hybrid(text, vector, text[], jsonb, double precision, double precision, double precision, timestamptz, integer, integer, timestamptz, timestamptz, numeric, numeric, text) from public, anon;
grant  execute on function public.search_hybrid(text, vector, text[], jsonb, double precision, double precision, double precision, timestamptz, integer, integer, timestamptz, timestamptz, numeric, numeric, text) to authenticated, service_role;

revoke execute on function public.search_facets(text, text[], jsonb, double precision, double precision, double precision, timestamptz) from public, anon;
grant  execute on function public.search_facets(text, text[], jsonb, double precision, double precision, double precision, timestamptz) to authenticated, service_role;

revoke execute on function public.search_autocomplete(text, text[], integer, timestamptz, boolean) from public, anon;
grant  execute on function public.search_autocomplete(text, text[], integer, timestamptz, boolean) to authenticated, service_role;

revoke execute on function public.get_recommendations(vector, text[], text, double precision, double precision, double precision, uuid[], timestamptz, integer, boolean) from public, anon;
grant  execute on function public.get_recommendations(vector, text[], text, double precision, double precision, double precision, uuid[], timestamptz, integer, boolean) to authenticated, service_role;

revoke execute on function public.related_entities(text, uuid, text[], boolean, integer, timestamptz, boolean) from public, anon;
grant  execute on function public.related_entities(text, uuid, text[], boolean, integer, timestamptz, boolean) to authenticated, service_role;
