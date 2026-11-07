-- The news quality worker used to scan pending staging rows from every domain,
-- even with no eligible news. Keep the eligibility and ordering in a narrow
-- partial index. Prebuild the identical index CONCURRENTLY on a live database.
create index if not exists ingestion_staging_news_quality_due_idx
  on public.ingestion_staging ((enriched_data->'quality_attempts') asc nulls first, created_at, id)
  include (pipeline_run_id)
  where target_table = 'news_articles'
    and enrichment_status in ('enriched', 'completed', 'failed')
    and disposition = 'pending'
    and dedup_status <> 'duplicate'
    and enriched_data->>'quality_status' is null;

-- Keep the constants inside SQL so a generic PostgREST plan can use the
-- partial index. The caller gets the same columns as the legacy direct query.
create function public.news_quality_enhance_candidates(p_pipeline_run_id uuid, p_limit integer)
returns table(id uuid, normalized_data jsonb, enriched_data jsonb)
language sql stable security invoker
set search_path = ''
as $$
  select s.id, s.normalized_data, s.enriched_data
  from public.ingestion_staging s
  where s.target_table = 'news_articles'
    and s.enrichment_status in ('enriched', 'completed', 'failed')
    and s.disposition = 'pending'
    and s.dedup_status <> 'duplicate'
    and s.enriched_data->>'quality_status' is null
    and (p_pipeline_run_id is null or s.pipeline_run_id = p_pipeline_run_id)
  order by s.enriched_data->'quality_attempts' asc nulls first, s.created_at, s.id
  limit greatest(1, least(coalesce(p_limit, 24), 60));
$$;

revoke all on function public.news_quality_enhance_candidates(uuid, integer) from public, anon, authenticated;
grant execute on function public.news_quality_enhance_candidates(uuid, integer) to service_role;
