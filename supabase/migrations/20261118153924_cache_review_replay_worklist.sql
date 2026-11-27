-- Cache the active worklist once; preserve every candidate and proof predicate.
-- The prior plan rescanned/toasted the same worklist for each staging row.
do $patch$
declare definition text:=pg_get_functiondef('api_private.reconcile_audited_publisher_replays(integer,boolean)'::regprocedure);
 anchor text:=$anchor$with audited as materialized ($anchor$;
 replacement text:=$replacement$with worklist as materialized (
   select * from public.admin_review_cases where active and item->>'queue_type'='staging'
  ), audited as materialized ($replacement$;
 from_anchor text:=E'from public.admin_review_cases w\n';
begin
 if position(replacement in definition)>0 and position(E'from worklist w\n'in definition)>0 then return;end if;
 if(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 or(length(definition)-length(replace(definition,from_anchor,'')))/length(from_anchor)<>1
 then raise exception 'Audited replay selector changed';end if;
 definition:=replace(definition,anchor,replacement);
 definition:=replace(definition,from_anchor,E'from worklist w\n');
 execute definition;
end $patch$;
