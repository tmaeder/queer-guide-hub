-- CTR: back-fill search_queries.clicked_entity_id when a user clicks a result.
-- The search-proxy worker logs each search via log_search() but never recorded
-- clicks, so clicked_entity_id was always null (CTR = 0). This RPC attaches a
-- click to the most recent search in the same session (30-min window), which the
-- worker's /track click handler calls fire-and-forget.
create or replace function public.log_search_click(
  p_session_id text,
  p_entity_type text,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null or p_entity_id is null then
    return;
  end if;
  update public.search_queries sq
  set clicked_entity_type = p_entity_type,
      clicked_entity_id = p_entity_id
  where sq.id = (
    select id from public.search_queries
    where session_id = p_session_id
      and clicked_entity_id is null
      and created_at > now() - interval '30 minutes'
    order by created_at desc
    limit 1
  );
end $$;

revoke all on function public.log_search_click(text, text, text) from public;
grant execute on function public.log_search_click(text, text, text) to service_role;
