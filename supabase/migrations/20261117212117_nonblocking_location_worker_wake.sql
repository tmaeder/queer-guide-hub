-- Waking a debounced worker must not block the profile/job write that queued it.
-- A locked global lease already has an owner; the 50-second cron retries pending jobs.
do $migration$
declare definition text; previous text:=$old$ update entity_location_worker_lease set dispatched_at=now()
   where id and until_at<=now() and dispatched_at<now()-interval '60 seconds';$old$;
replacement text:=$new$ with ready as (
   select id from public.entity_location_worker_lease
   where id and until_at<=now() and dispatched_at<now()-interval '60 seconds'
   for update skip locked
 )
 update public.entity_location_worker_lease l set dispatched_at=now()
 from ready r where l.id=r.id;$new$;
begin
 select pg_get_functiondef('public.wake_entity_location_worker()'::regprocedure) into definition;
 if position(replacement in definition)>0 then return;end if;
 if position(previous in definition)=0 then raise exception 'Unexpected location wake function; inspect before replacing';end if;
 execute replace(definition,previous,replacement);
end $migration$;
