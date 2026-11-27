-- A terminated edge isolate cannot call finish(). After the last lease expires,
-- move that job to visible human review rather than leaving it stuck forever.
create or replace function public.logo_quality_claim(p_table text default 'all',p_limit integer default 4)
returns setof public.logo_quality_jobs language sql security invoker set search_path='' as $$
 with exhausted as (
   update public.logo_quality_jobs set status='review',reason='processing_budget_exhausted',checked_at=now(),updated_at=now()
   where status='processing' and attempts>=3 and updated_at<now()-interval '10 minutes'
   returning *
 ) insert into public.review_queue(entity_type,entity_id,review_type,details)
 select case entity_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end,
   entity_id,'logo_quality',jsonb_build_object('title',entity_name,'field','logo_url','current_url',expected_url,
     'candidate_url',candidate_url,'website',expected_website,'reason','processing_budget_exhausted','requires_human_review',true,'evidence',evidence)
 from exhausted e where not exists(select 1 from public.review_queue r where r.entity_id=e.entity_id and r.review_type='logo_quality' and r.status in ('pending','open','pending_review','review'));

 with picked as (
   select entity_table,entity_id from public.logo_quality_jobs
   where (p_table='all' or entity_table=p_table) and attempts<3
     and (status='pending' or (status='retry' and updated_at<now()-interval '1 minute')
       or (status='processing' and updated_at<now()-interval '10 minutes'))
   order by attempts,updated_at,entity_table,entity_id
   for update skip locked limit greatest(1,least(p_limit,4))
 ) update public.logo_quality_jobs j set status='processing',lease=gen_random_uuid(),attempts=attempts+1,updated_at=now()
 from picked p where j.entity_table=p.entity_table and j.entity_id=p.entity_id returning j.*;
$$;
revoke all on function public.logo_quality_claim(text,integer) from public,anon,authenticated;
grant execute on function public.logo_quality_claim(text,integer) to service_role;
