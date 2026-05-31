-- The index/rebuild/sync helpers are SECURITY DEFINER internals (triggers + operator use only).
-- Revoke the default PUBLIC execute so anon/authenticated cannot call them via PostgREST
-- (notably search_documents_rebuild(), which would be a DoS vector). Triggers still fire
-- regardless of grants; operators use service_role.
revoke all on function public.search_documents_index_venues(uuid) from public, anon, authenticated;
revoke all on function public.search_documents_index_events(uuid)  from public, anon, authenticated;
revoke all on function public.search_documents_rebuild()           from public, anon, authenticated;
revoke all on function public.search_documents_sync()              from public, anon, authenticated;

grant execute on function public.search_documents_index_venues(uuid) to service_role;
grant execute on function public.search_documents_index_events(uuid)  to service_role;
grant execute on function public.search_documents_rebuild()           to service_role;
