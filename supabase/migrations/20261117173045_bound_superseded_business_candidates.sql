-- Recovered from the already-applied production migration history.
-- Version: 20261117173045; recorded statement MD5: ca43d7b90260207942ebf443b75f712b
-- History recovery only: do not replay or renumber this migration.
-- BEGIN RECORDED SQL
-- Materialize valid merged profiles before probing their open findings.
-- The old ordered LIMIT plan probed ~117k organizations before the duplicate
-- join, timing out even with no eligible work. Reuse the existing duplicate
-- index; preserve eligibility, ordering, batch cap, locks, audits and ACLs.
do $patch$
declare
 definition text:=pg_get_functiondef('public.reconcile_superseded_business_findings(integer,boolean)'::regprocedure);
 old_query text:=$old$select o.id from public.organizations o join public.organizations c on c.id=o.duplicate_of_id
  where c.duplicate_of_id is null and c.id<>o.id
   and exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=o.id
    and f.state in ('fail','pending') and f.waived_at is null)
  order by o.id limit greatest(0,least(coalesce(p_batch,500),2000))$old$;
 new_query text:=$new$with superseded as materialized (
   select o.id from public.organizations o
   join public.organizations c on c.id=o.duplicate_of_id
   where o.duplicate_of_id is not null and c.duplicate_of_id is null and c.id<>o.id
  )
  select s.id from superseded s
  where exists(select 1 from public.entity_quality_findings f where f.entity_type='organization' and f.entity_id=s.id
   and f.state in ('fail','pending') and f.waived_at is null)
  order by s.id limit greatest(0,least(coalesce(p_batch,500),2000))$new$;
begin
 if (length(definition)-length(replace(definition,old_query,'')))/length(old_query)<>1 then
  raise exception 'Superseded finding candidate query changed';
 end if;
 execute replace(definition,old_query,new_query);
end $patch$;
;
