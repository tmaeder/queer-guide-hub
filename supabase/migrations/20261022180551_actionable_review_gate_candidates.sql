-- Select actionable review verdicts before applying the batch limit. Unchanged
-- human-review/no-verdict news rows remain pending; they cannot block ready work.
-- This reads candidates only. The existing edge gate retains every decision check.
create function public.pipeline_review_gate_candidates(
 p_batch_size integer default 50,p_entity_type text default null,p_pipeline_run_id uuid default null,
 p_sweep boolean default false,p_force_review boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform public.assert_admin_or_internal();
 select coalesce(jsonb_agg(payload order by priority,created_at,id),'[]'::jsonb) into result from (
  select s.id,s.created_at,
   case when s.enriched_data->>'quality_status'='rejected'
     or (nullif(s.enriched_data->>'quality_status','') is not null and s.enriched_data->>'auto_publish'='true') then 0 else 1 end priority,
   jsonb_build_object('id',s.id,'ai_confidence_score',s.ai_confidence_score,'ai_validation_status',s.ai_validation_status,
    'review_status',s.review_status,'enriched_data',s.enriched_data,'target_table',s.target_table,
    'source_name',s.source_name,'entity_type',s.entity_type) payload
  from public.ingestion_staging s
  left join public.source_reliability reliability on reliability.source_slug=s.source_name and reliability.entity_type=s.entity_type
  where s.ai_validation_status='approved' and s.disposition='pending'
   and (s.review_status='pending_review' or (not p_sweep and s.review_status='auto'))
   and (p_entity_type is null or s.entity_type=p_entity_type)
   and (p_sweep or p_pipeline_run_id is null or s.pipeline_run_id=p_pipeline_run_id)
   and (s.target_table is distinct from 'news_articles' or s.review_status='auto'
    or s.enriched_data->>'quality_status'='rejected'
    or (not p_force_review and nullif(s.enriched_data->>'quality_status','') is not null
      and s.enriched_data->>'auto_publish'='true' and coalesce(reliability.weight,1)>=0.40))
  order by priority,s.created_at,s.id
  limit greatest(0,least(coalesce(p_batch_size,50),2000))
 ) candidates;
 return result;
end $$;
revoke all on function public.pipeline_review_gate_candidates(integer,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.pipeline_review_gate_candidates(integer,text,uuid,boolean,boolean) to service_role;
