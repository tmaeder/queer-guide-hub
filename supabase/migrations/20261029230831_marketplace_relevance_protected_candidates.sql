-- Filter protected staff decisions before LIMIT, and recheck at application so
-- a human decision arriving during inference cannot be overwritten.
create index admin_review_decisions_staging_staff on public.admin_review_decisions(item_id) where queue_key='staging' and actor_kind='staff';
create function public.marketplace_relevance_candidates(p_limit integer default 25,p_pipeline_run_id uuid default null,p_source_names text[] default '{}',p_jev_only boolean default false,p_newest boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user) not in ('service_role','postgres') then
  raise exception 'Service actor required' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(candidate)-'created_at' order by case when p_newest then candidate.created_at end desc,case when not p_newest then candidate.created_at end asc,candidate.id),'[]'::jsonb) into result from (
  select s.id,s.entity_type,s.source_name,s.normalized_data,s.updated_at,s.created_at,
   jsonb_strip_nulls(jsonb_build_object('title',s.raw_data->'title','name',s.raw_data->'name','summary',s.raw_data->'summary',
    'content',s.raw_data->'content','body',s.raw_data->'body','description',s.raw_data->'description','excerpt',s.raw_data->'excerpt')) raw_data
  from public.ingestion_staging s where s.target_table='marketplace_listings' and s.disposition='pending'
   and s.ai_validation_status='approved' and s.classification_result is null
   and s.dedup_status in('pending','unique','merge_candidate')
   and (p_pipeline_run_id is null or s.pipeline_run_id=p_pipeline_run_id)
   and (coalesce(cardinality(p_source_names),0)=0 or s.source_name=any(p_source_names))
   and (not coalesce(p_jev_only,false) or s.source_name in('ohmyfantasy','autostraddle'))
   and not exists(select 1 from public.admin_review_decisions d where d.queue_key='staging' and d.item_id=s.id and d.actor_kind='staff')
  order by case when p_newest then s.created_at end desc,case when not p_newest then s.created_at end asc,s.id
  limit greatest(0,least(coalesce(p_limit,25),100))
 ) candidate;
 return result;
end $$;
revoke all on function public.marketplace_relevance_candidates(integer,uuid,text[],boolean,boolean) from public,anon,authenticated;
grant execute on function public.marketplace_relevance_candidates(integer,uuid,text[],boolean,boolean) to service_role;
do $$
declare definition text;anchor text;replacement text;
begin
 definition:=pg_get_functiondef('public.record_marketplace_relevance(uuid,timestamp with time zone,jsonb,text)'::regprocedure);
 anchor:=$old$and disposition='pending' and classification_result is null$old$;
 replacement:=anchor||$new$
  and not exists(select 1 from public.admin_review_decisions d where d.queue_key='staging' and d.item_id=p_staging_id and d.actor_kind='staff')$new$;
 if position(replacement in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Protected classification apply anchor changed';end if;
  execute replace(definition,anchor,replacement);
 end if;
end $$;
