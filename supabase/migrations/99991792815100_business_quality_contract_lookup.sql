-- A pending-review lookup must resolve the entity key, not scan the queue for
-- each archived profile. Both original pending-review protections remain.
create index review_queue_pending_entity_lookup_idx on public.review_queue(entity_type,entity_id)where status='pending';
do $patch$
declare src text;old_guard text:=$old$
  and not exists(select 1 from public.review_queue q where q.status='pending'and(
   (q.entity_type='organization'and q.entity_id=o.id)or(q.entity_type='venue'and q.entity_id in(
    select x.id from public.venues x where x.organization_id=o.id))))
$old$;new_guard text:=$new$
  and not exists(select 1 from public.review_queue q
   where q.status='pending'and q.entity_type='organization'and q.entity_id=o.id)
  and not exists(select 1 from public.venues x join public.review_queue q
   on q.entity_type='venue'and q.entity_id=x.id and q.status='pending'
   where x.organization_id=o.id)
$new$;
begin
 old_guard:=btrim(old_guard,chr(10));new_guard:=btrim(new_guard,chr(10));
 src:=pg_get_functiondef('public.archived_business_completeness_scope(uuid)'::regprocedure);
 if(length(src)-length(replace(src,old_guard,'')))/length(old_guard)<>1 then raise exception 'Archive review guard changed';end if;
 execute replace(src,old_guard,new_guard);
 src:=pg_get_functiondef('public.refresh_business_brand_quality()'::regprocedure);
 if(length(src)-length(replace(src,'with org as (','')))/length('with org as (')<>1 then raise exception 'Organization assessment CTE changed';end if;
 execute replace(src,'with org as (','with org as materialized (');
end $patch$;

