-- Propagate the already-required publisher set onto event_sources so its
-- source_slug index can be used before JSON payload and human-history probes.
do $patch$
declare definition text:=pg_get_functiondef('api_private.reconcile_calendar_sibling_dates(integer,boolean)'::regprocedure);
 anchor text:='and s.source_entity_id=e.external_id and s.is_primary';
 replacement text:=E'and s.source_entity_id=e.external_id and s.is_primary\n        and s.source_slug in (''bka-theater'',''lab-oratory'')';
begin
 if position(replacement in definition)>0 then return;end if;
 if position('where e.data_source in (''bka-theater'',''lab-oratory'')'in definition)=0
 or position('s.source_slug=e.data_source'in definition)=0
 or(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Calendar publisher eligibility changed';end if;
 execute replace(definition,anchor,replacement);
end $patch$;
