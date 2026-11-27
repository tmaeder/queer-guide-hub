-- Read exact pre-cleanup text for a corrected cleaner. The worker only reuses a
-- field when its current value still matches the earlier cleanup output.
create or replace function public.news_text_cleanup_sources(p_ids uuid[], p_version text)
returns table(article_id uuid, original jsonb, cleaned jsonb)
language sql stable security invoker set search_path = '' as $$
  select b.article_id,b.original,b.cleaned from api_private.news_text_cleanup_backups b
  where b.article_id=any(p_ids) and b.version=p_version;
$$;
revoke all on function public.news_text_cleanup_sources(uuid[],text) from public,anon,authenticated;
grant execute on function public.news_text_cleanup_sources(uuid[],text) to service_role;
