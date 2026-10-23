-- 99991792712263_event_image_targeted_rechecks
--
-- Recheck a bounded set after correcting an image-role rule, using the same
-- exclusive worker lease as the ordinary random worklist. No observations or
-- quality findings are changed by claiming work.
create function public.claim_event_image_quality_rechecks(p_claim_token uuid,p_event_ids uuid[],p_limit integer default 25)
returns table(event_id uuid,image_url text)
language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_token uuid;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic rechecks require an internal actor'; end if;
 if coalesce(cardinality(p_event_ids),0)>100 then raise exception 'At most 100 event IDs per recheck' using errcode='22023'; end if;
 if coalesce(cardinality(p_event_ids),0)=0 or coalesce(p_limit,0)<=0 then return; end if;
 insert into public.event_quality_worker_leases(worker,lease_token,lease_until,claimed_at)
 values('event-image-quality',p_claim_token,now()+interval '10 minutes',now())
 on conflict(worker) do update set lease_token=excluded.lease_token,
  lease_until=excluded.lease_until,claimed_at=excluded.claimed_at
 where public.event_quality_worker_leases.lease_until<now()
 returning lease_token into v_token;
 if v_token is distinct from p_claim_token then return; end if;
 return query select e.id,e.images[1] from public.events e
 where e.id=any(p_event_ids) and e.duplicate_of_id is null
  and coalesce(e.status,'active') not in('archived','rejected','cancelled')
  and cardinality(coalesce(e.images,'{}'::text[]))>0
  and public.event_quality_url_is_safe(e.images[1])
 order by e.id limit greatest(0,least(coalesce(p_limit,25),100));
end $fn$;
revoke all on function public.claim_event_image_quality_rechecks(uuid,uuid[],integer) from public,anon,authenticated;
grant execute on function public.claim_event_image_quality_rechecks(uuid,uuid[],integer) to service_role;

