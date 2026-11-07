-- Only materialize the ID, primary image and update time. Keep the lease,
-- two-sided sample, URL safety check and candidate ordering.
CREATE OR REPLACE FUNCTION public.claim_event_image_quality_candidates(p_claim_token uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(event_id uuid, image_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_token uuid; v_anchor uuid := gen_random_uuid();
begin
  insert into public.event_quality_worker_leases(worker,lease_token,lease_until,claimed_at)
  values('event-image-quality',p_claim_token,now()+interval '10 minutes',now())
  on conflict(worker) do update set lease_token=excluded.lease_token,
    lease_until=excluded.lease_until,claimed_at=excluded.claimed_at
  where public.event_quality_worker_leases.lease_until<now()
  returning lease_token into v_token;
  if v_token is distinct from p_claim_token then return; end if;

  return query
  with pool as materialized (
    (select id, images[1] as candidate_url, updated_at from public.events where id>=v_anchor and duplicate_of_id is null
      and cardinality(coalesce(images,'{}'::text[]))>0 order by id limit 500)
    union all
    (select id, images[1] as candidate_url, updated_at from public.events where id<v_anchor and duplicate_of_id is null
      and cardinality(coalesce(images,'{}'::text[]))>0 order by id limit 500)
  )
  select e.id,e.candidate_url
  from pool e
  left join public.event_image_quality_observations o
    on o.event_id=e.id and o.image_url=e.candidate_url
  where public.event_quality_url_is_safe(e.candidate_url)
    and (o.event_id is null or o.checked_at<greatest(e.updated_at,now()-interval '30 days'))
  order by (o.event_id is null) desc,o.checked_at nulls first,e.updated_at desc,e.id
  limit greatest(0,least(p_limit,100));
end;
$function$
